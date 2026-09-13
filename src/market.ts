import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "market_for_sale_grouped",
    "entryId": "api.market.for-sale-grouped",
    "description": "Read grouped card-sale price and quantity summaries. The observed response had 2321 groups; only a bounded leading portion is returned. No working paging selector is established."
  },
  {
    "toolName": "market_for_rent_grouped",
    "entryId": "api.market.for-rent-grouped",
    "description": "Read grouped card-rental price and quantity summaries, including season_qty and daily_qty. The observed response had 1710 groups; only a bounded leading portion is returned."
  },
  {
    "toolName": "market_active_rentals",
    "entryId": "api.market.active-rentals",
    "requiredAny": [
      "owner",
      "renter",
      "card_detail_id"
    ],
    "description": "Read current card rentals scoped by owner, renter or card_detail_id. These selectors were observed independently of Swagger. limit and take bound leading rows; offset=2 and skip=2 repeated the first two rows, these declared selectors remain forwardable for inspection but are not working pagination. This is not complete rental history.",
    "exclusive": [
      [
        "limit",
        "take"
      ]
    ]
  },
  {
    "toolName": "market_query_by_card",
    "entryId": "api.market.market-query-by-card",
    "requiredAny": [
      "id",
      "card_detail_id"
    ],
    "description": "Read individual listings for one card definition using id or card_detail_id. The captured sale query returned flat listing rows. type=rent with rental_type=season returned seasonal listings; omitting rental_type returned empty for the same card. Limit is a leading-row bound; no page-two control is established.",
    "exclusive": [
      [
        "id",
        "card_detail_id"
      ]
    ]
  },
  {
    "toolName": "market_query_grouped",
    "entryId": "api.market.market-query-grouped",
    "required": [
      "card_ids"
    ],
    "description": "Read listing groups for explicitly supplied comma-separated card definition IDs. Each group has card_detail_id, foil and a nested result list. With two card IDs, limit=1 returned one listing inside each group. This is different from a global row limit. type=rent with rental_type=season returned seasonal listings. Groups are returned intact or refused if a group cannot fit the result bound."
  },
  {
    "toolName": "market_history",
    "entryId": "api.market.history",
    "required": [
      "player"
    ],
    "description": "Read card market history for one player. include_sets is forwarded only when explicitly supplied; its effect has not been established. The capture had 126 rows and no proven paging selector."
  },
  {
    "toolName": "market_rental_history",
    "entryId": "api.market.rental-history",
    "requiredAny": [
      "player",
      "username"
    ],
    "description": "Read card rental history with an explicit player or username. Both account aliases returned the same two rows; limit and take bounded leading rows. offset=1 and skip=1 returned empty even though limit=2 without offset returned two rows. An empty offset result does not prove the end of history.",
    "exclusive": [
      [
        "player",
        "username"
      ],
      [
        "limit",
        "take"
      ],
      [
        "offset",
        "skip"
      ]
    ]
  },
  {
    "toolName": "market_volume",
    "entryId": "api.market.volume",
    "description": "Read the upstream market transaction, USD volume and current rental aggregate figures. Preserve the wire values and units; this endpoint is not an individual player's history."
  },
  {
    "toolName": "market_status",
    "entryId": "api.market.status",
    "requiredAny": [
      "id",
      "ids"
    ],
    "description": "Read market status by one listing sell transaction id or comma-separated ids. Singular id returns one record when found, plural ids returns an array. An unmatched id returned an empty array. Supply exactly one selector; no record does not establish why it is absent.",
    "exclusive": [
      [
        "id",
        "ids"
      ]
    ]
  },
  {
    "toolName": "market_active_status",
    "entryId": "api.market.active-status",
    "requiredAny": [
      "id",
      "ids"
    ],
    "description": "Read active market status by one listing sell transaction id or comma-separated ids. Singular and plural selectors have distinct object and array response shapes. Supply exactly one selector; this route is separate from completed status.",
    "exclusive": [
      [
        "id",
        "ids"
      ]
    ]
  },
  {
    "toolName": "market_completed_status",
    "entryId": "api.market.completed-status",
    "requiredAny": [
      "id",
      "ids"
    ],
    "description": "Read completed market status by one listing sell transaction id or comma-separated ids. Singular and plural selectors have distinct object and array response shapes. Supply exactly one selector; returned payment quantities remain strings.",
    "exclusive": [
      [
        "id",
        "ids"
      ]
    ]
  },
  {
    "toolName": "market_for_sale_packages",
    "entryId": "api.market.for-sale-packages",
    "description": "Read listed card packages, retaining each package's cards intact. Only complete packages within the local result bound are returned; a package too large to fit is refused without dropping its cards."
  },
  {
    "toolName": "purchase_settings",
    "entryId": "api.purchases.settings",
    "description": "Read public purchase price and fee settings. This makes no purchase and changes no setting."
  },
  {
    "toolName": "purchase_stats",
    "entryId": "api.purchases.stats",
    "description": "Read public pack and promotional-card statistics. Pack editions may have different fields and nested types; all wire values are retained. This makes no purchase."
  },
  {
    "toolName": "purchase_uniswap_reward",
    "entryId": "api.purchases.check-uniswap-reward",
    "required": [
      "address"
    ],
    "description": "Read public liquidity reward rows for an explicitly supplied blockchain address. Decimal quantities are returned as strings. This never claims rewards and accepts no wallet credentials."
  }
] satisfies ReadToolDefinition[];

export const MARKET_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerMarket(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
