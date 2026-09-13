import { expect, it, vi } from "vitest";
import { SplinterlandsHttpClient } from "../src/http/client.js";
import { createTestOnlyCataloguePath } from "../src/catalogue/index.js";
import { TtlCache } from "../src/http/cache.js";

it("times out a stalled response body, limits retries and releases the host slot", async () => {
  vi.useFakeTimers();
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  let aborted = 0;
  const client = new SplinterlandsHttpClient({
    timeoutMs: 25, sleep: async () => {},
    fetch: async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        streams.push(controller);
        init!.signal!.addEventListener("abort", () => {
          aborted++;
          controller.error(new Error("synthetic timeout"));
        }, { once: true });
      },
    })),
  });
  let settled = false;
  const request = client.request("api.splinterlands.com", createTestOnlyCataloguePath("/test"))
    .then(result => { settled = true; return result; }, () => { settled = true; return null; });
  try {
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(true);
    expect(aborted).toBe(3);
    expect(await request).toMatchObject({ ok: false, kind: "upstream_unavailable" });
    const release = await client.semaphores.acquire("api.splinterlands.com");
    release();
  } finally {
    for (const stream of streams) { try { stream.error(new Error("cleanup")); } catch { /* Stream already closed. */ } }
    await request;
    vi.useRealTimers();
  }
});

it("bounds retained unique cache entries and evicts the least recently used entry", () => {
  const cache = new TtlCache<number>(() => 0);
  for (let i = 0; i < 128; i++) cache.set(String(i), i, 1000);
  expect(cache.get("0")).toBe(0);
  cache.set("128", 128, 1000);
  expect(cache.get("1")).toBeUndefined();
  expect(cache.get("0")).toBe(0);
  expect(cache.get("128")).toBe(128);
});

it("expires entries and reclaims them before evicting still-live cache data", () => {
  let now = 0;
  const cache = new TtlCache<number>(() => now, 2);
  cache.set("live", 1, 100);
  cache.set("short", 2, 10);
  now = 11;
  cache.set("new", 3, 100);
  expect(cache.get("live")).toBe(1);
  expect(cache.get("short")).toBeUndefined();
  expect(cache.get("new")).toBe(3);
  now = 101;
  expect(cache.get("live")).toBeUndefined();
  expect(cache.get("new")).toBe(3);
});

it("identifies requests using the public package metadata", async () => {
  let identity: string | null = null;
  const client = new SplinterlandsHttpClient({ fetch: async (_url, init) => {
    identity = new Headers(init?.headers).get("User-Agent");
    return new Response("{}", { headers: { "content-type": "application/json" } });
  } });
  await client.request("api.splinterlands.com", createTestOnlyCataloguePath("/test"));
  expect(identity).toContain("https://github.com/Silverkazimi/splinterlands-mcp");
  expect(identity).not.toContain("/OWNER/");
});
