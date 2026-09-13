import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "../src/server.js";
import activity from "./fixtures/vapi-market-player-activity.fixture.json" with { type: "json" };
import listings from "./fixtures/vapi-market-player-listings.fixture.json" with { type: "json" };
import allListings from "./fixtures/vapi-market-player-all-listings.fixture.json" with { type: "json" };
import stats from "./fixtures/vapi-market-player-asset-detail-stats.fixture.json" with { type: "json" };

const fixtures: Record<string, unknown> = { activity: activity.body, listings: listings.body, all_listings: allListings.body, "asset-detail-stats": stats.body };
async function rig(override?: unknown) {
 const urls: URL[] = [];
 const server = createServer({ fetch: async input => {
  const url = new URL(String(input)); urls.push(url);
  return new Response(JSON.stringify(override ?? fixtures[url.pathname.split("/").at(-1)!]));
 }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
 const client = new Client({ name: "account-market-test", version: "0.0.0" });
 const [ct, st] = InMemoryTransport.createLinkedPair();
 await server.connect(st); await client.connect(ct);
 return { urls, call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }),
  close: async () => { await client.close(); await server.close(); } };
}
it("calls all four account routes once and preserves captured data and exact selectors", async () => {
 const test = await rig();
 try {
  for (const suffix of Object.keys(fixtures)) {
   const args = suffix === "activity" ? { player: "fixture_account", types: "purchase,sale", sort: "desc", limit: 3, offset: 1 }
    : suffix === "all_listings" ? { player: "fixture_account" } : { player: "fixture_account", asset: "PACKS", detailId: "RIFT" };
   const result = await test.call("vapi_market_player_" + suffix.replaceAll("-", "_"), args);
   expect(result.isError).not.toBe(true);
   expect(result.structuredContent).toEqual(fixtures[suffix]);
   expect(test.urls.at(-1)!.pathname).toBe("/market/player/" + suffix);
   expect(Object.fromEntries(test.urls.at(-1)!.searchParams)).toEqual(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])));
   expect(result._meta).toMatchObject({ provenance: { requestScope: { player: { supplied: true } } } });
  }
  expect(test.urls).toHaveLength(4);
 } finally { await test.close(); }
});
it("refuses missing required market scope before HTTP", async () => {
 const test = await rig();
 try {
  for (const [name, args] of [
   ["vapi_market_player_activity", { player: "fixture_account", types: "sale" }],
   ["vapi_market_player_all_listings", {}],
   ["vapi_market_player_listings", { player: "fixture_account", asset: "PACKS" }],
   ["vapi_market_player_asset_detail_stats", { asset: "PACKS", detailId: "RIFT" }],
  ] as const) expect((await test.call(name, args)).isError).toBe(true);
  expect(test.urls).toHaveLength(0);
 } finally { await test.close(); }
});
it("bounds listings without continuation and rejects malformed later rows", async () => {
 const rows = Array.from({ length: 120 }, (_, i) => ({ ...listings.body.data[0]!, id: i + 1 }));
 const bounded = await rig({ status: "success", data: rows });
 try {
  const result = await bounded.call("vapi_market_player_all_listings", { player: "fixture_account" });
  expect(result._meta).toMatchObject({ resultLimit: { truncated: true, upstreamRows: 120, returnedRows: 100 } });
  expect(bounded.urls).toHaveLength(1);
 } finally { await bounded.close(); }
 const bad = await rig({ status: "success", data: [rows[0], { ...rows[1], quantityRemaining: "1" }] });
 try {
  const result = await bad.call("vapi_market_player_all_listings", { player: "fixture_account" });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ kind: "upstream_malformed" });
 } finally { await bad.close(); }
});
