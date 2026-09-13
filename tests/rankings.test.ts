import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { RANKING_ENTRY_IDS } from "../src/rankings.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";

const cases = [
  ["player_leaderboard", "leaderboard", {}],
  ["player_leaderboard_with_player", "leaderboard-with-player", { username: "fixture_account", season: "190" }],
  ["player_richlist", "richlist-with-player", { token_type: "DEC", limit: 2, player: "fixture_account" }],
  ["player_richlist_ranking", "richlist-ranking-retry", { token_type: "DEC", player: "fixture_account" }],
  ["player_burn_event_leaderboard", "burn-event", {}],
  ["player_burn_event_full_leaderboard", "burn-event-full", {}],
  ["player_presale_leaders", "presale", { username: "fixture_account" }],
  ["player_season", "season-valid", { id: "190" }],
] as const;
function capture(label: string): Record<string, unknown> | unknown[] {
  return (JSON.parse(readFileSync(new URL(`./fixtures/ranking-${label}.fixture.json`, import.meta.url), "utf8")) as { body: Record<string, unknown> | unknown[] }).body;
}
describe("ranking tools", () => {
  let server: ReturnType<typeof createServer>; let client: Client;
  afterEach(async () => { await client?.close(); await server?.close(); });
  async function connect(fetch: typeof globalThis.fetch) {
    server = createServer({ fetch, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    client = new Client({ name: "ranking-contract-test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
  }
  it("calls every ranking route and forwards only its advertised inputs", async () => {
    let body: unknown; const urls: URL[] = [];
    await connect(async (input) => { urls.push(new URL(String(input))); return new Response(JSON.stringify(body)); });
    for (const [name, label, args] of cases) {
      body = capture(label);
      const previous = urls.length;
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).not.toBe(true);
      expect(urls.length - previous).toBe(1);
      expect(urls.at(-1)?.pathname).toBe(getCatalogueEntry(RANKING_ENTRY_IDS[name]!).pathTemplate);
      expect(Object.fromEntries(urls.at(-1)!.searchParams)).toEqual(Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])));
      expect(result.structuredContent).toEqual(Array.isArray(body) ? { data: body } : body);
    }
  }, 15000);
  it("refuses missing identity/currency and inert pagination without making an HTTP request", async () => {
    let requests = 0;
    await connect(async () => { requests++; return new Response("{}"); });
    for (const args of [
      { name: "player_season", arguments: {} },
      { name: "player_leaderboard_with_player", arguments: { username: "fixture_account" } },
      { name: "player_richlist_ranking", arguments: { token_type: "DEC" } },
      { name: "player_richlist", arguments: { token_type: "DEC", offset: 2 } },
      { name: "player_richlist", arguments: { token_type: "DEC", limit: 0 } },
      { name: "player_presale_leaders", arguments: { offset: 2 } },
    ]) expect((await client.callTool(args)).isError).toBe(true);
    expect(requests).toBe(0);
  });
  it("bounds a nested presale list while preserving totals and the requested-player record", async () => {
    const captured = capture("presale") as { players: unknown[]; [key: string]: unknown };
    const rows = Array.from({ length: 120 }, () => captured.players[0]);
    const body = { ...captured, players: rows };
    await connect(async () => new Response(JSON.stringify(body)));
    const result = await client.callTool({ name: "player_presale_leaders", arguments: { username: "fixture_account" } });
    const data = result.structuredContent as { players: unknown[]; [key: string]: unknown };
    expect(result.isError).not.toBe(true);
    expect(data.players.length).toBeLessThanOrEqual(100);
    expect(data.players.length).toBeGreaterThan(0);
    expect(new TextEncoder().encode(JSON.stringify(data)).byteLength).toBeLessThanOrEqual(256 * 1024);
    expect({ ...data, players: undefined }).toEqual({ ...body, players: undefined });
    expect(result._meta).toMatchObject({ resultLimit: { truncated: true, upstreamRows: 120, returnedRows: data.players.length } });
  });
  it("validates each nested row and still accepts a valid empty list", () => {
    for (const [name, label] of cases) {
      const contract = getCatalogueEntry(RANKING_ENTRY_IDS[name]!).resultContract;
      if (!contract.predicateId?.startsWith("object-list.")) continue;
      const field = contract.predicateId.slice("object-list.".length);
      const body = capture(label) as Record<string, unknown>;
      const valid = predicateFor(contract);
      expect(valid(body), name).toBe(true);
      expect(valid({ ...body, [field]: [] }), name).toBe(true);
      expect(valid({ ...body, [field]: [...body[field] as unknown[], {}] }), name).toBe(false);
      expect(valid({ ...body, [field]: "wrong-type" }), name).toBe(false);
      expect(valid({ error: "not a result" }), name).toBe(false);
    }
  });
  it("does not discard oversized summary fields to manufacture a successful bounded response", async () => {
    const body = { ...capture("presale") as object, summary_extra: "x".repeat(270000) };
    await connect(async () => new Response(JSON.stringify(body)));
    const result = await client.callTool({ name: "player_presale_leaders", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ kind: "response_too_large" });
  });
});
