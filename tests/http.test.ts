import { describe, expect, it } from "vitest";
import { TtlCache, AUTH_TIER_TTL_MS } from "../src/http/cache.js";
import {
  BlockTracker,
  CircuitBreaker,
  classifyResponse,
  type AllowedHost,
  type HttpResult,
  type UpstreamOutcome,
} from "../src/http/errors.js";
import {
  SplinterlandsHttpClient,
} from "../src/http/client.js";
import listedFixture from "./fixtures/land-deed-listed.fixture.json" with { type: "json" };
import playerNotFoundFixture from "./fixtures/api-players-details-not-found.fixture.json" with { type: "json" };
import { createTestOnlyCataloguePath, getCatalogueEntry } from "../src/catalogue/index.js";
import { matchesResultContract } from "../src/catalogue/fingerprint.js";
import { withCallScope, registerLogicalRequest } from "../src/http/callscope.js";
import { HostRateLimiter } from "../src/http/ratelimit.js";

const api: AllowedHost = "api.splinterlands.com";
const vapi: AllowedHost = "vapi.splinterlands.com";
const path = createTestOnlyCataloguePath("/test");

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function outcome(result: HttpResult<unknown>): UpstreamOutcome {
  if (result.ok) {
    throw new Error("Expected an upstream outcome");
  }
  return result;
}

describe("per-call request budget", () => {
  /** Injection: make a tool issue a second distinct upstream URL in one call. */
  it("refuses a distinct URL but permits retries of the same URL", async () => {
    await expect(withCallScope("test_tool", async () => {
      registerLogicalRequest("https://api.splinterlands.com/test");
      registerLogicalRequest("https://api.splinterlands.com/test");
      registerLogicalRequest("https://api.splinterlands.com/other");
    })).rejects.toMatchObject({ kind: "refusal_would_fan_out" });
  });

  /** Injection: overlap two tools so a module-global request counter would borrow budget. */
  it("gives concurrent calls independent budgets", async () => {
    const result = await Promise.all([
      withCallScope("first_tool", async () => {
        registerLogicalRequest("https://api.splinterlands.com/first");
        return "first";
      }),
      withCallScope("second_tool", async () => {
        registerLogicalRequest("https://api.splinterlands.com/second");
        return "second";
      }),
    ]);
    expect(result).toEqual(["first", "second"]);
  });

  /** Injection: make the same URL return transient failures so retries can be mistaken for fan-out. */
  it("does not count retries as distinct logical requests", async () => {
    let calls = 0;
    const client = new SplinterlandsHttpClient({
      fetch: async () => {
        calls += 1;
        return calls < 3 ? jsonResponse({ error: "busy" }, 503) : jsonResponse({ value: 1 });
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });
    const result = await withCallScope("retry_tool", () => client.request(api, path));
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });
});

describe("request policy", () => {
  async function expectHostRefused(host: string): Promise<void> {
    let fetchCalls = 0;
    const client = new SplinterlandsHttpClient({
      fetch: async () => {
        fetchCalls += 1;
        return jsonResponse({ value: 1 });
      },
    });

    await expect(client.request(host, path)).rejects.toThrow("fixed allowlist");
    expect(fetchCalls).toBe(0);
  }

  /** Injection: add the host to ALLOWED_HOSTS -> red; fetch must remain untouched. */
  it("refuses an unrelated host before fetch", async () => {
    await expectHostRefused("example.com");
  });

  /** Injection: add the host to ALLOWED_HOSTS -> red; fetch must remain untouched. */
  it("refuses a lookalike host before fetch", async () => {
    await expectHostRefused("api.splinterlands.com.evil.example");
  });

  /** Injection: change method to POST -> red; every retry must still use GET. */
  it("issues only GET requests across a call and its retries", async () => {
    const methods: Array<string | undefined> = [];
    let calls = 0;
    const client = new SplinterlandsHttpClient({
      fetch: async (_input, init) => {
        methods.push(init?.method);
        calls += 1;
        return calls < 3 ? jsonResponse({ error: "busy" }, 503) : jsonResponse({ value: 1 });
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });

    const result = await withCallScope("method_tool", () => client.request(api, path));

    expect(result.ok).toBe(true);
    expect(methods).toEqual(["GET", "GET", "GET"]);
  });
});

describe("streaming response cap", () => {
  /** Injection: remove the cap check + keep chunks.push; a 40 MB synthetic row stream must still stay bounded. */
  it("aborts a 40 MB synthetic row stream at the cap without retaining it", async () => {
    const fixtureBytes = 40 * 1024 * 1024;
    const chunkBytes = 64 * 1024;
    const encoder = new TextEncoder();
    const row = encoder.encode(`${JSON.stringify({ id: 0, value: "x".repeat(1024) })}\n`);
    let producedBytes = 0;
    const before = process.memoryUsage().rss;
    let peakRss = before;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (producedBytes >= fixtureBytes) {
          controller.close();
          return;
        }
        const size = Math.min(chunkBytes, fixtureBytes - producedBytes);
        const chunk = new Uint8Array(size);
        for (let offset = 0; offset < size; offset += row.byteLength) {
          chunk.set(row.subarray(0, Math.min(row.byteLength, size - offset)), offset);
        }
        producedBytes += size;
        controller.enqueue(chunk);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      },
    });
    const client = new SplinterlandsHttpClient({
      fetch: async () => new Response(stream, { headers: { "content-type": "application/json" } }),
    });
    const result = outcome(await client.request(api, path));
    const after = process.memoryUsage().rss;
    expect(result.kind).toBe("response_too_large");
    expect(Math.max(0, Math.max(peakRss, after) - before)).toBeLessThan(32 * 1024 * 1024);
  });

  /** Injection: stream a body beyond the hard cap instead of materialising it. */
  it("returns response_too_large after the byte cap", async () => {
    const client = new SplinterlandsHttpClient({
      responseCapBytes: 20,
      fetch: async () => new Response("123456789012345678901", { headers: { "content-type": "application/json" } }),
    });
    const result = outcome(await client.request(api, path));
    expect(result).toMatchObject({ ok: false, kind: "response_too_large" });
  });
});

describe("distinct upstream outcomes", () => {
  /** Injection: return a valid empty payload, a shape-invalid payload, and a 401. */
  it("keeps successful empty, malformed, and gated distinct", () => {
    const cache = new TtlCache<{ measuredAt: number }>(() => 1000);
    const empty = classifyResponse({ status: 200, host: api, endpoint: "/empty", body: [] });
    const malformed = outcome(classifyResponse({ status: 200, host: api, endpoint: "/bad", body: { error: "bad" }, validate: () => false }));
    const gated = outcome(classifyResponse({ status: 401, host: api, endpoint: "/gated", body: {}, now: 1000, authCache: cache }));
    expect(empty).toMatchObject({ ok: true, data: [] });
    expect(malformed.kind).toBe("upstream_error");
    expect(gated.kind).toBe("endpoint_requires_auth");
    expect(new Set([malformed.message, gated.message]).size).toBe(2);
  });

  it("accepts a matching HTTP 200 body regardless of status value", () => {
    const body = { status: "not-success", data: listedFixture.data };
    const contract = getCatalogueEntry("vapi.land.deeds.by-plot").resultContract;
    const result = classifyResponse({
      status: 200,
      host: vapi,
      endpoint: "/land/deeds/1",
      body,
      validate: (candidate) => matchesResultContract(candidate, contract),
    });

    expect(result).toMatchObject({ ok: true, data: body });
  });

  it("preserves a top-level HTTP-200 upstream error as a distinct outcome", () => {
    const result = outcome(classifyResponse({
      status: 200,
      host: api,
      endpoint: "/players/details",
      body: playerNotFoundFixture.body,
      validate: () => false,
    }));

    expect(result).toMatchObject({ ok: false, kind: "upstream_error", status: 200 });
    expect(result.message).toContain("Player sample-account-missing not found.");
  });

  it("does not treat an upstream body trace id as this request's trace id", () => {
    const result = classifyResponse({
      status: 200,
      host: api,
      endpoint: "/trace-id",
      body: { traceId: "__upstream_trace__" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.traceId).not.toBe("__upstream_trace__");
  });

  it("records receipt time before reading and parsing the response body", async () => {
    let clock = 1000;
    const body = new TextEncoder().encode(JSON.stringify({ value: 1 }));
    const responseBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        clock = 2000;
        controller.enqueue(body);
        controller.close();
      },
    }, { highWaterMark: 0 });
    const client = new SplinterlandsHttpClient({
      now: () => clock,
      fetch: async () => new Response(responseBody, { headers: { "content-type": "application/json" } }),
    });

    const result = await client.request(api, path);

    expect(result).toMatchObject({
      ok: true,
      freshness: { retrievedAt: new Date(1000).toISOString(), ageMs: 1000 },
    });
  });
});

describe("rate limiting", () => {
  it("uses the environment rate and preserves the documented cap", () => {
    expect(new SplinterlandsHttpClient({ env: { SPLINTERLANDS_MCP_RATE: "5" } }).limiter.ratePerSecond).toBe(5);
    expect(new SplinterlandsHttpClient({ env: { SPLINTERLANDS_MCP_RATE: "50" } }).limiter.ratePerSecond).toBe(5);
    expect(new SplinterlandsHttpClient({ env: { SPLINTERLANDS_MCP_RATE: "invalid" } }).limiter.ratePerSecond).toBe(2);
  });

  /** Injection: use a fake clock and 100 calls to expose a bucket with the wrong burst or rate. */
  it("takes at least 48 simulated seconds for 100 calls", async () => {
    let clock = 0;
    const limiter = new HostRateLimiter({
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    });
    for (let index = 0; index < 100; index += 1) {
      await limiter.acquire(api);
    }
    expect(clock).toBeGreaterThanOrEqual(48000);
  });
});

describe("host concurrency", () => {
  /** Injection: hold synthetic fetches open and count active calls to expose an in-flight limit above two. */
  it("never has more than two requests active for one host", async () => {
    let active = 0;
    let peak = 0;
    const resolvers: Array<() => void> = [];
    const client = new SplinterlandsHttpClient({
      fetch: () => new Promise<Response>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        resolvers.push(() => {
          active -= 1;
          resolve(jsonResponse({ value: 1 }));
        });
      }),
    });
    const requests = [0, 1, 2].map(() => client.request(api, path));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(peak).toBe(2);
    resolvers.shift()?.();
    resolvers.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    resolvers.shift()?.();
    await Promise.all(requests);
    expect(peak).toBe(2);
  });
});

describe("auth degradation", () => {
  /** Injection: return 401 for a public endpoint, then advance beyond the 15-minute tier TTL. */
  it("caches 401 without retrying and re-probes after 15 minutes", async () => {
    let clock = 0;
    let calls = 0;
    const client = new SplinterlandsHttpClient({
      now: () => clock,
      fetch: async () => {
        calls += 1;
        return jsonResponse({}, 401);
      },
    });
    const first = outcome(await client.request(api, path));
    const second = outcome(await client.request(api, path));
    clock += AUTH_TIER_TTL_MS + 1;
    const third = outcome(await client.request(api, path));
    expect(first.kind).toBe("endpoint_requires_auth");
    expect(second.kind).toBe("endpoint_requires_auth");
    expect(third.kind).toBe("endpoint_requires_auth");
    expect(calls).toBe(2);
  });
});

describe("block classification", () => {
  /** Injection: return an HTML 403 and then a second endpoint 403 to expose auth misclassification or host-local breaking. */
  it("classifies HTML 403 as blocked and trips both hosts", async () => {
    let calls = 0;
    const client = new SplinterlandsHttpClient({
      fetch: async () => {
        calls += 1;
        return new Response("<html>", { status: 403, headers: { "content-type": "text/html" } });
      },
    });
    const runtime = outcome(await client.request(api, path));
    let clock = 0;
    const tracker = new BlockTracker(() => clock);
    const breaker = new CircuitBreaker(() => clock);
    const first = outcome(classifyResponse({ status: 403, host: api, endpoint: "/one", body: "<html>", isJson: false, now: clock, blockTracker: tracker, breaker }));
    clock += 1000;
    const second = outcome(classifyResponse({ status: 403, host: vapi, endpoint: "/two", body: { message: "blocked" }, isJson: true, now: clock, blockTracker: tracker, breaker }));
    expect(runtime.kind).toBe("upstream_blocked");
    expect(calls).toBe(1);
    expect(first.kind).toBe("upstream_blocked");
    expect(first.message.toLowerCase()).not.toContain("login");
    expect(second.message).toContain("both API hosts");
    expect(breaker.canRequest(api)).toBe(false);
    expect(breaker.canRequest(vapi)).toBe(false);
  });

  /** Injection: force isJson = true -> red; an HTML 403 on one endpoint is not an auth change. */
  it("classifies a one-endpoint HTML 403 as blocked without an auth change", () => {
    const result = outcome(classifyResponse({
      status: 403,
      host: vapi,
      endpoint: "/html-block",
      body: "<html><body>Forbidden</body></html>",
      isJson: false,
      blockTracker: new BlockTracker(() => 0),
    }));

    expect(result.kind).toBe("upstream_blocked");
    expect(result.possibleAuthChange).toBe(false);
    expect(result.message.toLowerCase()).not.toContain("login");
  });

  it("marks a single JSON 403 on one endpoint as a possible auth change", () => {
    const result = outcome(classifyResponse({
      status: 403,
      host: vapi,
      endpoint: "/json-block",
      body: { error: "forbidden" },
      isJson: true,
      blockTracker: new BlockTracker(() => 0),
    }));

    expect(result.kind).toBe("upstream_blocked");
    expect(result.possibleAuthChange).toBe(true);
  });
});

describe("nested upstream errors", () => {
  it("rejects error envelopes before a permissive success validator", () => {
    for (const data of [
      { name: "AppException", message: "synthetic upstream detail" },
      { status: 400 }, { status: 401 }, { status: 403 }, { status: 500 },
    ]) {
      let validated = false;
      const result = outcome(classifyResponse({
        status: 200, host: vapi, endpoint: "/test",
        body: { status: "success", data },
        validate: () => { validated = true; return true; },
      }));
      expect(result).toMatchObject({ kind: "upstream_malformed", status: 200 });
      expect(result.message).toContain("nested upstream error");
      expect(result.message).not.toContain("synthetic upstream detail");
      expect(validated).toBe(false);
    }
  });

  it("preserves ordinary records, empty results and statuses outside the envelope error position", () => {
    for (const body of [
      { status: "success", data: null }, { status: "success", data: [] },
      { status: "success", data: { status: 1 } },
      { status: "success", data: { status: 200 } },
      { status: "success", data: [{ status: 500 }] },
      { status: "success", data: { record: { name: "AppException" } } },
      { status: 500, value: 1 },
    ]) {
      expect(classifyResponse({ status: 200, host: vapi, endpoint: "/test", body }))
        .toMatchObject({ ok: true, data: body });
    }
  });

  it("refuses HTTP 200 wrapped errors without retries or caching an auth downgrade", async () => {
    let calls = 0;
    const client = new SplinterlandsHttpClient({
      fetch: async () => {
        calls++;
        return jsonResponse(calls === 1
          ? { status: "success", data: { name: "AppException", status: 401 } }
          : { status: "success", data: { value: 1 } });
      },
    });
    expect(outcome(await client.request(vapi, path))).toMatchObject({
      kind: "upstream_malformed", status: 200,
    });
    expect(calls).toBe(1);
    expect((await client.request(vapi, path)).ok).toBe(true);
    expect(calls).toBe(2);
  });
});
