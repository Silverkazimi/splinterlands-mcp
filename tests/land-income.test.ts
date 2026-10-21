import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { summarizeDay } from "../src/land-income.js";
import fixture from "./evidence/land-income-2026-10-18.json" with { type: "json" };

const rows = fixture.response.data;
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

describe("land history window and income reads", () => {
  it("checks count, sends a real limit, drops nested payload fields and preserves swaps as other", async () => {
    const urls: URL[] = [];
    const server = createServer({ now: () => Date.parse("2026-10-21T00:00:00Z"), fetch: async (input) => {
      const url = new URL(String(input)); urls.push(url);
      if (url.pathname === "/land/deeds") return json({ status: "success", data: { deeds: [], staking_details: null, worksite_details: null } });
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: 3 } });
      return json({ status: "success", data: rows });
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    const client = new Client({ name: "land-income-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", days: 1, endDate: "2026-10-19" } });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as { days: Array<Record<string, unknown>>; current_rate_per_day: Record<string, number> };
      expect(body.days[0]).toMatchObject({ date: "2026-10-18", complete: true, observed_rows: 3, expected_rows: 3 });
      expect(body.days[0]!.resources).toMatchObject({ GRAIN: { production: 0, spends: 0, transfers: 0, other: -405765.922, net: -405765.922, rows: 3 } });
      expect(body.current_rate_per_day).toEqual({});
      expect(urls.filter((url) => url.pathname.includes("/balances/history/") && !url.pathname.endsWith("/count"))).toHaveLength(1);
      expect(urls.find((url) => url.pathname.endsWith("/history/fixtureacct"))?.searchParams.get("limit")).toBe("3");
      expect(urls.every((url) => !url.searchParams.has("offset"))).toBe(true);
    } finally { await client.close(); await server.close(); }
  });

  it("marks a same-second group larger than the requested page limit incomplete", async () => {
    const server = createServer({ fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: 3 } });
      return json({ status: "success", data: rows });
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    const client = new Client({ name: "land-income-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const cursor = Date.parse("2026-10-18T17:17:00Z");
      const result = await client.callTool({ name: "land_resources_balances_history", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor, limit: 2 } });
      expect(result.structuredContent).toMatchObject({ complete: false, next_cursor: null });
      expect(String((result.structuredContent as Record<string, unknown>).incomplete_reason)).toContain("unsplittable_timestamp");
    } finally { await client.close(); await server.close(); }
  });

  it("refuses an oversized streamed history window before the general 2 MB cap", async () => {
    const server = createServer({ fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: 1 } });
      return json({ status: "success", data: [{ ...rows[0], padding: "x".repeat(600 * 1024) }] });
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    const client = new Client({ name: "land-income-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "land_resources_balances_history", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse("2026-10-18T17:17:00Z"), limit: 1 } });
      expect(result.structuredContent).toMatchObject({ complete: false, next_cursor: null });
      expect(String((result.structuredContent as Record<string, unknown>).incomplete_reason)).toContain("512 KiB window limit");
    } finally { await client.close(); await server.close(); }
  });
});

const syntheticRow = (id: number, created_date: string, amount = 4, type = "land_player_resource_mint") => ({
  id, created_date, region_number: 1, resource_id: 1, amount, end_balance: amount,
  operation_id: 3, trx_id: `synthetic-${id}`, counterparty: "fixtureacct",
  balance_history: [{ token: "GRAIN", type, amount }],
});
const deedBody = () => ({ status: "success", data: {
  deeds: [{ deed_uid: "synthetic-deed", plot_id: 1, region_number: 1, tract_number: 1, plot_number: 1, resource_id: 1, resource_symbol: "GRAIN" }],
  staking_details: [{ deed_uid: "synthetic-deed", total_work_per_hour: 2.5 }],
  worksite_details: [{ deed_uid: "synthetic-deed", is_active: true, is_harvesting: true, token_symbol: "GRAIN" }],
} });
async function withLandClient(fetch: (input: unknown) => Promise<Response>, run: (client: Client) => Promise<void>, now = () => Date.parse("2026-10-21T00:00:00Z")) {
  let limiterTime = 0;
  const server = createServer({ now, fetch, sleep: async () => undefined, limiterOptions: { now: () => limiterTime += 1000, sleep: async () => undefined } });
  const client = new Client({ name: "land-income-synthetic", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try { await run(client); } finally { await client.close(); await server.close(); }
}
const countFor = (url: URL, candidates: ReturnType<typeof syntheticRow>[]) => {
  const start = Date.parse(url.searchParams.get("startDate")!);
  const end = Date.parse(url.searchParams.get("endDate")!);
  return candidates.filter((row) => Date.parse(row.created_date) >= start && Date.parse(row.created_date) < end);
};

describe("land income coverage and classification", () => {
  it("classifies each observed mint type and leaves guessed spend, transfer and harvest types in other", () => {
    const types = ["land_player_resource_mint", "land_uncaptured_tax_mint", "land_resource_castle_tax_mint", "land_resource_keep_tax_mint", "spend", "transfer", "harvest"];
    const projected = types.map((type, index) => ({ resource_id: 1, amount: 1, legs: [{ token: "GRAIN", type, amount: 1 }], id: index + 1 }));
    const result = summarizeDay("2026-10-18", { rows: projected, complete: true, expected: 7, calls: 2 }) as { resources: Record<string, Record<string, number>>; unclassified_types: Record<string, number>; unclassified_leg_count: number };
    expect(result.resources.GRAIN).toMatchObject({ production: 4, spends: 0, transfers: 0, other: 3, net: 7 });
    expect(result.unclassified_types).toEqual({ harvest: 1, spend: 1, transfer: 1 });
    expect(result.unclassified_leg_count).toBe(3);
  });
  it("splits recursively and checks counts at every depth", async () => {
    const base = "2026-10-18T17:17:";
    const candidates = [syntheticRow(1, `${base}02Z`), syntheticRow(2, `${base}17Z`), syntheticRow(3, `${base}32Z`), syntheticRow(4, `${base}47Z`)];
    const counts: number[] = [];
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) { const n = countFor(url, candidates).length; counts.push(n); return json({ status: "success", data: { count: n } }); }
      return json({ status: "success", data: countFor(url, candidates).slice(0, Number(url.searchParams.get("limit"))) });
    }, async (client) => {
      const result = await client.callTool({ name: "land_resources_balances_history", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse(`${base}00Z`), limit: 1 } });
      expect(result.structuredContent).toMatchObject({ complete: true, expected_rows: 1, next_cursor: Date.parse(`${base}02Z`) + 1 });
      expect((result.structuredContent as { rows: unknown[] }).rows).toHaveLength(1);
      expect(counts).toEqual([4, 2, 1, 1, 2, 1, 1]);
    });
  });

  it("reports count mismatch without presenting complete coverage", async () => {
    await withLandClient(async (input) => new URL(String(input)).pathname.endsWith("/count")
      ? json({ status: "success", data: { count: 2 } }) : json({ status: "success", data: [syntheticRow(1, "2026-10-18T17:17:01Z")] }), async (client) => {
      const result = await client.callTool({ name: "land_resources_balances_history", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse("2026-10-18T17:17:00Z"), limit: 2 } });
      expect(result.structuredContent).toMatchObject({ complete: false, expected_rows: 2, skip_cursor: Date.parse("2026-10-18T17:18:00Z") });
      expect(String((result.structuredContent as Record<string, unknown>).incomplete_reason)).toContain("count_mismatch");
    });
  });

  it("keeps only live-observed mint legs in production and exposes every unknown type", async () => {
    const candidates = [syntheticRow(1, "2026-10-18T00:00:01Z"), syntheticRow(2, "2026-10-18T00:00:02Z", -2, "synthetic_spend"), syntheticRow(3, "2026-10-18T00:00:03Z", -3, "synthetic_transfer"), syntheticRow(4, "2026-10-18T00:00:04Z", 5, "swap_tokens"),
      { ...syntheticRow(5, "2026-10-18T00:00:05Z", 7), resource_id: 5, balance_history: [{ token: "WOOD", type: "land_player_resource_mint", amount: 7 }] }];
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      const matching = countFor(url, candidates);
      return url.pathname.endsWith("/count") ? json({ status: "success", data: { count: matching.length } }) : json({ status: "success", data: matching });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19", resource: "GRAIN" } });
      const body = result.structuredContent as { days: Array<{ resources: Record<string, Record<string, number>>; unclassified_types: Record<string, number>; unclassified_leg_count: number }>; current_rate_per_day: Record<string, number> };
      expect(body.days[0]!.resources.GRAIN).toMatchObject({ production: 4, spends: 0, transfers: 0, other: 0, net: 4, rows: 4 });
      expect(body.days[0]!.unclassified_types).toEqual({ swap_tokens: 1, synthetic_spend: 1, synthetic_transfer: 1 });
      expect(body.days[0]!.unclassified_leg_count).toBe(3);
      expect(body.current_rate_per_day).toEqual({ GRAIN: 60 });
      const woodResult = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19", resource: "WOOD" } });
      const wood = woodResult.structuredContent as { days: Array<{ resources: Record<string, Record<string, number>>; unclassified_leg_count: number }> };
      expect(Object.keys(wood.days[0]!.resources)).toEqual(["WOOD"]);
      expect(wood.days[0]!.resources.WOOD?.production).toBe(7);
      expect(wood.days[0]!.unclassified_leg_count).toBe(0);
    });
  });

  it("enforces 32 reads per day and 95 history reads per call across multiple days", async () => {
    let historyReads = 0;
    const candidates = Array.from({ length: 3 }, (_, day) => Array.from({ length: 96 }, (_, interval) =>
      syntheticRow(day * 96 + interval + 1, new Date(Date.parse("2026-10-18T00:00:00Z") - day * 86_400_000 + interval * 15 * 60_000).toISOString()))).flat();
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      historyReads++;
      const matching = countFor(url, candidates);
      return url.pathname.endsWith("/count") ? json({ status: "success", data: { count: matching.length } })
        : json({ status: "success", data: matching.slice(0, Number(url.searchParams.get("limit"))) });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19", days: 3 } });
      const body = result.structuredContent as { days: Array<{ calls: number; complete: boolean; incomplete_reason: string }>; upstream_calls: number };
      expect(body.days.map((day) => [day.calls, day.incomplete_reason])).toEqual([[32, "request_budget_exhausted"], [32, "request_budget_exhausted"], [31, "request_budget_exhausted"]]);
      expect(body.days.every((day) => !day.complete && day.incomplete_reason.includes("request_budget_exhausted"))).toBe(true);
      expect(body.upstream_calls).toBe(95);
      expect(historyReads).toBe(95);
    });
  });

  it("expires complete-day cache at 60 seconds and current-rate cache at 120 seconds", async () => {
    let nowMs = Date.parse("2026-10-21T00:00:00Z"); let counts = 0; let deeds = 0;
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") { deeds++; return json(deedBody()); }
      if (url.pathname.endsWith("/count")) { counts++; return json({ status: "success", data: { count: 0 } }); }
      throw new Error("unexpected list read");
    }, async (client) => {
      const call = () => client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      await call(); nowMs += 59_000; await call(); expect([counts, deeds]).toEqual([1, 1]);
      nowMs += 2_000; await call(); expect([counts, deeds]).toEqual([2, 1]);
      nowMs += 60_000; await call(); expect([counts, deeds]).toEqual([3, 2]);
    }, () => nowMs);
  });

  it("rejects future endDate before an upstream read", async () => {
    let reads = 0;
    await withLandClient(async () => { reads++; throw new Error("unexpected read"); }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-22" } });
      expect(result.isError).toBe(true); expect(reads).toBe(0);
    });
  });

  it("withholds current rate when worksite token disagrees with the observed resource mapping", async () => {
    const mismatched = deedBody();
    mismatched.data.worksite_details[0]!.token_symbol = "STONE";
    await withLandClient(async (input) => new URL(String(input)).pathname === "/land/deeds" ? json(mismatched)
      : json({ status: "success", data: { count: 0 } }), async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      expect((result.structuredContent as { current_rate_per_day: unknown }).current_rate_per_day).toBeNull();
    });
  });
});
