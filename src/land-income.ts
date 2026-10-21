import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { projectDeedsBundle } from "./land-deeds-bundle.js";

const HISTORY = "vapi.land.resources.balances-history";
const COUNT = "vapi.land.resources.balances-history-count";
const DAY_MS = 86_400_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_HISTORY_BODY_BYTES = 512 * 1024;
const RESOURCE_SYMBOLS: Record<number, string> = { 1: "GRAIN", 2: "SPS", 3: "RESEARCH", 5: "WOOD", 6: "STONE", 7: "IRON" }; // paired live deed id/symbol fields, 2026-10-21
export const LAND_INCOME_TOOL_ROUTES = {
  land_resources_balances_history: "GET /land/resources/balances/history/{player} and /count in bounded UTC timestamp windows; no upstream offset",
  land_income_daily: "Count-checked `GET /land/resources/balances/history/{player}` windows plus a separate current deed work-rate estimate",
};

type Row = Record<string, unknown>;
type Window = { start: number; end: number };
type Budget = { used: number; max: number };
type HistoryResult = { rows: Row[]; complete: boolean; expected: number; calls: number; reason?: string };
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
  const bound = bindRequest(COUNT, { player, startDate: iso(window.start), endDate: iso(window.end) });
  const result = await bound.execute(client);
  if (!result.ok) throw new Error(`${result.kind}: ${result.message}`);
  const count = (result.data as { data?: { count?: unknown } }).data?.count;
  if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error("Malformed history count.");
  return count as number;
}
async function getRows(client: SplinterlandsHttpClient, player: string, window: Window, limit: number, budget: Budget): Promise<Row[]> {
  if (budget.used >= budget.max) throw new Error("request_budget_exhausted");
  budget.used++;
  const bound = bindRequest(HISTORY, { player, startDate: iso(window.start), endDate: iso(window.end), limit });
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
            throw new Error("History response exceeded the 512 KiB window limit.");
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

// Date filters are half-open in the measured probes. Splitting by time avoids the broken positive offset.
async function collect(client: SplinterlandsHttpClient, player: string, window: Window, budget: Budget, maxRows = 10): Promise<HistoryResult> {
  const used = budget.used;
  let expected = 0;
  let rootExpected: number | undefined;
  const rows: Row[] = [];
  const seen = new Set<number>();
  let reason: string | undefined;
  async function visit(part: Window, knownCount?: number): Promise<void> {
    if (reason) return;
    try {
      const priorRows = rows.length;
      const count = knownCount ?? await getCount(client, player, part, budget);
      if (rootExpected === undefined) rootExpected = count;
      expected += count;
      if (count === 0) return;
      if (count <= maxRows) {
        const page = await getRows(client, player, part, count, budget);
        if (page.length !== count) { reason = `count_mismatch: expected ${count}, received ${page.length}`; return; }
        for (const row of page) {
          if (!Number.isSafeInteger(row.id) || seen.has(row.id as number)) { reason = "duplicate_or_missing_row_id"; return; }
          seen.add(row.id as number);
          rows.push(row);
        }
        return;
      }
      if (part.end - part.start <= 1_000) { reason = `unsplittable_timestamp: ${count} rows`; return; }
      const midpoint = Math.floor((part.start + part.end) / 2 / 1_000) * 1_000;
      if (midpoint <= part.start || midpoint >= part.end) { reason = "unsplittable_window"; return; }
      // The parent count is retained as the completeness check; child counts are not added again.
      expected -= count;
      await visit({ start: part.start, end: midpoint });
      await visit({ start: midpoint, end: part.end });
      if (!reason && rows.length - priorRows !== count) reason = `count_mismatch: expected ${count}, received ${rows.length - priorRows}`;
    } catch (cause) { reason = cause instanceof Error ? cause.message : "history_read_failed"; }
  }
  await visit(window);
  return { rows, complete: !reason && rows.length === rootExpected, expected: rootExpected ?? expected, calls: budget.used - used, ...(reason ? { reason } : {}) };
}

function category(row: Row, resourceSymbol: string | null): "production" | "spends" | "transfers" | "other" {
  const legs = Array.isArray(row.legs) ? row.legs as Row[] : [];
  if (!resourceSymbol || legs.length === 0 || legs.some((leg) => leg.token !== resourceSymbol)) return "other";
  const types = [...new Set(legs.map((leg) => leg.type).filter((type): type is string => typeof type === "string"))];
  if (types.length === 0) return "other";
  if (types.every((type) => PRODUCTION_TYPES.has(type))) return "production";
  return "other";
}
const PRODUCTION_TYPES = new Set(["land_player_resource_mint", "land_uncaptured_tax_mint", "land_resource_castle_tax_mint", "land_resource_keep_tax_mint"]); // live harvest rows, 2026-10-21
export function summarizeDay(date: string, history: HistoryResult, resource?: string): Record<string, unknown> {
  const groups = new Map<string, { resource_id: number; resource_symbol: string | null; production: number; spends: number; transfers: number; other: number; net: number; rows: number }>();
  const unclassified = new Map<string, number>();
  for (const row of history.rows) {
    const id = Number(row.resource_id);
    const symbol = RESOURCE_SYMBOLS[id] ?? null;
    const key = symbol ?? `RESOURCE_${id}`;
    if (resource && resource !== key) continue;
    const group = groups.get(key) ?? { resource_id: id, resource_symbol: symbol, production: 0, spends: 0, transfers: 0, other: 0, net: 0, rows: 0 };
    const amount = Number(row.amount);
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
  return { date, complete: history.complete, observed_rows: history.rows.length, expected_rows: history.expected, calls: history.calls, resources: Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))), unclassified_types: Object.fromEntries([...unclassified].sort(([a], [b]) => a.localeCompare(b))), unclassified_leg_count: [...unclassified.values()].reduce((a, b) => a + b, 0), ...(history.reason ? { incomplete_reason: history.reason } : {}) };
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
  const rateCache = new Map<string, { expires: number; value: Record<string, number> }>();
  server.registerTool("land_resources_balances_history", {
    description: "Read a bounded UTC timestamp window of one player's public Land balance history. Supply startDate and endDate (end exclusive). cursor is a millisecond UTC timestamp for the next window; limit is a real upstream row limit (1–10). The server divides a window when its count exceeds limit, streams at most 512 KiB of upstream JSON, projects only accounting fields, and returns next_cursor. If complete=false, skip_cursor advances past the incomplete minute while explicitly forfeiting its missing rows. It never uses broken upstream offset. Empty minutes still cost one count request each: a 14-day range can require 20,160 page calls. A page has at most 10 rows and 256 KiB.",
    inputSchema: { player: playerSchema, startDate: dateSchema, endDate: dateSchema, cursor: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(10).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ player, startDate, endDate, cursor, limit = 10 }) => {
    let start: number, end: number;
    try { start = utcDay(startDate); end = utcDay(endDate); } catch { return error("invalid_input", "Dates must be real UTC calendar dates."); }
    if (end <= start || end - start > 14 * DAY_MS || (cursor !== undefined && (cursor < start || cursor >= end))) return error("invalid_input", "Require a range of 1–14 UTC days and a cursor inside it.");
    const from = cursor ?? start;
    const to = Math.min(from + 60_000, end); // one-minute windows keep both upstream and caller bodies small
    const history = await collect(client, player, { start: from, end: to }, { used: 0, max: 12 }, limit);
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
    description: "Summarize up to 14 completed UTC days of public Land balance movements in raw resource units, without DEC valuation. Production includes only observed Land mint leg types; no spend or transfer leg type has been confirmed. Unknown legs are counted in unclassified_types and their rows remain other. complete applies to history coverage, verified against each timestamp-window count. Busy days can remain incomplete. current_rate_per_day is a separate estimate from current deeds and staking, not historical realized income. No Hive history is scanned.",
    inputSchema: { player: playerSchema, days: z.number().int().min(1).max(14).optional(), resource: z.string().toUpperCase().regex(/^[A-Z0-9_]+$/).optional(), endDate: dateSchema.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ player, days = 1, resource, endDate }) => {
    let end: number;
    try { end = endDate ? utcDay(endDate) : Math.floor(now() / DAY_MS) * DAY_MS; } catch { return error("invalid_input", "endDate must be a real UTC calendar date."); }
    if (end > Math.floor(now() / DAY_MS) * DAY_MS) return error("invalid_input", "endDate cannot be in the future; only completed UTC days are summarized.");
    const budget: Budget = { used: 0, max: 95 };
    const entries: Record<string, unknown>[] = [];
    for (let i = 0; i < days; i++) {
      const window = { start: end - (i + 1) * DAY_MS, end: end - i * DAY_MS };
      const key = `${player}:${iso(window.start)}:${resource ?? "*"}`;
      const hit = cache.get(key);
      if (hit && hit.expires > now()) { entries.push(hit.value); continue; }
      const dailyBudget: Budget = { used: budget.used, max: Math.min(budget.used + 32, budget.max) };
      const history = await collect(client, player, window, dailyBudget);
      budget.used = dailyBudget.used;
      const summary = summarizeDay(iso(window.start).slice(0, 10), history, resource);
      if (history.complete) {
        for (const [cachedKey, cached] of cache) if (cached.expires <= now()) cache.delete(cachedKey);
        while (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: now() + 60_000, value: summary });
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
