import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const deed = (i: number) => ({ deed_uid: `I-1-${i}`, plot_id: 6400 + i, region_number: 65, tract_number: Math.floor((i - 1) / 100) + 1, plot_number: ((i - 1) % 100) + 1,
  region_uid: "PR-CEF-65", territory: "Central Fire", player: "fixtureacct", rarity: "common", deed_type: "Swamp", magic_type: "", plot_status: "natural",
  worksite_type: "Grain Farm", resource_symbol: "GRAIN", listed: false, in_use: true, is_construction: false, stats: "{}", land_stats: "{}", castle: false });
const stake = (i: number) => ({ deed_uid: `I-1-${i}`, is_powered: true, worker_count: 5, powered_worker_count: 5, max_workers_allowed: 5, total_harvest_pp: 1000.5,
  total_base_pp_after_cap: 900, efficiency: 1, total_work_per_hour: 12.5, runi_boost: 0 });
const worksite = (i: number) => ({ deed_uid: `I-1-${i}`, is_active: true, is_harvesting: true, is_construction: false, project_type: "worksite", token_symbol: "GRAIN", hours_till_next_op: 0, pp_balance: 1 });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

async function run(fetcher: (url: URL) => Response | Promise<Response>, action: (call: (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: Record<string, unknown> }>, urls: URL[], tick: (ms: number) => void) => Promise<void>) {
  let now = Date.parse("2026-10-11T12:00:00Z");
  const urls: URL[] = [];
  const server = createServer({ now: () => now, fetch: async (input) => { const url = new URL(String(input)); urls.push(url); return fetcher(url); }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
  const client = new Client({ name: "deeds-bundle-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
    await action(async (args) => await client.callTool({ name: "land_deeds_bundle", arguments: args }) as never, urls, (ms) => { now += ms; });
  } finally { await client.close(); await server.close(); }
}

describe("land_deeds_bundle", () => {
  it("projects a full region in one GET and pages it locally", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
    const body = { status: "success", data: { deeds: ids.map(deed), staking_details: ids.filter((i) => i !== 7).map(stake), worksite_details: ids.filter((i) => i % 2 === 0).map(worksite) } };
    await run(() => json(body), async (call, urls, tick) => {
      const rows: Array<Record<string, unknown>> = [];
      let cursor: number | null = 0;
      while (cursor !== null) {
        tick(1_000);
        const page = await call({ region_number: 65, cursor });
        expect(page.isError).not.toBe(true);
        const content = page.structuredContent as { rows: Array<Record<string, unknown>>; next_cursor: number | null; age_ms: number; retrieved_at: string };
        expect(Buffer.byteLength(JSON.stringify(content))).toBeLessThan(256 * 1024);
        expect(content.retrieved_at).toBe("2026-10-11T12:00:01.000Z");
        rows.push(...content.rows);
        cursor = content.next_cursor;
      }
      expect(rows).toHaveLength(1000);
      expect(urls).toHaveLength(1);
      expect(urls[0]!.pathname).toBe("/land/deeds");
      expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({ region_number: "65", limit: "1000" });
      expect(rows[0]).toMatchObject({ deed_uid: "I-1-1", plot_label: "065-01-001", deed_type: "Swamp", complete: true, worksite: null,
        staking: { is_powered: true, worker_count: 5, total_harvest_pp: 1000.5, total_work_per_hour: 12.5 } });
      expect(rows[0]).not.toHaveProperty("stats");
      expect(rows[0]!.staking).not.toHaveProperty("runi_boost");
      expect(rows[1]).toMatchObject({ plot_label: "065-01-002", worksite: { is_active: true, is_harvesting: true } });
      expect(rows[6]).toMatchObject({ deed_uid: "I-1-7", staking: null, complete: false });
      const last = await call({ region_number: 65, cursor: 900 });
      expect(last.structuredContent).toMatchObject({ total: 1000, truncated: false, staking_missing_count: 1, worksite_missing_count: 500, cache: "hit", age_ms: 9_000 });
      tick(120_001);
      expect((await call({ region_number: 65 })).structuredContent).toMatchObject({ cache: "miss" });
      expect(urls).toHaveLength(2);
    });
  });

  it("reads a player scope, reports empty answers and rejects unscoped calls", async () => {
    await run((url) => url.searchParams.get("player") === "biggest"
      ? json({ status: "success", data: { deeds: Array.from({ length: 1000 }, (_, i) => deed(i + 1)), staking_details: [], worksite_details: [] } })
      : url.searchParams.get("player") === "fixtureacct"
      ? json({ status: "success", data: { deeds: [deed(1), deed(2)], staking_details: [stake(1), stake(2)], worksite_details: [] } })
      : json({ status: "success", data: { deeds: [], staking_details: null, worksite_details: null } }), async (call, urls) => {
      expect((await call({ player: "fixtureacct" })).structuredContent).toMatchObject({ scope: { player: "fixtureacct" }, total: 2, truncated: false, next_cursor: null });
      expect((await call({ player: "nobody" })).structuredContent).toMatchObject({ total: 0, rows: [] });
      expect((await call({ player: "biggest" })).structuredContent).toMatchObject({ total: 1000, truncated: true });
      for (const args of [{}, { player: "fixtureacct", region_number: 65 }]) expect((await call(args)).isError).toBe(true);
      expect(urls).toHaveLength(3);
    });
  });

  it("reports over-limit and malformed bodies with a reason instead of a bare status", async () => {
    const huge = { status: "success", data: { deeds: [{ ...deed(1), padding: "x".repeat(9 * 1024 * 1024) }], staking_details: [], worksite_details: [] } };
    await run((url) => url.searchParams.get("region_number") === "1" ? json(huge)
      : url.searchParams.get("region_number") === "2" ? json({ status: "error", data: null })
      : json({ status: "success", data: { deeds: [{ plot_id: 1 }], staking_details: [], worksite_details: [] } }), async (call) => {
      for (const [region, reason] of [[1, "read limit"], [2, "not \"success\""], [3, "deed_uid"]] as const) {
        const result = await call({ region_number: region });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ kind: "response_not_projected" });
        expect(String(result.structuredContent?.reason)).toContain(reason);
      }
    });
  });
});
