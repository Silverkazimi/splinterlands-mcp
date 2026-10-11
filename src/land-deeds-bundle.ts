import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { formatPlotLabel } from "./plot-references.js";

// Measured 2026-10-11: region 65 returned 1,000 deeds in 3.6 MB and a 131-deed player 0.5 MB, both above the
// 2 MB general response cap. A region holds at most 1,000 plots, so one read with limit=1000 covers it.
const UPSTREAM_LIMIT = 1000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const BUNDLE_TTL_MS = 120 * 1000;
const PAGE_LIMIT = 100;
const TIMEOUT_MS = 60 * 1000;
const MAX_RESULT_BYTES = 256 * 1024;

const DEED_FIELDS = ["deed_uid", "plot_id", "region_number", "tract_number", "plot_number", "region_uid", "territory", "player", "rarity",
  "deed_type", "magic_type", "plot_status", "worksite_type", "resource_symbol", "listed", "in_use", "is_construction"] as const;
const STAKING_FIELDS = ["is_powered", "worker_count", "powered_worker_count", "max_workers_allowed", "total_harvest_pp", "total_base_pp_after_cap",
  "efficiency", "total_work_per_hour"] as const;
const WORKSITE_FIELDS = ["is_active", "is_harvesting", "is_construction", "project_type", "token_symbol", "hours_till_next_op"] as const;

export const LAND_DEEDS_BUNDLE_TOOL_ROUTE: Readonly<Record<string, string>> = {
  land_deeds_bundle: "One bounded `GET /land/deeds` (limit 1000, 8 MiB), projected and cached locally",
};

type Row = Record<string, unknown>;
type Bundle = { rows: Row[]; upstreamCount: number; stakingMissing: number; worksiteMissing: number; bytes: number };
type Consumed = { ok: true; bundle: Bundle } | { ok: false; reason: string };

const rows = (value: unknown) => Array.isArray(value) && value.every((row) => row !== null && typeof row === "object") ? value as Row[] : undefined;
const pick = (row: Row | undefined, fields: readonly string[]) => row === undefined ? null : Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));

async function readBounded(response: Response): Promise<{ text: string } | { bytes: number }> {
  if (response.body === null) return { text: "" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel("land_deeds_bundle_byte_limit");
        return { bytes };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks).toString("utf8") };
}

export async function projectDeedsBundle(response: Response): Promise<Consumed> {
  const body = await readBounded(response);
  if (!("text" in body)) return { ok: false, reason: `The upstream body exceeded this tool's ${MAX_BODY_BYTES}-byte read limit after ${body.bytes} bytes; nothing was projected.` };
  let parsed: unknown;
  try { parsed = JSON.parse(body.text); } catch { return { ok: false, reason: "The upstream body was not valid JSON." }; }
  const envelope = parsed as { status?: unknown; data?: { deeds?: unknown; staking_details?: unknown; worksite_details?: unknown } } | null;
  if (envelope?.status !== "success") return { ok: false, reason: `The upstream status was ${JSON.stringify(envelope?.status ?? null)}, not "success".` };
  const deeds = rows(envelope.data?.deeds);
  if (!deeds) return { ok: false, reason: "The upstream data.deeds was not an array of objects." };
  // An empty search answers staking_details and worksite_details with null rather than [].
  const staking = envelope.data?.staking_details === null ? [] : rows(envelope.data?.staking_details);
  const worksites = envelope.data?.worksite_details === null ? [] : rows(envelope.data?.worksite_details);
  if (!staking || !worksites) return { ok: false, reason: "The upstream staking_details or worksite_details was not an array of objects." };
  const stakingByUid = new Map(staking.map((row) => [row.deed_uid, row]));
  const worksiteByUid = new Map(worksites.map((row) => [row.deed_uid, row]));
  let stakingMissing = 0;
  let worksiteMissing = 0;
  const projected: Row[] = [];
  for (const deed of deeds) {
    if (typeof deed.deed_uid !== "string" || !Number.isSafeInteger(deed.plot_id)) return { ok: false, reason: "A deed row lacked a string deed_uid or an integer plot_id." };
    const stake = stakingByUid.get(deed.deed_uid);
    const worksite = worksiteByUid.get(deed.deed_uid);
    if (!stake) stakingMissing += 1;
    if (!worksite) worksiteMissing += 1;
    const [region, tract, plot] = [deed.region_number, deed.tract_number, deed.plot_number];
    const label = Number.isSafeInteger(region) && Number.isSafeInteger(tract) && Number.isSafeInteger(plot)
      ? formatPlotLabel({ region: region as number, tract: tract as number, plot: plot as number }) : null;
    projected.push({ ...pick(deed, DEED_FIELDS), plot_label: label, staking: pick(stake, STAKING_FIELDS), worksite: pick(worksite, WORKSITE_FIELDS), complete: stake !== undefined });
  }
  return { ok: true, bundle: { rows: projected, upstreamCount: deeds.length, stakingMissing, worksiteMissing, bytes: Buffer.byteLength(body.text) } };
}

export function registerLandDeedsBundle(server: McpServer, client: SplinterlandsHttpClient, now: () => number = Date.now): void {
  const cache = new Map<string, { bundle: Bundle; retrievedAt: string; traceId: string; expiresAt: number }>();
  server.registerTool("land_deeds_bundle", {
    description: "List every deed for one explicit player or one region_number as a compact projection, read with one GET /land/deeds?limit=1000 whose body is buffered up to an 8 MiB limit and parsed whole. A region holds at most 1,000 plots; on 2026-10-11 region 65 returned 1,000 deeds in 3.6 MB, above the general 2 MB cap that makes land_deeds_search return only {status}. Each row carries deed_uid, plot_id, plot_label, region_number, tract_number, plot_number, region_uid, territory, player, rarity, deed_type (the terrain), magic_type, plot_status, worksite_type, resource_symbol, listed, in_use and is_construction. It also carries staking (is_powered, worker_count, powered_worker_count, max_workers_allowed, total_harvest_pp, total_base_pp_after_cap, efficiency, total_work_per_hour) and worksite (is_active, is_harvesting, is_construction, project_type, token_symbol, hours_till_next_op), joined by deed_uid. A deed without a staking row has staking null and complete false; worksite null means no worksite row was returned. Values are passed through unchanged. The projection is cached for 120 seconds per scope, and cursor pages of up to 100 rows are served from it. Every page reports retrieved_at and age_ms. truncated is true when a player scope returned 1,000 deeds, because more may exist; upstream offset is not used, so a fuller list is not available. A region scope cannot exceed 1,000 plots and is never marked truncated. An over-limit or malformed body is reported as an error with a reason, never as a bare status or an empty list.",
    inputSchema: {
      player: z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]+[a-z0-9]$/).optional(),
      region_number: z.number().int().min(1).max(150).optional(),
      cursor: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(PAGE_LIMIT).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ player, region_number, cursor = 0, limit = PAGE_LIMIT }) => {
    const failure = (kind: string, text: string) => ({ isError: true, content: [{ type: "text" as const, text }], structuredContent: { kind, reason: text } });
    if ((player === undefined) === (region_number === undefined)) return failure("invalid_input", "Supply exactly one of player or region_number.");
    const scope = player !== undefined ? { player } : { region_number: region_number! };
    const key = JSON.stringify(scope);
    let entry = cache.get(key);
    const cacheHit = entry !== undefined && entry.expiresAt > now();
    if (!cacheHit) {
      cache.delete(key);
      const bound = bindRequest("vapi.land.deeds.search", { ...scope, limit: UPSTREAM_LIMIT }, "limited");
      const result = await client.requestStreaming(bound.hostname, bound.path, bound.queryParams, {
        endpointTemplate: bound.endpointTemplate, timeoutMs: TIMEOUT_MS, consume: projectDeedsBundle,
      });
      if (!result.ok) return failure(result.kind, result.message);
      if (!result.data.ok) return failure("response_not_projected", result.data.reason);
      for (const [cachedKey, cached] of cache) if (cached.expiresAt <= now()) cache.delete(cachedKey);
      while (cache.size >= 16) cache.delete(cache.keys().next().value!);
      entry = { bundle: result.data.bundle, retrievedAt: result.freshness.retrievedAt, traceId: result.traceId, expiresAt: now() + BUNDLE_TTL_MS };
      cache.set(key, entry);
    }
    const { bundle } = entry!;
    let page = bundle.rows.slice(cursor, cursor + limit);
    let nextCursor = cursor + page.length < bundle.rows.length ? cursor + page.length : null;
    const structuredContent = {
      scope, rows: page, cursor, next_cursor: nextCursor, total: bundle.rows.length,
      // A region holds at most 1,000 plots, so only a player scope can be cut off by the upstream limit.
      truncated: "player" in scope && bundle.upstreamCount >= UPSTREAM_LIMIT,
      staking_missing_count: bundle.stakingMissing, worksite_missing_count: bundle.worksiteMissing,
      cache: cacheHit ? "hit" : "miss", retrieved_at: entry!.retrievedAt, age_ms: Math.max(0, now() - Date.parse(entry!.retrievedAt)),
      upstream_bytes: bundle.bytes, traceId: entry!.traceId,
    };
    // Rows pass through unchanged, so enforce the caller-facing 256 KiB bound by shortening the page.
    while (Buffer.byteLength(JSON.stringify(structuredContent)) > MAX_RESULT_BYTES && page.length > 0) {
      page = page.slice(0, -1);
      nextCursor = cursor + page.length;
      structuredContent.rows = page;
      structuredContent.next_cursor = nextCursor;
    }
    if (page.length === 0 && bundle.rows.length > cursor) return failure("response_too_large", "A single projected deed row exceeds 256 KiB; no partial row is returned.");
    const notes = [
      bundle.rows.length === 0 ? "The upstream returned no deeds for this scope; that does not establish that the account or region has none." : "",
      structuredContent.truncated ? `The upstream returned ${UPSTREAM_LIMIT} deeds, its requested maximum; more may exist and are not listed.` : "",
      nextCursor === null ? "There is no next cursor." : `Request cursor ${nextCursor} for the next page; it is served from the cached projection.`,
    ].filter(Boolean).join(" ");
    return { content: [{ type: "text" as const, text: `${JSON.stringify(structuredContent)} ${notes}` }], structuredContent };
  });
}
