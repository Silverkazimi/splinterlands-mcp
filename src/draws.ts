import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CARD_DETAILS_TTL_MS } from "./http/cache.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  { toolName: "ranked_draws_status", entryId: "api.ranked-draws.status", description: "Read the current and first-unclaimed ranked draw status. username is optional and is forwarded as an explicit account-scoped selector when supplied; no account is assumed." },
  { toolName: "ranked_draws_prize_overview", entryId: "api.ranked-draws.prize-overview", cacheTtlMs: CARD_DETAILS_TTL_MS, description: "Read the ranked draw prize totals and foil breakdowns. This static-ish metadata response is cached for 24 hours." },
  { toolName: "ranked_draws_complete", entryId: "api.ranked-draws.complete", listField: "draws", description: "Read completed ranked draws and their verification data. The upstream list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "ranked_draws_entries_completed", entryId: "api.ranked-draws.entries-completed", required: ["id"], description: "Read completed-entry rows for one explicit numeric ranked draw id. The upstream list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "ranked_draws_available_prizes", entryId: "api.ranked-draws.available-prizes", cacheTtlMs: CARD_DETAILS_TTL_MS, description: "Read currently available ranked draw prizes. This static-ish metadata response is cached for 24 hours; the upstream list is unbounded and locally bounded to 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "ranked_draws_recent_prizes", entryId: "api.ranked-draws.recent-prizes", listField: "mints", description: "Read recent ranked draw mints. The upstream mints list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "frontier_draws_status", entryId: "api.frontier-draws.status", description: "Read the current and first-unclaimed frontier draw status. username is optional and is forwarded as an explicit account-scoped selector when supplied; no account is assumed." },
  { toolName: "frontier_draws_prize_overview", entryId: "api.frontier-draws.prize-overview", cacheTtlMs: CARD_DETAILS_TTL_MS, description: "Read the frontier draw prize totals and foil breakdowns. This static-ish metadata response is cached for 24 hours." },
  { toolName: "frontier_draws_complete", entryId: "api.frontier-draws.complete", listField: "draws", description: "Read completed frontier draws and their verification data. The upstream list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "frontier_draws_entries_completed", entryId: "api.frontier-draws.entries-completed", required: ["id"], description: "Read completed-entry rows for one explicit numeric frontier draw id. The upstream list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "frontier_draws_available_prizes", entryId: "api.frontier-draws.available-prizes", cacheTtlMs: CARD_DETAILS_TTL_MS, description: "Read currently available frontier draw prizes. This static-ish metadata response is cached for 24 hours; the upstream list is unbounded and locally bounded to 100 rows and 256 KiB with an explicit truncation notice." },
  { toolName: "frontier_draws_recent_prizes", entryId: "api.frontier-draws.recent-prizes", listField: "mints", description: "Read recent frontier draw mints. The upstream mints list is unbounded; this server returns at most 100 rows and 256 KiB with an explicit truncation notice." },
] satisfies ReadToolDefinition[];

export const DRAW_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  definitions.map(({ toolName, entryId }) => [toolName, entryId]),
);

export function registerDraws(server: McpServer, client: SplinterlandsHttpClient, now: () => number): void {
  registerReadTools(server, client, definitions, now);
}
