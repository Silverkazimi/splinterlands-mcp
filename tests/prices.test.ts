import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { PRICES_TTL_MS } from "../src/http/cache.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/prices-prices.fixture.json", import.meta.url), "utf8")) as { body: Record<string, number> };
let server: ReturnType<typeof createServer> | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

async function connect(fetch: typeof globalThis.fetch, now: () => number = Date.now): Promise<void> {
  server = createServer({ fetch, now, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
  client = new Client({ name: "prices-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
}

it("reads the public price object from the dedicated fixed host", async () => {
  const urls: URL[] = [];
  await connect(async input => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify(fixture.body), { headers: { "content-type": "application/json" } });
  });

  const result = await client!.callTool({ name: "prices_current", arguments: {} });
  expect(result.isError).not.toBe(true);
  expect(urls).toHaveLength(1);
  expect(urls[0]!.protocol).toBe("https:");
  expect(urls[0]!.hostname).toBe("prices.splinterlands.com");
  expect(urls[0]!.pathname).toBe("/prices");
  expect(result.structuredContent).toEqual(fixture.body);
  expect(result._meta).toMatchObject({ provenance: { endpoint: "/prices", freshness: { retrievedAt: expect.any(String) } } });
});

it("caches successes for five minutes and refreshes after expiry", async () => {
  let now = Date.parse("2026-09-18T00:00:00Z");
  let requests = 0;
  await connect(async () => {
    requests += 1;
    return new Response(JSON.stringify(fixture.body), { headers: { "content-type": "application/json" } });
  }, () => now);

  const first = await client!.callTool({ name: "prices_current", arguments: {} });
  now += 1000;
  const hit = await client!.callTool({ name: "prices_current", arguments: {} });
  expect(requests).toBe(1);
  expect(hit.structuredContent).toEqual(first.structuredContent);
  expect(hit._meta).toMatchObject({ provenance: { freshness: { ageMs: 1000 } } });

  now += PRICES_TTL_MS;
  await client!.callTool({ name: "prices_current", arguments: {} });
  expect(requests).toBe(2);
});
