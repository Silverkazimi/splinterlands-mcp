import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "../src/server.js";
import fixture from "./fixtures/api-players-inventory.fixture.json" with { type: "json" };

async function rig(body: unknown) {
 const urls: URL[] = [];
 const server = createServer({ fetch: async input => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); },
  sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
 const client = new Client({ name: "inventory-test", version: "0.0.0" });
 const [ct, st] = InMemoryTransport.createLinkedPair();
 await server.connect(st); await client.connect(ct);
 return { urls, call: (args: Record<string, unknown>) => client.callTool({ name: "player_inventory", arguments: args }),
  close: async () => { await client.close(); await server.close(); } };
}
it("filters a late matching record before output bounds without forwarding the local selector", async () => {
 const rows = Array.from({ length: 150 }, (_, i) => ({ ...fixture.body[0]!, uid: "synthetic-" + i, item_detail_id: i + 1 }));
 const test = await rig(rows);
 try {
  const result = await test.call({ username: "fixture_account", type: "Land", item_detail_id: 150 });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toEqual({ data: [rows[149]], upstream_rows: 150, matched_rows: 1, returned_rows: 1, truncated: false });
  expect(test.urls).toHaveLength(1);
  expect(Object.fromEntries(test.urls[0]!.searchParams)).toEqual({ username: "fixture_account", type: "Land" });
  const all = await test.call({ username: "fixture_account", type: "Land" });
  expect(all.structuredContent).toMatchObject({ upstream_rows: 150, matched_rows: 150, returned_rows: 100, truncated: true });
 } finally { await test.close(); }
});
it("retains mixed Land and Token rows and rejects missing scope before fetching", async () => {
 const test = await rig(fixture.body);
 try {
  for (const args of [{ username: "fixture_account" }, { type: "Land" }, { username: "", type: "Land" }]) {
   expect((await test.call(args)).isError).toBe(true);
  }
  expect(test.urls).toHaveLength(0);
  const result = await test.call({ username: "fixture_account", type: "Land" });
  expect(result.structuredContent).toMatchObject({ data: fixture.body, matched_rows: 2, truncated: false });
  const absent = await test.call({ username: "fixture_account", type: "Land", item_detail_id: 322 });
  expect(absent.structuredContent).toMatchObject({ data: [], upstream_rows: 2, matched_rows: 0, truncated: false });
 } finally { await test.close(); }
});
it("refuses a single oversized matching record and malformed quantity types", async () => {
 for (const [body, kind] of [
  [[{ ...fixture.body[0]!, additional: "x".repeat(270000) }], "response_too_large"],
  [[{ ...fixture.body[0]!, quantity: "1" }], "upstream_malformed"],
 ] as const) {
  const test = await rig(body);
  try {
   const result = await test.call({ username: "fixture_account", type: "Land" });
   expect(result.isError).toBe(true);
   expect(result.structuredContent).toMatchObject({ kind });
  } finally { await test.close(); }
 }
});
