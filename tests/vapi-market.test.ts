import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
const capture = (label: string) => JSON.parse(readFileSync(new URL(`./fixtures/vapi-market-${label}.fixture.json`, import.meta.url), "utf8")).body;
let client: Client;
let server: ReturnType<typeof createServer>;
afterEach(async () => { await client?.close(); await server?.close(); });
async function connect(fetch: typeof globalThis.fetch) {
  server = createServer({ fetch, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
  client = new Client({ name: "vapi-market-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
}
it("preserves nested envelopes and exact asset selectors on all three public routes", async () => {
  let body: unknown; const urls: URL[] = [];
  await connect(async input => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); });
  for (const [name, label, path, args, query] of [
    ["vapi_market_landing", "landing-packs", "/market/landing", { assets: "PACKS" }, { assets: "PACKS" }],
    ["vapi_market_estimated_price", "price", "/market/estimated-price", { asset: "PACKS", detailId: "ALPHA" }, { asset: "PACKS", detailId: "ALPHA" }],
    ["vapi_market_asset_metadata", "meta-comma", "/market/meta/asset/PACKS", { assetName: "PACKS", detailIds: "ALPHA,BETA" }, { detailIds: "ALPHA,BETA" }]
  ] as const) {
    body = capture(label); const before = urls.length;
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, name).not.toBe(true); expect(result.structuredContent).toEqual(body);
    expect(urls.length - before).toBe(1); expect(urls.at(-1)!.hostname).toBe("vapi.splinterlands.com");
    expect(urls.at(-1)!.pathname).toBe(path); expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(query);
  }
});
it("validates metadata from all thirteen asset categories and a genuine empty selection", () => {
  const predicate = predicateFor(getCatalogueEntry("vapi.market.meta.asset").resultContract);
  for (const label of ["packs", "land", "totems", "titles", "deeds", "land_resources", "totem_items", "totem_fragments", "avatars", "consumables", "music", "skins", "collector_stickers", "json"]) {
    expect(predicate(capture("meta-" + label)), label).toBe(true);
  }
  for (const body of [
    {}, { status: "success", data: {} }, { status: "success", data: [] },
    { ...capture("meta-packs"), data: { ...capture("meta-packs").data, details: [{}] } },
    { ...capture("meta-packs"), data: { ...capture("meta-packs").data, details: [capture("meta-packs").data.details[0], {}] } }
  ]) expect(predicate(body)).toBe(false);
});
it("caps nested lists without changing totals or dropping additional row fields", async () => {
  let body: unknown; let calls = 0;
  await connect(async () => { calls++; return new Response(JSON.stringify(body)); });
  for (const [name, label, field, args] of [
    ["vapi_market_landing", "landing-public", "assets", {}],
    ["vapi_market_asset_metadata", "meta-skins", "details", { assetName: "SKINS" }]
  ] as const) {
    const fixture = capture(label); const row = fixture.data[field][0];
    body = { ...fixture, data: { ...fixture.data, [field]: Array.from({ length: 120 }, () => row) } };
    const before = calls; const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true); expect(calls - before).toBe(1);
    expect(result.structuredContent).toEqual({ ...fixture, data: { ...fixture.data, [field]: Array.from({ length: 100 }, () => row) } });
    expect(result._meta).toMatchObject({ resultLimit: { truncated: true, returnedRows: 100, upstreamRows: 120 } });
  }
});
it("refuses missing selectors and unknown credentials before issuing HTTP", async () => {
  let calls = 0; await connect(async () => { calls++; return new Response("{}"); });
  for (const args of [
    { name: "vapi_market_estimated_price", arguments: {} },
    { name: "vapi_market_estimated_price", arguments: { asset: "PACKS" } },
    { name: "vapi_market_asset_metadata", arguments: {} },
    { name: "vapi_market_landing", arguments: { token: "credential" } }
  ]) expect((await client.callTool(args)).isError).toBe(true);
  expect(calls).toBe(0);
});
it("refuses an oversized complete row instead of returning a partial asset", async () => {
  const body = capture("meta-one"); body.data.details[0].description = "x".repeat(270000);
  await connect(async () => new Response(JSON.stringify(body)));
  const result = await client.callTool({ name: "vapi_market_asset_metadata", arguments: { assetName: "PACKS", detailIds: "ALPHA" } });
  expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ kind: "response_too_large" });
});

it("accepts captured null circulation while rejecting incompatible circulation types", () => {
  for (const [id, label, field, key] of [
    ["vapi.market.landing", "landing-public", "assets", "numCirculation"],
    ["vapi.market.meta.asset", "meta-packs", "details", "circulation"]
  ]) {
    const body = capture(label!); const predicate = predicateFor(getCatalogueEntry(id!).resultContract);
    expect(body.data[field!].some((row: Record<string, unknown>) => row[key!] === null)).toBe(true);
    expect(predicate(body)).toBe(true);
    body.data[field!].at(-1)[key!] = "unknown";
    expect(predicate(body)).toBe(false);
  }
});
