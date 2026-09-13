import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createServer } from "../src/server.js";
import fixture from "./fixtures/rentals-player.fixture.json" with { type: "json" };

async function rig(body: unknown) {
 const urls: URL[] = [];
 const server = createServer({ fetch: async input => {
  urls.push(new URL(String(input)));
  return new Response(JSON.stringify(body));
 }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
 const client = new Client({ name: "rental-record-test", version: "0.0.0" });
 const [ct, st] = InMemoryTransport.createLinkedPair();
 await server.connect(st); await client.connect(ct);
 return { urls, call: (args: Record<string, unknown>) => client.callTool({ name: "rentals_by_player", arguments: args }),
 close: async () => { await client.close(); await server.close(); } };
}
it("requires player and limit and preserves the captured legacy rental response", async () => {
 const r = await rig(fixture.body);
 try {
  expect((await r.call({ limit: 3 })).isError).toBe(true);
  expect((await r.call({ player: "fixture_account" })).isError).toBe(true);
  expect(r.urls).toHaveLength(0);
  const result = await r.call({ player: "fixture_account", limit: 3, offset: 0 });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toEqual(fixture.body);
  expect(r.urls).toHaveLength(1);
  expect(r.urls[0]!.pathname).toBe("/delegation-rental/rentals/player/fixture_account");
  expect(Object.fromEntries(r.urls[0]!.searchParams)).toEqual({ limit: "3", offset: "0" });
 } finally { await r.close(); }
});
it("bounds rental records and rejects a malformed record beyond the return cap", async () => {
 const rows = Array.from({ length: 120 }, () => ({ ...fixture.body.data[0]! }));
 const r = await rig({ status: "success", data: rows });
 try {
  const result = await r.call({ player: "fixture_account", limit: 100 });
  expect(result.isError).not.toBe(true);
  expect((result.structuredContent as { data: unknown[] }).data).toHaveLength(100);
  expect(r.urls).toHaveLength(1);
 } finally { await r.close(); }
 const malformed = rows.map((row, i) => i === 119 ? { ...row, qty: 150000 } : row);
 const bad = await rig({ status: "success", data: malformed });
 try {
  expect((await bad.call({ player: "fixture_account", limit: 100 })).isError).toBe(true);
 } finally { await bad.close(); }
});
