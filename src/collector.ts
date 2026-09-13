import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";
const definitions = [
{
  "toolName": "collector_stickers_tradeable",
  "entryId": "vapi.collector.stickers.tradeable",
  "required": [
    "player"
  ],
  "listField": "data",
  "description": "Read one player's tradeable collector stickers. Two public featured accounts returned 26 and 49 rows with isTradeable=true. Preserve sticker identities, trade/list flags, cosmetic metadata and relative asset paths. One bounded GET, no automatic paging; at most 100 complete rows and 256 KiB. This is not the for-sale route and does not list, transfer or buy anything."
},
{
  "toolName": "collector_player",
  "entryId": "vapi.collector.player",
  "required": [
    "player"
  ],
  "description": "Read one player collector overview with binder summaries. Preserve original fields and relative asset paths. One GET, no card metadata fan-out, purchases or layout changes. Oversized objects are refused as a whole."
},
{
  "toolName": "collector_binder",
  "entryId": "vapi.collector.binder",
  "required": [
    "player",
    "binderRef"
  ],
  "description": "Read one public collector binder by player and binder reference; the observed slug selected three pages and 27 card slots, plus sticker placements. Preserve original fields and relative asset paths. One GET, no card metadata fan-out, purchases or layout changes. Oversized objects are refused as a whole."
},
{
  "toolName": "collector_stickers",
  "entryId": "vapi.collector.stickers.all",
  "required": [
    "player"
  ],
  "description": "Read the full sticker-list route for one player; the observed four rows included ownership and trade/list flags plus cosmetic metadata. Preserve original fields and relative asset paths. One GET, no card metadata fan-out, purchases or layout changes. Lists are locally bounded; the route name does not promise complete holdings.",
  "listField": "data"
},
  {
    "toolName": "collector_config",
    "entryId": "vapi.collector.config",
    "description": "Read the complete public collector configuration: page/slot limits, claim availability, shop metadata, featured accounts and cosmetic definitions. The captured response was about 15 KiB. These are upstream configuration values; reading shop or claim metadata performs no purchase or claim. Preserve relative asset paths, nullable asset URLs and every returned field. Oversized configuration is refused as a whole, not partially truncated."
  }
] satisfies ReadToolDefinition[];
export const COLLECTOR_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));
export function registerCollector(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
