import { avatarRedirectData, isAvatarRequest } from "./avatar-redirect.js";
import packageInfo from "../../package.json" with { type: "json" };
import {
  BlockTracker,
  cachedAuthOutcome,
  CircuitBreaker,
  classifyResponse,
  newTraceId,
  type AllowedHost,
  type HttpResult,
  type UpstreamOutcome,
} from "./errors.js";
import { TtlCache } from "./cache.js";
import { registerLogicalRequest } from "./callscope.js";
import { HostRateLimiter, type RateLimiterOptions } from "./ratelimit.js";
import { isCataloguePath, type CataloguePath } from "../catalogue/index.js";

export const ALLOWED_HOSTS = ["api.splinterlands.com", "vapi.splinterlands.com", "prices.splinterlands.com"] as const;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 20 * 1000;
const DEFAULT_RESPONSE_CAP = 2 * 1024 * 1024;
const MAX_IN_FLIGHT = 2;

type Semaphore = {
  active: number;
  queue: Array<() => void>;
};

type AuthTier = { measuredAt: number };

export type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  env?: NodeJS.ProcessEnv;
  limiter?: HostRateLimiter;
  limiterOptions?: RateLimiterOptions;
  breaker?: CircuitBreaker;
  blockTracker?: BlockTracker;
  authCache?: TtlCache<AuthTier>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  responseCapBytes?: number;
  version?: string;
  repositoryUrl?: string;
};

export type RequestOptions<Value> = {
  alternativeTool?: string;
  authCacheKey?: string;
  endpointTemplate?: string;
  validate?: (body: unknown) => body is Value;
};

export type StreamingRequestOptions<Value> = {
  endpointTemplate?: string;
  timeoutMs: number;
  consume: (response: Response) => Promise<Value>;
};

function isAllowedHost(value: string): value is AllowedHost {
  return (ALLOWED_HOSTS as readonly string[]).includes(value);
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("json") ?? false;
}

function timeoutError(endpoint: string, now: number): UpstreamOutcome {
  return {
    ok: false,
    kind: "upstream_unavailable",
    message: `${endpoint} did not respond within the request timeout.`,
    endpoint,
    traceId: `timeout-${now.toString(36)}`,
    freshness: { retrievedAt: new Date(now).toISOString(), ageMs: 0 },
  };
}

class HostSemaphore {
  private readonly states = new Map<AllowedHost, Semaphore>();

  async acquire(host: AllowedHost): Promise<() => void> {
    const state = this.states.get(host) ?? { active: 0, queue: [] };
    this.states.set(host, state);
    if (state.active >= MAX_IN_FLIGHT) {
      await new Promise<void>((resolve) => state.queue.push(resolve));
    }
    state.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      state.active -= 1;
      state.queue.shift()?.();
    };
  }

}

async function readBody(response: Response, cap: number): Promise<{ text?: string; tooLarge: boolean; bytes: number }> {
  if (response.body === null) {
    const text = await response.text();
    return text.length > cap ? { tooLarge: true, bytes: text.length } : { text, tooLarge: false, bytes: text.length };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      bytes += result.value.byteLength;
      if (bytes > cap) {
        await reader.cancel("response_too_large");
        return { tooLarge: true, bytes };
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(body), tooLarge: false, bytes };
}

function jitteredBackoff(attempt: number, random: () => number): number {
  const base = 1000 * 2 ** attempt;
  return Math.min(8 * 1000, Math.round(base * (0.5 + random())));
}

export class SplinterlandsHttpClient {
  readonly breaker: CircuitBreaker;
  readonly limiter: HostRateLimiter;
  readonly semaphores = new HostSemaphore();
  readonly authCache: TtlCache<AuthTier>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly blockTracker: BlockTracker;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly responseCapBytes: number;
  private readonly userAgent: string;

  constructor(options: ClientOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.breaker = options.breaker ?? new CircuitBreaker(this.now);
    this.blockTracker = options.blockTracker ?? new BlockTracker(this.now);
    this.authCache = options.authCache ?? new TtlCache<AuthTier>(this.now);
    this.limiter = options.limiter ?? new HostRateLimiter({
      ...(options.limiterOptions ?? {}),
      ...(options.limiterOptions?.env !== undefined || options.env !== undefined
        ? { env: options.limiterOptions?.env ?? options.env }
        : {}),
      now: options.limiterOptions?.now ?? this.now,
      sleep: options.limiterOptions?.sleep ?? this.sleep,
    });
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.responseCapBytes = Math.min(options.responseCapBytes ?? DEFAULT_RESPONSE_CAP, DEFAULT_RESPONSE_CAP);
    const version = options.version ?? packageInfo.version;
    const repositoryUrl = options.repositoryUrl ?? packageInfo.repository.url;
    this.userAgent = `splinterlands-mcp/${version} (+${repositoryUrl})`;
  }

  async request<Value>(host: string, path: CataloguePath, params: Record<string, string | number | boolean> = {}, options: RequestOptions<Value> = {}): Promise<HttpResult<Value>> {
    if (!isAllowedHost(host)) {
      throw new TypeError(`Host is not in the fixed allowlist: ${ALLOWED_HOSTS.join(", ")}`);
    }
    if (!isCataloguePath(path)) {
      throw new TypeError("The caller must pass a catalogue path");
    }
    const url = new URL(path.value, `https://${host}:443`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const requestEndpoint = `${url.pathname}${url.search}`;
    const endpoint = options.endpointTemplate ?? requestEndpoint;
    if (options.alternativeTool === undefined) {
      registerLogicalRequest(url.toString());
    } else {
      registerLogicalRequest(url.toString(), { alternativeTool: options.alternativeTool });
    }
    const authKey = options.authCacheKey ?? `${host}${url.pathname}`;
    const cachedTier = this.authCache.get(authKey);
    if (cachedTier !== undefined) {
      return cachedAuthOutcome(endpoint, cachedTier, this.now()) as HttpResult<Value>;
    }
    if (!this.breaker.canRequest(host)) {
      return this.unavailable(endpoint);
    }
    const release = await this.semaphores.acquire(host);
    try {
      if (!this.breaker.canRequest(host)) {
        return this.unavailable(endpoint);
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!this.breaker.canRequest(host)) {
          return this.unavailable(endpoint);
        }
        await this.limiter.acquire(host);
        const result = await this.fetchAttempt(host, url, endpoint, requestEndpoint, options, attempt, authKey);
        if (result.retry) {
          if (attempt < 2) {
            await this.sleep(jitteredBackoff(attempt, this.random));
            continue;
          }
          return this.unavailable(endpoint);
        }
        return result.value;
      }
      return this.unavailable(endpoint);
    } finally {
      release();
    }
  }

  async requestStreaming<Value>(host: string, path: CataloguePath, params: Record<string, string | number | boolean>, options: StreamingRequestOptions<Value>): Promise<HttpResult<Value>> {
    if (!isAllowedHost(host)) {
      throw new TypeError(`Host is not in the fixed allowlist: ${ALLOWED_HOSTS.join(", ")}`);
    }
    if (!isCataloguePath(path)) {
      throw new TypeError("The caller must pass a catalogue path");
    }
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new RangeError("Streaming timeout must be a positive finite number");
    }
    const url = new URL(path.value, `https://${host}:443`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const requestEndpoint = `${url.pathname}${url.search}`;
    const endpoint = options.endpointTemplate ?? requestEndpoint;
    registerLogicalRequest(url.toString());
    const authKey = `${host}${url.pathname}`;
    const cachedTier = this.authCache.get(authKey);
    if (cachedTier !== undefined) {
      return cachedAuthOutcome(endpoint, cachedTier, this.now()) as HttpResult<Value>;
    }
    if (!this.breaker.canRequest(host)) {
      return this.unavailable(endpoint);
    }
    const release = await this.semaphores.acquire(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      if (!this.breaker.canRequest(host)) {
        return this.unavailable(endpoint);
      }
      await this.limiter.acquire(host);
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method: "GET",
          redirect: "error",
          headers: { Accept: "application/json", "User-Agent": this.userAgent },
          signal: controller.signal,
        });
      } catch {
        this.breaker.recordFailure(host);
        return timeoutError(endpoint, this.now()) as HttpResult<Value>;
      }
      const retrievedAt = this.now();
      if (response.status >= 200 && response.status < 300) {
        try {
          const data = await options.consume(response);
          this.breaker.recordSuccess(host);
          return {
            ok: true,
            data,
            endpoint,
            traceId: newTraceId(),
            freshness: { retrievedAt: new Date(retrievedAt).toISOString(), ageMs: Math.max(0, this.now() - retrievedAt) },
          };
        } catch (error) {
          if (controller.signal.aborted) {
            this.breaker.recordFailure(host);
            return timeoutError(endpoint, this.now()) as HttpResult<Value>;
          }
          const message = error instanceof Error ? error.message : "The response could not be streamed.";
          return {
            ok: false,
            kind: "upstream_malformed",
            message: `${endpoint} returned malformed streamed JSON: ${message}`,
            endpoint,
            traceId: newTraceId(),
            freshness: { retrievedAt: new Date(this.now()).toISOString(), ageMs: 0 },
          };
        }
      }
      const bodyResult = await readBody(response, this.responseCapBytes);
      if (bodyResult.tooLarge) {
        return {
          ok: false,
          kind: "response_too_large",
          message: `${endpoint} exceeded the 2 MB response cap (${bodyResult.bytes} bytes). Use a narrower query.`,
          endpoint,
          traceId: `large-${this.now().toString(36)}`,
          freshness: { retrievedAt: new Date(retrievedAt).toISOString(), ageMs: Math.max(0, this.now() - retrievedAt) },
        } as HttpResult<Value>;
      }
      let body: unknown = bodyResult.text ?? "";
      let json = isJsonContentType(response.headers.get("content-type"));
      if ((bodyResult.text ?? "").trim() !== "") {
        try {
          body = JSON.parse(bodyResult.text ?? "");
          json = true;
        } catch {
          json = false;
        }
      }
      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        this.breaker.recordFailure(host);
      }
      return classifyResponse({
        status: response.status,
        host,
        endpoint,
        requestEndpoint,
        authCacheKey: authKey,
        body,
        isJson: json,
        now: this.now(),
        retrievedAt,
        authCache: this.authCache,
        blockTracker: this.blockTracker,
        breaker: this.breaker,
      }) as HttpResult<Value>;
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  private async fetchAttempt<Value>(host: AllowedHost, url: URL, endpoint: string, requestEndpoint: string, options: RequestOptions<Value>, attempt: number, authCacheKey: string): Promise<{ retry: boolean; value: HttpResult<Value> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let retrievedAt: number;
    let bodyResult: Awaited<ReturnType<typeof readBody>>;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "GET",
        redirect: isAvatarRequest(host, url.pathname) ? "manual" : "error",
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
        signal: controller.signal,
      });
      retrievedAt = this.now();
      bodyResult = await readBody(response, this.responseCapBytes);
    } catch {
      this.breaker.recordFailure(host);
      return { retry: attempt < 2, value: timeoutError(endpoint, this.now()) as HttpResult<Value> };
    } finally {
      clearTimeout(timer);
    }
    if (bodyResult.tooLarge) {
      return {
        retry: false,
        value: {
          ok: false,
          kind: "response_too_large",
          message: `${endpoint} exceeded the 2 MB response cap (${bodyResult.bytes} bytes). Use a narrower query.`,
          endpoint,
          traceId: `large-${this.now().toString(36)}`,
          freshness: { retrievedAt: new Date(retrievedAt).toISOString(), ageMs: Math.max(0, this.now() - retrievedAt) },
        } as HttpResult<Value>,
      };
    }
    let body: unknown = bodyResult.text ?? "";
    let json = isJsonContentType(response.headers.get("content-type"));
    let malformed = false;
    if ((bodyResult.text ?? "").trim() !== "") {
      try {
        body = JSON.parse(bodyResult.text ?? "");
        json = true;
      } catch {
        malformed = response.status >= 200 && response.status < 300;
      }
    }
    if (response.status >= 200 && response.status < 300) {
      this.breaker.recordSuccess(host);
    } else if (response.status >= 500 || response.status === 408 || response.status === 429) {
      this.breaker.recordFailure(host);
    }
    const avatar = isAvatarRequest(host, url.pathname);
    const redirectData = avatar ? avatarRedirectData(response, url) : undefined;
    if (redirectData) {
      body = redirectData;
      json = true;
      malformed = false;
      this.breaker.recordSuccess(host);
    } else if (avatar && (response.status === 302 || (response.status >= 200 && response.status < 300))) {
      malformed = true;
    }
    const classificationOptions = {
      status: redirectData ? 200 : response.status,
      host,
      endpoint,
      requestEndpoint,
      authCacheKey,
      body,
      isJson: json,
      now: this.now(),
      retrievedAt,
      authCache: this.authCache,
      blockTracker: this.blockTracker,
      breaker: this.breaker,
      ...(options.validate === undefined ? {} : { validate: options.validate }),
      ...(malformed ? { malformed: true } : {}),
    };
    const result = classifyResponse(classificationOptions) as HttpResult<Value>;
    return { retry: RETRY_STATUSES.has(response.status), value: result };
  }

  private unavailable(endpoint: string): UpstreamOutcome {
    const now = this.now();
    return {
      ok: false,
      kind: "upstream_unavailable",
      message: `${endpoint} is temporarily unavailable. The server stopped sending requests to the upstream service for 60 seconds after consecutive failures.`,
      endpoint,
      traceId: newTraceId(),
      freshness: { retrievedAt: new Date(now).toISOString(), ageMs: 0 },
    };
  }

}
