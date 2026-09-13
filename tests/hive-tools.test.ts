import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { HermesHiveReader, HIVE_URL } from "../src/hive-reader.js";
import { withCallScope } from "../src/http/callscope.js";
const id = "a".repeat(40);
const cards = ["card-1", "card-2", "card-3"];
const op = (payload: unknown = { cards, to: "recipient" }): [string, Record<string, unknown>] => ["custom_json", { id: "sm_gift_cards", required_auths: ["sampleacct"], required_posting_auths: [], json: JSON.stringify(payload) }];
const tx = (operations = [op()]) => ({ transaction_id: id, block_num: 123, operations, signatures: ["signature"], expiration: "2026-09-13T12:00:00", extensions: [] });
const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
const game = (success = true, result: unknown = { cards }) => new Response(JSON.stringify({ trx_info: { id, block_id: "synthetic-block", prev_block_id: "synthetic-prev", block_num: 123, created_date: "2026-09-13T11:00:00.000Z", steem_price: null, sbd_price: null, player: "sampleacct", type: "gift_cards", success, error: success ? null : "rejected", data: JSON.stringify({ cards }), result: JSON.stringify(result) } }), { headers: { "content-type": "application/json" } });
const row = (index: number, operation = op()) => [index, { op: operation, trx_id: id, block: 123, op_in_trx: 0, timestamp: "2026-09-13T11:00:00" }];
async function run(fetcher: typeof fetch, action: (c: Client) => Promise<void>) {
 const server = createServer({ fetch: fetcher, limiterOptions: { } });
 const client = new Client({ name: "hive-test", version: "0.0.0" });
 const [ct, st] = InMemoryTransport.createLinkedPair();
 await server.connect(st); await client.connect(ct);
 try { await action(client); } finally { await client.close(); await server.close(); }
}
describe("Hermes evidence tools", () => {
 it("continues beyond a filtered empty page and retrieves index zero", async () => {
  const requests: unknown[][] = [];
  await run(async (_url, init) => {
   const body = JSON.parse(String(init?.body)); requests.push(body.params);
   return rpc(body.params[1] === -1 ? [row(2, ["vote", {}]), row(3, ["vote", {}])] : body.params[1] === 1 ? [row(0), row(1, ["vote", {}])] : [row(0)]);
  }, async (c) => {
   const first = await c.callTool({ name: "hive_account_history", arguments: { account: "sampleacct", limit: 2, custom_json_id: "sm_gift_cards" } });
   expect(first.structuredContent).toMatchObject({ scanned_count: 2, records: [], next_start: 1 });
   const later = await c.callTool({ name: "hive_account_history", arguments: { account: "sampleacct", start: 1, limit: 2, custom_json_id: "sm_gift_cards" } });
   expect(later.structuredContent).toMatchObject({ scanned_count: 2, records: [{ index: 0 }], next_start: null });
   const next = await c.callTool({ name: "hive_account_history", arguments: { account: "sampleacct", start: 0, limit: 100 } });
   expect(next.structuredContent).toMatchObject({ scanned_count: 1, next_start: null });
   expect(requests).toEqual([["sampleacct", -1, 2], ["sampleacct", 1, 2], ["sampleacct", 0, 1]]);
  });
 });
 it("requires explicit accounts and rejects malformed IDs without a fetch", async () => {
  let calls = 0;
  await run(async () => { calls++; return rpc([]); }, async (c) => {
   for (const request of [{ name: "hive_account_history", arguments: {} }, { name: "hive_transaction", arguments: { trx_id: "bad" } }]) {
    expect((await c.callTool(request)).isError).toBe(true);
   }
   expect(calls).toBe(0);
  });
 });
 it("preserves full operations and signatures; unknown schemas have unknown counts", async () => {
  await run(async () => rpc(tx([op(), ["custom_json", { id: "unknown", json: "{broken" }]])), async (c) => {
   const r = await c.callTool({ name: "hive_transaction", arguments: { trx_id: id } });
   expect(r.isError).not.toBe(true);
   expect(r.structuredContent).toMatchObject({ operation_count: 2, signature_count: 1, raw: { signatures: ["signature"] }, operations: [{ item_count: 3, unique_item_count: 3 }, { item_count: null, parse_warning: expect.any(String) }] });
  });
 });
 it("matches one gift and uses exactly one RPC plus the existing GET", async () => {
  const requests: Array<[string, string]> = [];
  await run(async (url, init) => { requests.push([String(url), init?.method ?? "GET"]); return String(url) === HIVE_URL ? rpc(tx()) : game(); }, async (c) => {
   const r = await c.callTool({ name: "transaction_inspect", arguments: { trx_id: id } });
   expect(r.isError).not.toBe(true);
   expect(r.structuredContent).toMatchObject({ summary: { game_status: "success", gift_item_count: 3, signature_count: 1, operation_count: 1, gift_result_agrees: true } });
   expect(requests).toHaveLength(2);
   expect(requests[0]).toEqual([HIVE_URL, "POST"]);
   expect(requests[1]?.[0]).toContain("/transactions/lookup");
   expect(requests[1]?.[1]).toBe("GET");
  });
 });
 it.each(["multi", "failed", "mismatch", "duplicates", "wrong-player", "bad-json", "wrong-block", "wrong-id", "chain-error", "game-error"])("keeps %s evidence qualified", async (mode) => {
  await run(async (url) => {
   if (String(url) === HIVE_URL) return mode === "chain-error" ? new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1 } })) : rpc(tx(mode === "multi" ? [op(), op()] : [op()]));
   if (mode === "game-error") return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
   if (mode === "wrong-player" || mode === "bad-json" || mode === "wrong-block" || mode === "wrong-id") {
    const body = await game().json() as { trx_info: Record<string, unknown> };
    if (mode === "wrong-player") body.trx_info.player = "someoneelse";
    else if (mode === "wrong-block") body.trx_info.block_num = 456;
    else if (mode === "wrong-id") body.trx_info.id = "b".repeat(40);
    else body.trx_info.result = "{";
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
   }
   return game(mode !== "failed", { cards: mode === "mismatch" ? ["other"] : mode === "duplicates" ? [...cards, cards[0]] : cards });
  }, async (c) => {
   const r = await c.callTool({ name: "transaction_inspect", arguments: { trx_id: id } });
   expect(r.isError).not.toBe(true);
   const s = r.structuredContent as { summary: { verification: string; gift_result_agrees: boolean | null; game_status: string } };
   expect(s.summary.verification).toContain("partial");
   if (mode === "failed") expect(s.summary.game_status).toBe("failed");
   if (mode === "mismatch" || mode === "duplicates") expect(s.summary.gift_result_agrees).toBe(false);
  });
 });
 it("refuses oversized full output instead of truncating operations", async () => {
  await run(async () => rpc(tx([op({ cards: ["x".repeat(130_000)] })])), async (c) => {
   const r = await c.callTool({ name: "hive_transaction", arguments: { trx_id: id } });
   expect(r.isError).toBe(true); expect(r.structuredContent).toMatchObject({ kind: "response_too_large" });
  });
 });
 it("rejects wrong transaction identities and malformed history windows", async () => {
  await run(async (_url, init) => JSON.parse(String(init?.body)).method.endsWith("get_transaction") ? rpc({ ...tx(), transaction_id: "b".repeat(40) }) : rpc([row(2), row(2)]), async (c) => {
   for (const request of [{ name: "hive_transaction", arguments: { trx_id: id } }, { name: "hive_account_history", arguments: { account: "sampleacct" } }])
    expect((await c.callTool(request)).isError).toBe(true);
  });
 });
 it("advertises RPC reads separately from the GET catalogue and serves dated limits offline", async () => {
  await run(async () => { throw Error("unexpected fetch"); }, async (c) => {
   const tools = await c.listTools();
   expect(tools.tools.filter((t) => ["hive_account_history", "hive_transaction", "transaction_inspect"].includes(t.name))).toHaveLength(3);
   const r = await c.callTool({ name: "list_endpoints", arguments: {} });
   expect(r.structuredContent).toMatchObject({ additionalReadTools: { hive_transaction: expect.any(String) } });
   const resources = await c.listResources();
   expect(resources.resources).toHaveLength(6);
   const limits = await c.readResource({ uri: "splinterlands://hive/transaction-limits" });
   expect(JSON.parse((limits.contents[0] as { text: string }).text)).toMatchObject({ as_of: "2026-09-13", source_revision: expect.any(String) });
  });
 });
});
describe("isolated read transport", () => {
 it("blocks arbitrary RPC methods before network access", async () => {
  let calls = 0;
  const reader = new HermesHiveReader(async () => { calls++; return rpc({}); });
  await expect(reader.read("network_broadcast_api.broadcast_transaction" as never, [])).rejects.toMatchObject({ kind: "refused_method" });
  expect(calls).toBe(0);
 });
 it("uses fixed URL, rejects redirects, and supplies no credentials", async () => {
  const reader = new HermesHiveReader(async (url, init) => {
   expect(url).toBe(HIVE_URL); expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" });
   expect(JSON.parse(String(init?.body))).toMatchObject({ method: "condenser_api.get_transaction", params: [id] });
   return rpc(tx());
  });
  await reader.read("condenser_api.get_transaction", [id]);
 });
 it("counts distinct RPC parameters against the shared request budget", async () => {
  const reader = new HermesHiveReader(async () => rpc([]));
  await expect(withCallScope("test", async () => {
   await reader.read("condenser_api.get_account_history", ["sampleacct", -1, 1]);
   await reader.read("condenser_api.get_account_history", ["sampleacct", 10, 1]);
  })).rejects.toMatchObject({ kind: "refusal_would_fan_out" });
 });
 it("enforces transport byte and RPC envelope bounds", async () => {
  for (const body of ["x".repeat(2 * 1024 * 1024 + 1), JSON.stringify({ jsonrpc: "2.0", id: 2, result: [] }), "null"]) {
   const reader = new HermesHiveReader(async () => new Response(body));
   await expect(reader.read("condenser_api.get_transaction", [id])).rejects.toBeDefined();
  }
 });
 it("times out reads and rejects excess concurrency without a queue", async () => {
  const reader = new HermesHiveReader(async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Error("aborted")))), 25);
  const first = reader.read("condenser_api.get_transaction", [id]);
  const second = reader.read("condenser_api.get_transaction", [id]);
  await expect(reader.read("condenser_api.get_transaction", [id])).rejects.toMatchObject({ kind: "busy" });
  const results = await Promise.allSettled([first, second]);
  expect(results.every((r) => r.status === "rejected")).toBe(true);
 });
});
