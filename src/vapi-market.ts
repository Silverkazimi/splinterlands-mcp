import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "vapi_market_landing",
    "entryId": "vapi.market.landing",
    "listField": "assets",
    "listEnvelope": "data",
    "description": "Read public market asset summaries. assets accepts comma-separated asset names; PACKS and PACKS,LAND selected 15 and 18 rows. Unfiltered reads returned 979 rows and are locally truncated, not a complete inventory. An authorized player-specific PACKS read returned numOwned on all 15 rows; counts are passed through without inferring how listed items are counted."
  },
  {
    "toolName": "vapi_market_estimated_price",
    "entryId": "vapi.market.estimated-price",
    "required": [
      "asset",
      "detailId"
    ],
    "listField": "prices",
    "listEnvelope": "data",
    "description": "Read estimated market prices for an explicit asset and detailId. PACKS/ALPHA returned minPrice as a string; wire types and currencies are preserved. This is an estimate, not an executable quote."
  },
  {
    "toolName": "vapi_market_asset_metadata",
    "entryId": "vapi.market.meta.asset",
    "required": [
      "assetName"
    ],
    "listField": "details",
    "listEnvelope": "data",
    "description": "Read asset metadata by assetName. All 13 landing-page categories were captured. detailIds accepts comma-separated IDs, not a JSON array string; omission returns all available details, locally bounded. SKINS returned 788 records. Additional per-asset fields are preserved."
  }
,
{
  "toolName": "vapi_market_player_activity",
  "listField": "data",
  "entryId": "vapi.market.player.activity",
  "required": [
    "player",
    "types",
    "sort"
  ],
  "description": "Read account market purchases and sales. The public client uses types=purchase,sale and sort=desc; sale selected sales and asc selected older records. limit bounded returned rows. offset=1 did not select the second record of the unoffset response, so conventional row-offset paging is not established. No complete history claim."
},
{
  "toolName": "vapi_market_player_listings",
  "listField": "data",
  "entryId": "vapi.market.player.listings",
  "required": [
    "player",
    "asset",
    "detailId"
  ],
  "description": "Read the account listing items for one asset/detailId. PACKS/RIFT matched the corresponding row in all_listings. Preserve listing/item identities, currencies, prices and remaining quantities; this does not create or change listings."
},
{
  "toolName": "vapi_market_player_all_listings",
  "listField": "data",
  "entryId": "vapi.market.player.all-listings",
  "required": [
    "player"
  ],
  "description": "Read account listing items across assets, locally bounded. The observed response mixed PACKS, CONSUMABLES, SKINS and MUSIC. The route name does not override local truncation or establish completeness for every account."
},
{
  "toolName": "vapi_market_player_asset_detail_stats",
  "entryId": "vapi.market.player.asset-detail-stats",
  "required": [
    "player",
    "asset",
    "detailId"
  ],
  "description": "Read the upstream owned and listed counts for one account and asset/detailId. PACKS/RIFT returned owned=0 and listed=2. Counts are returned unchanged; their arithmetic relationship is not inferred."
}
] satisfies ReadToolDefinition[];
export const VAPI_MARKET_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));
export function registerVapiMarket(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
