import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { projectDeedsBundle } from "./land-deeds-bundle.js";

const HISTORY = "vapi.land.resources.balances-history";
const COUNT = "vapi.land.resources.balances-history-count";
const DAY_MS = 86_400_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_HISTORY_BODY_BYTES = 1024 * 1024;
const MAX_DAILY_CALLS = 512;
const MAX_DAILY_LEAF_ROWS = 25;
const RESOURCE_SYMBOLS: Record<number, string> = { 1: "GRAIN", 2: "SPS", 3: "RESEARCH", 5: "WOOD", 6: "STONE", 7: "IRON" }; // paired live deed id/symbol fields, 2026-10-21
export const LAND_INCOME_TOOL_ROUTES = {
  land_resources_balances_history_window: "GET /land/resources/balances/history/{player} and /count in bounded UTC timestamp windows",
  land_income_daily: "Count-checked `GET /land/resources/balances/history/{player}` windows plus a separate current deed work-rate estimate",
};

type Row = Record<string, unknown>;
type Window = { start: number; end: number };
type Budget = { used: number; max: number };
type BulkHarvest = { groupRows: number; matchedRows: number; unmatchedRows: number; totals: Record<string, { production: number; gross: number; tax: number; consumption: number; rows: number }>; trxId: string };
type HistoryResult = { rows: Row[]; complete: boolean; expected: number; calls: number; reason?: string; bulk?: BulkHarvest };
const error = (kind: string, reason: string) => ({ isError: true, content: [{ type: "text" as const, text: reason }], structuredContent: { kind, reason } });
const success = (data: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const playerSchema = z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]+[a-z0-9]$/);

function utcDay(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) throw new Error("Invalid UTC calendar date.");
  return parsed;
}
const iso = (time: number) => new Date(time).toISOString();
// Internally windows are [start, end); upstream filters are closed to the millisecond.
const upstreamEnd = (window: Window) => iso(window.end - 1);
const fields = ["id", "created_date", "region_number", "resource_id", "amount", "end_balance", "operation_id", "trx_id", "counterparty"] as const;
function project(row: Row): Row {
  const result: Row = Object.fromEntries(fields.map((key) => [key, row[key] ?? null]));
  result.resource_symbol = RESOURCE_SYMBOLS[Number(row.resource_id)] ?? null;
  result.legs = Array.isArray(row.balance_history) ? row.balance_history.map((leg: Row) => ({ token: leg.token ?? null, amount: leg.amount ?? null, type: leg.type ?? null })) : [];
  return result;
}
async function getCount(client: SplinterlandsHttpClient, player: string, window: Window, budget: Budget): Promise<number> {
  if (budget.used >= budget.max) throw new Error("request_budget_exhausted");
  budget.used++;
  const bound = bindRequest(COUNT, { player, startDate: iso(window.start), endDate: upstreamEnd(window) });
  const result = await bound.execute(client);
  if (!result.ok) throw new Error(`${result.kind}: ${result.message}`);
  const count = (result.data as { data?: { count?: unknown } }).data?.count;
  if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error("Malformed history count.");
  return count as number;
}
async function getRows(client: SplinterlandsHttpClient, player: string, window: Window, limit: number, budget: Budget): Promise<Row[]> {
  if (budget.used >= budget.max) throw new Error("request_budget_exhausted");
  budget.used++;
  const bound = bindRequest(HISTORY, { player, startDate: iso(window.start), endDate: upstreamEnd(window), limit });
  const result = await client.requestStreaming(bound.hostname, bound.path, bound.queryParams, {
    endpointTemplate: bound.endpointTemplate,
    timeoutMs: 20_000,
    consume: async (response) => {
      if (!response.body) throw new Error("History response had no body.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_HISTORY_BODY_BYTES) {
            await reader.cancel("land_history_body_limit");
            throw new Error("History response exceeded the 1 MiB window limit.");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { status?: unknown; data?: unknown };
      if (body.status !== "success" || !Array.isArray(body.data)) throw new Error("Malformed history envelope.");
      if (body.data.some((row: Row) => !Number.isSafeInteger(row?.id) || !Number.isSafeInteger(row.resource_id)
        || typeof row.created_date !== "string" || typeof row.amount !== "number" || !Array.isArray(row.balance_history))) {
        throw new Error("Malformed history row.");
      }
      return (body.data as Row[]).map(project);
    },
  });
  if (!result.ok) throw new Error(`${result.kind}: ${result.message}`);
  return result.data;
}

// Split internal half-open windows; request parameters are adjusted for the upstream's closed interval.
async function collect(client: SplinterlandsHttpClient, player: string, window: Window, budget: Budget, maxRows = 100, transactionCache = new Map<string, BulkHarvest | null>()): Promise<HistoryResult> {
  const used = budget.used;
  let expected = 0;
  let rootExpected: number | undefined;
  const rows: Row[] = [];
  const seen = new Set<number>();
  let reason: string | undefined;
  let unrecognizedBulk = false;
  let bulk: BulkHarvest | undefined;
  const bulkTransactions = new Set<string>();
  function addBulk(next: BulkHarvest): void {
    if (bulkTransactions.has(next.trxId)) return;
    bulkTransactions.add(next.trxId);
    if (!bulk) { bulk = next; return; }
    bulk.groupRows += next.groupRows;
    bulk.matchedRows += next.matchedRows;
    bulk.unmatchedRows += next.unmatchedRows;
    for (const [symbol, value] of Object.entries(next.totals)) {
      const total = bulk.totals[symbol] ??= { production: 0, gross: 0, tax: 0, consumption: 0, rows: 0 };
      total.production += value.production; total.gross += value.gross; total.tax += value.tax; total.consumption += value.consumption; total.rows += value.rows;
    }
  }
  async function readBulkHarvest(part: Window, count: number): Promise<BulkHarvest | null> {
    const sample = await getRows(client, player, part, 1, budget);
    const trxId = typeof sample[0]?.trx_id === "string" ? sample[0]!.trx_id as string : "";
    if (!trxId) return null;
    let harvest = transactionCache.get(trxId);
    if (harvest !== undefined) return harvest;
    if (budget.used >= budget.max) throw new Error("request_budget_exhausted");
    budget.used++;
    const lookedUp = await bindRequest("api.transactions.lookup", { trx_id: trxId }).execute(client);
    harvest = null;
    if (lookedUp.ok) {
      const info = (lookedUp.data as Row).trx_info as Row | undefined;
      let decoded: unknown = info?.result;
      if (typeof decoded === "string") { try { decoded = JSON.parse(decoded); } catch { decoded = null; } }
      const decodedResult = decoded as Row | null;
      const resultData = ((decodedResult?.result as Row | undefined)?.data ?? decodedResult?.data) as Row | undefined;
      const results = Array.isArray(resultData?.results) ? resultData.results : [];
      let opData: unknown = info?.data;
      if (typeof opData === "string") { try { opData = JSON.parse(opData); } catch { opData = null; } }
      if (info?.type === "land_operation" && (opData as Row | null)?.op === "harvest_all" && results.length > 0) {
        const totals: BulkHarvest["totals"] = {};
        let matchedRows = results.length;
        for (const entry of results as Row[]) {
          const symbol = String(entry.resource_symbol ?? "");
          if (!symbol) continue;
          const total = totals[symbol] ??= { production: 0, gross: 0, tax: 0, consumption: 0, rows: 0 };
          total.rows++;
          total.production += Number(entry.received_amount ?? 0);
          total.gross += Number(entry.resource_amount ?? 0);
          total.tax += Number(entry.tax_amount ?? 0);
          if (Number(entry.grain_eaten ?? 0) !== 0) { matchedRows++; const grain = (totals.GRAIN ??= { production: 0, gross: 0, tax: 0, consumption: 0, rows: 0 }); grain.consumption += Number(entry.grain_eaten); grain.rows++; }
          for (const input of Array.isArray(entry.inputs_consumed) ? entry.inputs_consumed as Row[] : []) {
            const inputSymbol = String(input.symbol ?? "");
            if (!inputSymbol) continue;
            matchedRows++; const inputTotal = (totals[inputSymbol] ??= { production: 0, gross: 0, tax: 0, consumption: 0, rows: 0 }); inputTotal.consumption += Number(input.qty ?? 0); inputTotal.rows++;
          }
        }
        harvest = { groupRows: count, matchedRows, unmatchedRows: Math.max(0, count - matchedRows), totals, trxId };
      }
    }
    while (transactionCache.size >= 32) transactionCache.delete(transactionCache.keys().next().value!);
    transactionCache.set(trxId, harvest);
    return harvest;
  }
  async function visit(part: Window, knownCount?: number): Promise<void> {
    if (reason) return;
    try {
      const priorRows = rows.length;
      const priorBulkRows = bulk?.groupRows ?? 0;
      const count = knownCount ?? await getCount(client, player, part, budget);
      if (rootExpected === undefined) rootExpected = count;
      expected += count;
      if (count === 0) return;
      if (count <= maxRows || (part.end - part.start <= 1_000 && count <= 100)) {
        let page: Row[];
        try { page = await getRows(client, player, part, count, budget); }
        catch (cause) {
          if (part.end - part.start <= 1 && count > 1 && cause instanceof Error && cause.message.includes("1 MiB window limit")) {
            const harvest = await readBulkHarvest(part, count);
            if (harvest) { addBulk(harvest); return; }
          }
          throw cause;
        }
        if (page.length !== count) { reason = `count_mismatch: expected ${count}, received ${page.length}`; return; }
        for (const row of page) {
          if (!Number.isSafeInteger(row.id) || seen.has(row.id as number)) { reason = "duplicate_or_missing_row_id"; return; }
          seen.add(row.id as number);
          rows.push(row);
        }
        return;
      }
      if (part.end - part.start <= 1) {
        if (count > maxRows) {
          const harvest = await readBulkHarvest(part, count);
          if (harvest) { addBulk(harvest); return; }
          unrecognizedBulk = true;
          return;
        }
        reason = `unsplittable_timestamp: ${count} rows`; return;
      }
      const midpoint = Math.floor((part.start + part.end) / 2);
      if (midpoint <= part.start || midpoint >= part.end) { reason = "unsplittable_window"; return; }
      // The parent count is retained as the completeness check; child counts are not added again.
      expected -= count;
      await visit({ start: part.start, end: midpoint });
      await visit({ start: midpoint, end: part.end });
      const observedDelta = rows.length - priorRows + (bulk?.groupRows ?? 0) - priorBulkRows;
      if (!reason && observedDelta !== count) reason = `count_mismatch: expected ${count}, received ${observedDelta}`;
    } catch (cause) { reason = cause instanceof Error ? cause.message : "history_read_failed"; }
  }
  await visit(window);
  if (unrecognizedBulk) reason = "unrecognized_or_unavailable_harvest_transaction";
  if (bulk?.unmatchedRows) reason = `unmatched_rows: ${bulk.unmatchedRows} of ${bulk.groupRows}`;
  return { rows, complete: !reason && (bulk ? bulk.unmatchedRows === 0 && rows.length + bulk.groupRows === rootExpected : rows.length === rootExpected), expected: rootExpected ?? expected, calls: budget.used - used, ...(reason ? { reason } : {}), ...(bulk ? { bulk } : {}) };
}

function category(row: Row, resourceSymbol: string | null): "production" | "other" {
  const legs = Array.isArray(row.legs) ? row.legs as Row[] : [];
  if (!resourceSymbol || legs.length === 0 || legs.some((leg) => leg.token !== resourceSymbol)) return "other";
  const types = [...new Set(legs.map((leg) => leg.type).filter((type): type is string => typeof type === "string"))];
  if (types.length === 0) return "other";
  if (types.every((type) => PRODUCTION_TYPES.has(type))) return "production";
  return "other";
}
const PRODUCTION_TYPES = new Set(["land_player_resource_mint", "land_uncaptured_tax_mint", "land_resource_castle_tax_mint", "land_resource_keep_tax_mint"]); // live harvest rows, 2026-10-21
export function summarizeDay(date: string, history: HistoryResult, resource?: string): Record<string, unknown> {
  const groups = new Map<string, { resource_id: number; resource_symbol: string | null; production: number; other: number; net: number; rows: number; gross?: number; tax?: number }>();
  const unclassified = new Map<string, number>();
  for (const row of history.rows) {
    const id = Number(row.resource_id);
    const symbol = RESOURCE_SYMBOLS[id] ?? null;
    const key = symbol ?? `RESOURCE_${id}`;
    if (resource && resource !== key) continue;
    const group = groups.get(key) ?? { resource_id: id, resource_symbol: symbol, production: 0, other: 0, net: 0, rows: 0 };
    const rawAmount = Number(row.amount);
    const amount = Math.round(rawAmount * 1000) / 1000;
    if (!Number.isFinite(amount)) continue;
    for (const leg of Array.isArray(row.legs) ? row.legs as Row[] : []) {
      const type = typeof leg.type === "string" ? leg.type : "<missing>";
      if (!PRODUCTION_TYPES.has(type)) unclassified.set(type, (unclassified.get(type) ?? 0) + 1);
    }
    group[category(row, symbol)] += amount;
    group.net += amount;
    group.rows++;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.production = Math.round(group.production * 1_000) / 1_000;
    group.other = Math.round(group.other * 1_000) / 1_000;
    group.net = Math.round(group.net * 1_000) / 1_000;
  }
  if (history.bulk) for (const [symbol, total] of Object.entries(history.bulk.totals)) {
    if (resource && resource !== symbol) continue;
    const existing = groups.get(symbol) ?? { resource_id: Object.entries(RESOURCE_SYMBOLS).find(([, value]) => value === symbol)?.[0] ? Number(Object.entries(RESOURCE_SYMBOLS).find(([, value]) => value === symbol)![0]) : 0, resource_symbol: symbol, production: 0, other: 0, net: 0, rows: 0 };
    existing.production = Math.round((existing.production + total.production) * 1000) / 1000;
    existing.other = Math.round((existing.other - total.consumption) * 1000) / 1000;
    existing.net = Math.round((existing.net + total.production - total.consumption) * 1000) / 1000;
    existing.gross = Math.round((existing.gross ?? 0) + total.gross * 1000) / 1000;
    existing.tax = Math.round((existing.tax ?? 0) + total.tax * 1000) / 1000;
    existing.rows += total.rows;
    groups.set(symbol, existing);
  }
  return { date, basis: history.bulk ? (history.rows.length ? "mixed" : "harvest_transaction") : "history_rows", group_rows: history.bulk?.groupRows ?? 0, matched_rows: (history.bulk?.matchedRows ?? 0) + history.rows.length, unmatched_rows: history.bulk?.unmatchedRows ?? Math.max(0, history.expected - history.rows.length), complete: history.complete && (!history.bulk || history.bulk.unmatchedRows === 0), observed_rows: history.rows.length + (history.bulk?.groupRows ?? 0), expected_rows: history.expected, calls: history.calls, resources: Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))), unclassified_types: Object.fromEntries([...unclassified].sort(([a], [b]) => a.localeCompare(b))), unclassified_leg_count: [...unclassified.values()].reduce((a, b) => a + b, 0), ...(history.reason ? { incomplete_reason: history.reason } : {}) };
}

async function currentRate(client: SplinterlandsHttpClient, player: string): Promise<Record<string, number> | null> {
  const bound = bindRequest("vapi.land.deeds.search", { player, limit: 1000 }, "limited");
  const result = await client.requestStreaming(bound.hostname, bound.path, bound.queryParams, { endpointTemplate: bound.endpointTemplate, timeoutMs: 60_000, consume: projectDeedsBundle });
  if (!result.ok || !result.data.ok || result.data.bundle.upstreamCount >= 1000 || result.data.bundle.stakingMissing > 0) return null;
  const totals: Record<string, number> = {};
  for (const deed of result.data.bundle.rows) {
    const stake = deed.staking as Row | null;
    const worksite = deed.worksite as Row | null;
    if (!stake || !worksite || worksite.is_active !== true || worksite.is_harvesting !== true) continue;
    const symbol = worksite.token_symbol;
    const hourly = Number(stake.total_work_per_hour);
    if (typeof symbol !== "string" || symbol !== deed.resource_symbol || symbol !== RESOURCE_SYMBOLS[Number(deed.resource_id)] || !Number.isFinite(hourly) || hourly < 0) return null;
    totals[symbol] = Math.round(((totals[symbol] ?? 0) + hourly * 24) * 1_000_000) / 1_000_000;
  }
  return totals;
}

export function registerLandIncome(server: McpServer, client: SplinterlandsHttpClient, now: () => number = Date.now): void {
  const cache = new Map<string, { expires: number; value: Record<string, unknown> }>();
  const transactionCache = new Map<string, BulkHarvest | null>();
  const rateCache = new Map<string, { expires: number; value: Record<string, number> }>();
  server.registerTool("land_resources_balances_history_window", {
    description: "Read bounded UTC timestamp windows of one player's public Land balance history. Use counts to skip empty spans and descend only where rows exist; returns count-checked rows with a cursor. A 14-day traversal can use at most 40,320 count/list calls at one-minute granularity, though larger empty spans are skipped.",
    inputSchema: { player: playerSchema, startDate: dateSchema, endDate: dateSchema, cursor: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ player, startDate, endDate, cursor, limit = 100 }) => {
    let start: number, end: number;
    try { start = utcDay(startDate); end = utcDay(endDate); } catch { return error("invalid_input", "Dates must be real UTC calendar dates."); }
    if (end <= start || end - start > 14 * DAY_MS || (cursor !== undefined && (cursor < start || cursor >= end))) return error("invalid_input", "Require a range of 1–14 UTC days and a cursor inside it.");
    const from = cursor ?? start;
    const to = Math.min(from + DAY_MS, end);
    const history = await collect(client, player, { start: from, end: to }, { used: 0, max: 64 }, limit);
    let pageEnd = to;
    let pageRows = history.rows;
    if (history.complete && history.rows.length > limit) {
      const ordered = [...history.rows].sort((a, b) => Date.parse(String(a.created_date)) - Date.parse(String(b.created_date)) || Number(a.id) - Number(b.id));
      const cutoff = Date.parse(String(ordered[limit - 1]!.created_date)) + 1;
      if (Date.parse(String(ordered[limit]!.created_date)) >= cutoff && cutoff < to) {
        pageEnd = cutoff;
        pageRows = ordered.slice(0, limit);
      } else {
        history.complete = false;
        history.reason = "unsplittable_timestamp: page limit cuts a same-second group";
        pageRows = [];
      }
    }
    if (!history.complete) pageRows = pageRows.slice(0, limit);
    const output: Record<string, unknown> = { player, start_date: startDate, end_date: endDate, window_start: iso(from), window_end: iso(pageEnd), rows: pageRows, expected_rows: history.complete ? pageRows.length : history.expected, complete: history.complete, next_cursor: history.complete && pageEnd < end ? pageEnd : null, skip_cursor: !history.complete && to < end ? to : null, ...(history.reason ? { incomplete_reason: history.reason } : {}) };
    if (Buffer.byteLength(JSON.stringify(output)) > MAX_OUTPUT_BYTES) return error("response_too_large", "The projected page exceeded 256 KiB.");
    return success(output);
  });
  server.registerTool("land_income_daily", {
    description: "Summarize up to 14 completed UTC days of public Land balance movements in raw resource units, without DEC valuation. If a same-millisecond group cannot be listed within 100 rows or the documented 1 MiB body cap, one row is read for its transaction ID and the catalogue transaction lookup is used for recognized land_operation harvest_all results. Those days report basis=harvest_transaction (or mixed), group_rows, matched_rows, unmatched_rows and complete; unmatched rows are shown explicitly and keep complete=false while transaction-derived production and consumption totals remain visible. Lookup calls count against the budget and results are cached per transaction ID. current_rate_per_day is a separate estimate from current deeds and staking, not historical realized income. No Hive history is scanned.",
    inputSchema: { player: playerSchema, days: z.number().int().min(1).max(14).optional(), resource: z.string().toUpperCase().regex(/^[A-Z0-9_]+$/).optional(), endDate: dateSchema.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ player, days = 1, resource, endDate }) => {
    let end: number;
    try { end = endDate ? utcDay(endDate) : Math.floor(now() / DAY_MS) * DAY_MS; } catch { return error("invalid_input", "endDate must be a real UTC calendar date."); }
    if (end > Math.floor(now() / DAY_MS) * DAY_MS) return error("invalid_input", "endDate cannot be in the future; only completed UTC days are summarized.");
    const budget: Budget = { used: 0, max: 2048 };
    const entries: Record<string, unknown>[] = [];
    for (let i = 0; i < days; i++) {
      const window = { start: end - (i + 1) * DAY_MS, end: end - i * DAY_MS };
      const key = `${player}:${iso(window.start)}:${resource ?? "*"}`;
      const hit = cache.get(key);
      if (hit && hit.expires > now()) { entries.push(hit.value); continue; }
      const dailyBudget: Budget = { used: budget.used, max: Math.min(budget.used + MAX_DAILY_CALLS, budget.max) };
      const history = await collect(client, player, window, dailyBudget, MAX_DAILY_LEAF_ROWS, transactionCache);
      budget.used = dailyBudget.used;
      const summary = summarizeDay(iso(window.start).slice(0, 10), history, resource);
      if (history.complete) {
        for (const [cachedKey, cached] of cache) if (cached.expires <= now()) cache.delete(cachedKey);
        while (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: now() + 600_000, value: summary });
      }
      entries.push(summary);
    }
    let rate: Record<string, number> | null = null;
    let rateCalls = 0;
    const cachedRate = rateCache.get(player);
    if (cachedRate && cachedRate.expires > now()) rate = cachedRate.value;
    else if (budget.used < budget.max) {
      rateCalls = 1;
      try { rate = await currentRate(client, player); } catch { /* unavailable rate is explicit null */ }
      if (rate !== null) {
        for (const [cachedPlayer, cached] of rateCache) if (cached.expires <= now()) rateCache.delete(cachedPlayer);
        while (rateCache.size >= 16) rateCache.delete(rateCache.keys().next().value!);
        rateCache.set(player, { expires: now() + 120_000, value: rate });
      }
    }
    const filtered = entries.map((entry) => resource ? { ...entry, resources: Object.fromEntries(Object.entries(entry.resources as Record<string, unknown>).filter(([key]) => key === resource)) } : entry);
    const output = { player, days: filtered, current_rate_per_day: rate === null ? null : resource ? { [resource]: rate[resource] ?? 0 } : rate, current_rate_basis: "current_deed_total_work_per_hour_x24_not_historical_income", upstream_calls: budget.used + rateCalls };
    if (Buffer.byteLength(JSON.stringify(output)) > MAX_OUTPUT_BYTES) return error("response_too_large", "The daily summary exceeded 256 KiB.");
    return success(output);
  });
}
