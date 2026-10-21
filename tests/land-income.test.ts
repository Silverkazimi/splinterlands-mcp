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
      expect(body.days[0]!.resources).toMatchObject({ GRAIN: { production: 0, other: -3, net: -3, rows: 3 } });
      expect(body.current_rate_per_day).toEqual({});
      expect(urls.filter((url) => url.pathname.includes("/balances/history/") && !url.pathname.endsWith("/count"))).toHaveLength(1);
      expect(urls.find((url) => url.pathname.endsWith("/history/fixtureacct"))?.searchParams.get("limit")).toBe("3");
      expect(urls.every((url) => !url.searchParams.has("offset"))).toBe(true);
    } finally { await client.close(); await server.close(); }
  });

  it("reads an entire same-second group in one count-sized upstream request", async () => {
    const limits: string[] = [];
    const server = createServer({ fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: 3 } });
      limits.push(url.searchParams.get("limit") ?? "");
      return json({ status: "success", data: rows });
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    const client = new Client({ name: "land-income-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const cursor = Date.parse("2026-10-18T17:17:00Z");
      const result = await client.callTool({ name: "land_resources_balances_history_window", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor, limit: 100 } });
      expect(result.structuredContent).toMatchObject({ complete: true, expected_rows: 3 });
      expect(limits).toEqual(["3"]);
    } finally { await client.close(); await server.close(); }
  });

  it("refuses an oversized streamed history window before the general 2 MB cap", async () => {
    const server = createServer({ fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: 1 } });
      return json({ status: "success", data: [{ ...rows[0], padding: "x".repeat(1100 * 1024) }] });
    }, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
    const client = new Client({ name: "land-income-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "land_resources_balances_history_window", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse("2026-10-18T17:17:00Z"), limit: 1 } });
      expect(result.structuredContent).toMatchObject({ complete: false, next_cursor: null });
      expect(String((result.structuredContent as Record<string, unknown>).incomplete_reason)).toContain("1 MiB window limit");
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
  return candidates.filter((row) => Date.parse(row.created_date) >= start && Date.parse(row.created_date) <= end);
};

describe("land income coverage and classification", () => {
  it("counts midpoint and UTC day-boundary rows once in the later window", async () => {
    const midpoint = Date.parse("2026-10-18T12:00:00.000Z");
    const boundary = Date.parse("2026-10-19T00:00:00.000Z");
    const candidates = [syntheticRow(9001, new Date(midpoint).toISOString()), syntheticRow(9002, new Date(boundary).toISOString())];
    const observedLists: number[] = [];
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      const matching = countFor(url, candidates);
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: matching.length } });
      observedLists.push(...matching.map((row) => row.id));
      return json({ status: "success", data: matching.slice(0, Number(url.searchParams.get("limit"))) });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-20", days: 2 } });
      const days = (result.structuredContent as { days: Array<{ date: string; observed_rows: number; complete: boolean }> }).days;
      expect(days.map(({ date, observed_rows, complete }) => [date, observed_rows, complete])).toEqual([
        ["2026-10-19", 1, true], ["2026-10-18", 1, true],
      ]);
      expect(observedLists.sort()).toEqual([9001, 9002]);
      const sentEnds = observedLists.length;
      expect(sentEnds).toBe(2);
    });
  });

  it("uses a synthetic harvest_all result and reports the unmatched rows", () => {
    const result = summarizeDay("2026-10-19", { rows: [], complete: false, expected: 279, calls: 42, reason: "unmatched_rows: 26 of 279", bulk: {
      groupRows: 279, matchedRows: 253, unmatchedRows: 26, trxId: "synthetic-transaction",
      totals: { WOOD: { production: 12.5, gross: 15, tax: 2.5, consumption: 3, rows: 1 }, GRAIN: { production: 0, gross: 0, tax: 0, consumption: 4, rows: 1 } },
    } }) as { basis: string; group_rows: number; matched_rows: number; unmatched_rows: number; complete: boolean; resources: Record<string, Record<string, number>> };
    expect(result).toMatchObject({ basis: "harvest_transaction", group_rows: 279, matched_rows: 253, unmatched_rows: 26, complete: false });
    expect(result.resources.WOOD).toMatchObject({ production: 12.5, gross: 15, tax: 2.5, other: -3, net: 9.5 });
    expect(result.resources.GRAIN).toMatchObject({ other: -4, net: -4 });
  });

  it("keeps a non-harvest bulk transaction unaccounted", async () => {
    const timestamp = Date.parse("2026-10-18T00:00:00.000Z");
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      if (url.pathname === "/transactions/lookup") return json({ trx_info: { id: "synthetic-transaction", type: "other_operation", data: "{}", result: "{}", block_id: "synthetic-block", block_num: 123, created_date: "2026-10-18T00:00:00Z", player: "fixtureacct", prev_block_id: "synthetic-prev", success: true } });
      const start = Date.parse(url.searchParams.get("startDate")!); const end = Date.parse(url.searchParams.get("endDate")!);
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: start <= timestamp && timestamp <= end ? 279 : 0 } });
      return json({ status: "success", data: [{ ...syntheticRow(1, new Date(timestamp).toISOString()), trx_id: "synthetic-transaction" }] });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      const day = (result.structuredContent as { days: Array<Record<string, unknown>> }).days[0]!;
      expect(day).toMatchObject({ complete: false, basis: "history_rows" });
      expect(day.incomplete_reason).toBe("unrecognized_or_unavailable_harvest_transaction");
    });
  });

  it("looks up and accounts synthetic harvest_all results with an explicit unmatched remainder", async () => {
    const timestamp = Date.parse("2026-10-18T00:00:00.000Z"); let lookups = 0;
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      if (url.pathname === "/transactions/lookup") {
        lookups++;
        return json({ trx_info: { id: "synthetic-transaction", type: "land_operation", data: JSON.stringify({ op: "harvest_all" }), result: JSON.stringify({ success: true, result: { success: true, error: null, data: { message: "fixture harvest", results: [
          { resource_symbol: "WOOD", resource_amount: 6, received_amount: 5, tax_amount: 1, grain_eaten: 2, inputs_consumed: [{ symbol: "STONE", qty: 3 }] },
          { resource_symbol: "WOOD", resource_amount: 4, received_amount: 4, tax_amount: 0, grain_eaten: 1, inputs_consumed: [] },
        ] }, balanceHistory: [] } }), block_id: "synthetic-block", block_num: 123, created_date: "2026-10-18T00:00:00Z", player: "fixtureacct", prev_block_id: "synthetic-prev", success: true } });
      }
      const start = Date.parse(url.searchParams.get("startDate")!); const end = Date.parse(url.searchParams.get("endDate")!);
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: start <= timestamp && timestamp <= end ? 130 : 0 } });
      return json({ status: "success", data: [{ ...syntheticRow(1, new Date(timestamp).toISOString()), trx_id: "synthetic-transaction" }] });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      const day = (result.structuredContent as { days: Array<Record<string, unknown>> }).days[0]!;
      expect(day).toMatchObject({ basis: "harvest_transaction", group_rows: 130, matched_rows: 5, unmatched_rows: 125, complete: false });
      expect((day.resources as Record<string, Record<string, number>>).WOOD).toMatchObject({ production: 9, gross: 10, tax: 1 });
      expect(lookups).toBe(1);
    });
  });

  it("aggregates multiple bulk groups and ordinary rows from the same day", async () => {
    const t1 = Date.parse("2026-10-18T00:00:00.000Z");
    const t2 = Date.parse("2026-10-18T12:00:00.000Z");
    const candidates = [
      ...Array.from({ length: 130 }, (_, i) => ({ ...syntheticRow(i + 1, new Date(t1).toISOString()), trx_id: "synthetic-bulk-a" })),
      ...Array.from({ length: 130 }, (_, i) => ({ ...syntheticRow(i + 131, new Date(t2).toISOString()), trx_id: "synthetic-bulk-b" })),
      ...Array.from({ length: 4 }, (_, i) => syntheticRow(i + 261, new Date(t2 + 1000 + i * 1000).toISOString())),
    ];
    const lookups: string[] = [];
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      if (url.pathname === "/transactions/lookup") {
        const id = url.searchParams.get("trx_id")!; lookups.push(id);
        const value = id.endsWith("a") ? 5 : 7;
        return json({ trx_info: { id, type: "land_operation", data: JSON.stringify({ op: "harvest_all" }), result: JSON.stringify({ success: true, result: { success: true, error: null, data: { message: "fixture harvest", results: [{ resource_symbol: "WOOD", resource_amount: value + 1, received_amount: value, tax_amount: 1, grain_eaten: 0, inputs_consumed: [] }] }, balanceHistory: [] } }), block_id: "synthetic-block", block_num: 123, created_date: "2026-10-18T00:00:00Z", player: "fixtureacct", prev_block_id: "synthetic-prev", success: true } });
      }
      const matching = countFor(url, candidates);
      return url.pathname.endsWith("/count") ? json({ status: "success", data: { count: matching.length } })
        : json({ status: "success", data: matching.slice(0, Number(url.searchParams.get("limit"))) });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      const day = (result.structuredContent as { days: Array<Record<string, unknown>> }).days[0]!;
      expect(lookups).toHaveLength(2);
      expect(day.incomplete_reason).toBe("unmatched_rows: 258 of 260");
      expect(day).toMatchObject({ basis: "mixed", group_rows: 260, observed_rows: 264, expected_rows: 264, complete: false });
      expect(day.matched_rows).toBeGreaterThanOrEqual(6);
      expect((day.resources as Record<string, Record<string, number>>).WOOD).toMatchObject({ production: 12, gross: 14, tax: 2 });
      expect((day.resources as Record<string, Record<string, number>>).WOOD?.rows).toBe(2);
      expect((day.resources as Record<string, Record<string, number>>).GRAIN).toMatchObject({ production: 16, rows: 4 });
      expect(lookups.sort()).toEqual(["synthetic-bulk-a", "synthetic-bulk-b"]);
    });
  });

  it("reports an unavailable bulk lookup without claiming coverage", async () => {
    const timestamp = Date.parse("2026-10-18T00:00:00.000Z");
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") return json(deedBody());
      if (url.pathname === "/transactions/lookup") return new Response("upstream failure", { status: 502 });
      if (url.pathname.endsWith("/count")) return json({ status: "success", data: { count: url.searchParams.get("startDate") === new Date(timestamp).toISOString() ? 130 : 0 } });
      return json({ status: "success", data: [{ ...syntheticRow(1, new Date(timestamp).toISOString()), trx_id: "synthetic-failed-lookup" }] });
    }, async (client) => {
      const result = await client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      const day = (result.structuredContent as { days: Array<Record<string, unknown>> }).days[0]!;
      expect(day).toMatchObject({ complete: false, group_rows: 0, basis: "history_rows" });
      expect(day.incomplete_reason).toBe("unrecognized_or_unavailable_harvest_transaction");
    });
  });

  it("classifies each observed mint type and leaves guessed spend, transfer and harvest types in other", () => {
    const types = ["land_player_resource_mint", "land_uncaptured_tax_mint", "land_resource_castle_tax_mint", "land_resource_keep_tax_mint", "spend", "transfer", "harvest"];
    const projected = types.map((type, index) => ({ resource_id: 1, amount: 1, legs: [{ token: "GRAIN", type, amount: 1 }], id: index + 1 }));
    const result = summarizeDay("2026-10-18", { rows: projected, complete: true, expected: 7, calls: 2 }) as { resources: Record<string, Record<string, number>>; unclassified_types: Record<string, number>; unclassified_leg_count: number };
    expect(result.resources.GRAIN).toMatchObject({ production: 4, other: 3, net: 7 });
    expect(result.unclassified_types).toEqual({ harvest: 1, spend: 1, transfer: 1 });
    expect(result.unclassified_leg_count).toBe(3);
  });
  it("rounds accumulated category sums to three decimals", () => {
    const result = summarizeDay("2026-10-18", { rows: [
      { resource_id: 1, amount: 0.1, legs: [] }, { resource_id: 1, amount: 0.2, legs: [] },
    ], complete: true, expected: 2, calls: 1 }) as { resources: Record<string, Record<string, number>> };
    expect(result.resources.GRAIN?.other).toBe(0.3);
    expect(result.resources.GRAIN?.net).toBe(0.3);
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
      const result = await client.callTool({ name: "land_resources_balances_history_window", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse(`${base}00Z`), limit: 1 } });
      expect(result.structuredContent).toMatchObject({ complete: true, expected_rows: 1, next_cursor: Date.parse(`${base}02Z`) + 1 });
      expect((result.structuredContent as { rows: unknown[] }).rows).toHaveLength(1);
      expect(counts[0]).toBe(4);
      expect(counts.some((count) => count === 2)).toBe(true);
    });
  });

  it("reports count mismatch without presenting complete coverage", async () => {
    await withLandClient(async (input) => new URL(String(input)).pathname.endsWith("/count")
      ? json({ status: "success", data: { count: 2 } }) : json({ status: "success", data: [syntheticRow(1, "2026-10-18T17:17:01Z")] }), async (client) => {
      const result = await client.callTool({ name: "land_resources_balances_history_window", arguments: { player: "fixtureacct", startDate: "2026-10-18", endDate: "2026-10-19", cursor: Date.parse("2026-10-18T17:17:00Z"), limit: 2 } });
      expect(result.structuredContent).toMatchObject({ complete: false, expected_rows: 2, skip_cursor: null });
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
      expect(body.days[0]!.resources.GRAIN).toMatchObject({ production: 4, other: 0, net: 4, rows: 4 });
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

  it("completes multi-day histories within expanded bounded budgets", async () => {
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
      const body = result.structuredContent as { days: Array<{ calls: number; complete: boolean; incomplete_reason: string; observed_rows: number }>; upstream_calls: number };
      expect(body.days.every((day) => day.complete)).toBe(true);
      expect(body.days.map((day) => day.observed_rows)).toEqual([96, 96, 96]);
      expect(body.upstream_calls).toBeLessThanOrEqual(2049);
      expect(historyReads).toBeLessThanOrEqual(3 * 512);
    });
  });

  it("expires complete-day cache at 10 minutes and current-rate cache at 120 seconds", async () => {
    let nowMs = Date.parse("2026-10-21T00:00:00Z"); let counts = 0; let deeds = 0;
    await withLandClient(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/land/deeds") { deeds++; return json(deedBody()); }
      if (url.pathname.endsWith("/count")) { counts++; return json({ status: "success", data: { count: 0 } }); }
      throw new Error("unexpected list read");
    }, async (client) => {
      const call = () => client.callTool({ name: "land_income_daily", arguments: { player: "fixtureacct", endDate: "2026-10-19" } });
      await call(); nowMs += 599_000; await call(); expect([counts, deeds]).toEqual([1, 2]);
      nowMs += 2_000; await call(); expect([counts, deeds]).toEqual([2, 2]);
      nowMs += 120_000; await call(); expect([counts, deeds]).toEqual([2, 3]);
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
