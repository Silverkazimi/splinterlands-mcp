import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { SETTINGS_TTL_MS } from "./http/cache.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "game_settings",
    "entryId": "api.settings",
    "cacheTtlMs": SETTINGS_TTL_MS,
    "description": "Read current public settings from the API, cached for one hour per exact query. Matching version and config_version still returned the full settings body; they are not a delta protocol. The server never transcribes configuration constants into this tool."
  },
  {
    "toolName": "game_last_block",
    "entryId": "api.last-block",
    "description": "Read the latest block number reported by the game API. This is not cached by the settings cache."
  },
  {
    "toolName": "game_maintenance",
    "entryId": "api.maintenance-schedule",
    "listField": "maintenance_windows",
    "description": "Read scheduled maintenance windows and window_buffer_ms. Explicit date bounds are forwarded; the tested September range retained the same upcoming window, so complete filtering semantics are not established."
  },
  {
    "toolName": "transaction_lookup",
    "entryId": "api.transactions.lookup",
    "required": [
      "trx_id"
    ],
    "description": "Read one game transaction by explicit trx_id. Transaction data and result retain their JSON-encoded string wire types. An unknown ID returned an error object. This never submits or retries a game transaction."
  },
  {
    "toolName": "transaction_metrics",
    "entryId": "api.transactions.metrics",
    "required": [
      "metrics",
      "from"
    ],
    "description": "Read named transaction metric series from an explicit date. Comma-separated battles,battles-modern selected both series and from narrowed the captured history to two recent points each. The unfiltered capture was about 1 MiB; each returned metric series remains intact under the result bound."
  },
  {
    "toolName": "game_vapi_health",
    "entryId": "vapi.health",
    "description": "Read the public VAPI health root, which reports status and application/version/environment metadata. This is a health read, not a claim that all game routes are available."
  }
] satisfies ReadToolDefinition[];

export const GAME_METADATA_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerGameMetadata(server: McpServer, client: SplinterlandsHttpClient, now: () => number): void {
  registerReadTools(server, client, definitions, now);
}
