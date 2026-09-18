import { AUTH_TIER_TTL_MS, TtlCache } from "./cache.js";

export type AllowedHost = "api.splinterlands.com" | "vapi.splinterlands.com" | "prices.splinterlands.com";

export type OutcomeKind =
  | "upstream_malformed"
  | "upstream_error"
  | "endpoint_requires_auth"
  | "upstream_blocked"
  | "upstream_unavailable"
  | "response_too_large"
  | "refusal_would_fan_out";

export type Freshness = {
  retrievedAt: string;
  ageMs: number;
};

export type UpstreamOutcome = {
  ok: false;
  kind: OutcomeKind;
  message: string;
  endpoint: string;
  traceId: string;
  freshness: Freshness;
  status?: number;
  possibleAuthChange?: boolean;
};

export type FreshSuccess<Value> = {
  ok: true;
  data: Value;
  endpoint: string;
  traceId: string;
  freshness: Freshness;
};

export type HttpResult<Value> = FreshSuccess<Value> | UpstreamOutcome;

export type CircuitState = {
  consecutiveFailures: number;
  openUntil: number;
};

export const BREAKER_FAILURE_LIMIT = 5;
export const BREAKER_OPEN_MS = 60 * 1000;
export const BLOCK_WINDOW_MS = 5 * 60 * 1000;

export function newTraceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function freshness(now: number, retrievedAt = now): Freshness {
  return { retrievedAt: new Date(retrievedAt).toISOString(), ageMs: Math.max(0, now - retrievedAt) };
}

export class CircuitBreaker {
  private readonly states = new Map<AllowedHost, CircuitState>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  canRequest(host: AllowedHost): boolean {
    const state = this.states.get(host);
    if (state === undefined || state.openUntil <= this.now()) {
      if (state !== undefined && state.openUntil <= this.now()) {
        this.states.delete(host);
      }
      return true;
    }
    return false;
  }

  recordFailure(host: AllowedHost): void {
    const current = this.states.get(host) ?? { consecutiveFailures: 0, openUntil: 0 };
    const consecutiveFailures = current.consecutiveFailures + 1;
    this.states.set(host, {
      consecutiveFailures,
      openUntil: consecutiveFailures >= BREAKER_FAILURE_LIMIT ? this.now() + BREAKER_OPEN_MS : 0,
    });
  }

  recordSuccess(host: AllowedHost): void {
    this.states.delete(host);
  }

  tripAll(): void {
    const openUntil = this.now() + BREAKER_OPEN_MS;
    for (const host of ["api.splinterlands.com", "vapi.splinterlands.com", "prices.splinterlands.com"] as const) {
      this.states.set(host, { consecutiveFailures: BREAKER_FAILURE_LIMIT, openUntil });
    }
  }

  state(host: AllowedHost): CircuitState {
    return { ...(this.states.get(host) ?? { consecutiveFailures: 0, openUntil: 0 }) };
  }
}

type BlockEvent = { endpoint: string; host: AllowedHost; occurredAt: number };

export class BlockTracker {
  private readonly events: BlockEvent[] = [];
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  record(endpoint: string, host: AllowedHost): { endpoints: number; hosts: number } {
    const cutoff = this.now() - BLOCK_WINDOW_MS;
    this.events.push({ endpoint, host, occurredAt: this.now() });
    while (this.events[0] !== undefined && this.events[0].occurredAt < cutoff) {
      this.events.shift();
    }
    return {
      endpoints: new Set(this.events.map((event) => event.endpoint)).size,
      hosts: new Set(this.events.map((event) => event.host)).size,
    };
  }
}

type AuthTier = { measuredAt: number };

export type ClassificationOptions = {
  status: number;
  host: AllowedHost;
  endpoint: string;
  requestEndpoint?: string;
  body: unknown;
  isJson?: boolean;
  traceId?: string;
  now?: number;
  retrievedAt?: number;
  authCache?: TtlCache<AuthTier>;
  authCacheKey?: string;
  blockTracker?: BlockTracker;
  breaker?: CircuitBreaker;
  validate?: (body: unknown) => boolean;
  malformed?: boolean;
};

function base(options: ClassificationOptions, kind: OutcomeKind, message: string): UpstreamOutcome {
  const current = options.now ?? Date.now();
  return {
    ok: false,
    kind,
    message,
    endpoint: options.endpoint,
    traceId: options.traceId ?? newTraceId(),
    freshness: freshness(current, options.retrievedAt),
    status: options.status,
  };
}

/**
 * The one definition of "the upstream answered, and the answer holds no record".
 *
 * Shared by the result-contract validator and by the tools, so that a shape this
 * recognises can never be classified as malformed by one and as empty by the other.
 * Every accepted shape is one this repository has observed:
 * an empty top-level array, a VAPI envelope whose `data` is an empty array or null,
 * and a VAPI envelope carrying `status` with no `data` key at all — the shape a
 * plot that does not exist returned on 2026-09-05
 * (`library/observations/by-plot-2026-09-04.md`).
 */
export function isEmptyResult(body: unknown): boolean {
  if (body === null || body === undefined) {
    return true;
  }
  if (Array.isArray(body)) {
    return body.length === 0;
  }
  if (typeof body !== "object") {
    return false;
  }
  if (!("data" in body)) {
    return "status" in body;
  }
  const data = (body as { data: unknown }).data;
  return data === null || (Array.isArray(data) && data.length === 0);
}


function hasNestedUpstreamError(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !("data" in body)) {
    return false;
  }
  const data = body.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }
  return ("name" in data && data.name === "AppException")
    || ("status" in data && typeof data.status === "number" && data.status >= 400);
}

function topLevelUpstreamError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body) || "data" in body) {
    return undefined;
  }
  const error = (body as Record<string, unknown>).error;
  return typeof error === "string" ? error : undefined;
}

export function classifyResponse(options: ClassificationOptions): HttpResult<unknown> {
  const traceId = options.traceId ?? newTraceId();
  if (options.status === 401) {
    const current = options.now ?? Date.now();
    const cache = options.authCache;
    const key = options.authCacheKey ?? `${options.host}${(options.requestEndpoint ?? options.endpoint).split("?", 1)[0]}`;
    const cached = cache?.get(key);
    const measuredAt = cached?.measuredAt ?? current;
    cache?.set(key, { measuredAt }, AUTH_TIER_TTL_MS);
    return {
      ...base(options, "endpoint_requires_auth", `This endpoint now requires a Splinterlands login. ${options.endpoint} returned 401. Splinterlands has changed its access requirements. This server is read-only and holds no credentials by design, so it cannot call it. Other endpoints are unaffected; use the endpoint list to see current access tiers.`),
      traceId,
      freshness: freshness(current, options.retrievedAt ?? measuredAt),
    };
  }

  if (options.status === 403) {
    const isJson = options.isJson ?? typeof options.body === "object";
    const signals = options.blockTracker?.record(options.requestEndpoint ?? options.endpoint, options.host) ?? { endpoints: 1, hosts: 1 };
    const signal = !isJson
      ? "a non-JSON body"
      : signals.hosts >= 2
        ? "multiple approved API hosts returning 403"
        : signals.endpoints >= 2
          ? `${signals.endpoints} endpoints returning 403 within five minutes`
          : "a JSON error body from one endpoint";
    options.breaker?.tripAll();
    const outcome = base(options, "upstream_blocked", `Splinterlands appears to be refusing requests from this machine. ${options.endpoint} returned 403 with ${signal}. This concerns traffic from your network, not your account. The server will stop making requests for 60 seconds and then try again.`);
    outcome.traceId = traceId;
    outcome.possibleAuthChange = isJson && signals.endpoints === 1 && signals.hosts === 1 && options.host === "vapi.splinterlands.com";
    if (outcome.possibleAuthChange) {
      outcome.message += " The endpoint's access requirement may have changed.";
    }
    return outcome;
  }

  if (options.status < 200 || options.status >= 300) {
    return base(options, "upstream_malformed", `${options.endpoint} returned an unexpected HTTP status (${options.status}).`);
  }
  if (options.malformed === true) {
    return base(options, "upstream_malformed", `${options.endpoint} returned malformed JSON.`);
  }
  const upstreamError = topLevelUpstreamError(options.body);
  if (upstreamError !== undefined) {
    return base(options, "upstream_error", `${options.endpoint} returned an upstream error: ${upstreamError}`);
  }
  if (hasNestedUpstreamError(options.body)) {
    return base(options, "upstream_malformed", `${options.endpoint} returned a nested upstream error inside HTTP ${options.status}.`);
  }
  if (options.validate !== undefined && !options.validate(options.body)) {
    return base(options, "upstream_malformed", `${options.endpoint} returned a response that does not match its expected shape.`);
  }
  return {
    ok: true,
    data: options.body,
    endpoint: options.endpoint,
    traceId,
    freshness: freshness(options.now ?? Date.now(), options.retrievedAt),
  };
}

export function cachedAuthOutcome(
  endpoint: string,
  tier: { measuredAt: number },
  now = Date.now(),
): UpstreamOutcome {
  return {
    ok: false,
    kind: "endpoint_requires_auth",
    message: `This endpoint now requires a Splinterlands login. ${endpoint} returned 401. Splinterlands has changed its access requirements. This server is read-only and holds no credentials by design, so it cannot call it. Other endpoints are unaffected; use the endpoint list to see current access tiers.`,
    endpoint,
    traceId: newTraceId(),
    freshness: freshness(now, tier.measuredAt),
    status: 401,
  };
}
