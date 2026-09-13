import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";
const definitions = [
{
  "toolName": "rental_offers_by_player",
  "entryId": "vapi.delegation-rental.v3.offers.player",
  "required": [
    "player",
    "limit"
  ],
  "listField": "data",
  "description": "Read public SPSP delegation offers for an explicit player. Require limit 1-100; one bounded GET, no automatic paging. Two pages of two matched four rows; amount asc/desc changed the observed ordering. Preserve numeric strings and all original fields. These are token delegations, not card-worker rentals. Status filled selected zero-available rows; do not infer filled state from the numeric offer status alone."
},
{
  "toolName": "rental_bids_by_player",
  "entryId": "vapi.delegation-rental.v3.bids.player",
  "required": [
    "player",
    "limit"
  ],
  "listField": "data",
  "description": "Read public SPSP delegation bids for an explicit player. Require limit 1-100; one bounded GET, no automatic paging. Two pages of two matched four rows; amount asc/desc changed the observed ordering. Preserve numeric strings and all original fields. These are token delegations, not card-worker rentals. Status filled selected zero-available rows; do not infer filled state from the numeric offer status alone."
},
{
  "toolName": "rentals_v3_by_player",
  "entryId": "vapi.delegation-rental.v3.rentals.player",
  "required": [
    "player",
    "limit"
  ],
  "listField": "data",
  "description": "Read public SPSP delegation rental records for an explicit player. Require limit 1-100; one bounded GET, no automatic paging. Two pages of two matched four rows; amount asc/desc changed the observed ordering. Preserve numeric strings and all original fields. These are token delegations, not card-worker rentals. Borrower/lender roles were checked in both directions. Pending and active selected numeric status 0 and 1 in the sample. Counterparty partial matching was verified on the player route only; other sort/status values remain unmeasured."
},
{
  "toolName": "rentals_v3_by_role",
  "entryId": "vapi.delegation-rental.v3.rentals.player.role",
  "required": [
    "player",
    "limit",
    "role"
  ],
  "listField": "data",
  "description": "Read public SPSP delegation rental records for an explicit player and borrower/lender role. Require limit 1-100; one bounded GET, no automatic paging. Two pages of two matched four rows; amount asc/desc changed the observed ordering. Preserve numeric strings and all original fields. These are token delegations, not card-worker rentals. Borrower/lender roles were checked in both directions. Pending and active selected numeric status 0 and 1 in the sample. Counterparty partial matching was verified on the player route only; other sort/status values remain unmeasured."
},
{
  "toolName": "rentals_by_bid",
  "entryId": "vapi.delegation-rental.rentals.bid",
  "required": [
    "bid",
    "limit"
  ],
  "listField": "data",
  "description": "Read legacy SPSP delegation rental records for an explicit bid transaction ID and limit of 1 to 100. A populated bid response matched the corresponding player rental record. Preserve numeric wire strings. Paging and sort effectiveness are not established; one bounded response, no automatic continuation. These are token delegation rentals, not worker-card rentals."
},
{
  "toolName": "rentals_by_player",
  "entryId": "vapi.delegation-rental.rentals.player",
  "required": [
    "player",
    "limit"
  ],
  "listField": "data",
  "description": "Read legacy SPSP delegation rental records for an explicit player and limit of 1 to 100. One populated record was observed. Paging and sort behavior are not yet independently established. Preserve quantity, paymentAmount and pricePerToken as wire strings; these are token delegation rentals, not worker-card rentals. Returns one bounded response without automatic continuation."
},
  {
    "toolName": "rental_offers",
    "entryId": "vapi.delegation-rental.v3.offers",
    "required": [
      "limit"
    ],
    "listField": "data",
    "description": "Read public SPSP delegation rental offers with an explicit limit of 1 to 100. Two pages of two transaction IDs matched the first four rows. Quantity bounds worked, including a 10000 exact range. Price filters accepted integer 1 but rejected decimal 0.001 with HTTP 400; values are forwarded without rescaling. A combined player, amount-ascending, maxPrice=1 and quantity-range probe returned only the selected player and in-range quantities. Other combinations remain unmeasured. These are token delegation offers/bids, not card-worker rentals. Quantities, prices and escrow retain their wire string types."
  },
  {
    "toolName": "rental_offers_lowest_price",
    "entryId": "vapi.delegation-rental.v3.offers.lowest-price",
    "description": "Read the public V3 delegation rental offers lowest-price endpoint. Preserve its price string, or nullable price allowed by the official schema. No unit conversion, annualization, quote execution or card-rental inference is performed."
  },
  {
    "toolName": "rental_bids",
    "entryId": "vapi.delegation-rental.v3.bids",
    "required": [
      "limit"
    ],
    "listField": "data",
    "description": "Read public SPSP delegation rental bids with an explicit limit of 1 to 100. Two pages of two transaction IDs matched the first four rows. Quantity bounds worked, including a 10000 exact range. Price filters accepted integer 1 but rejected decimal 0.001 with HTTP 400; values are forwarded without rescaling. A combined player, amount-ascending, maxPrice=1 and quantity-range probe returned only the selected player and in-range quantities. Other combinations remain unmeasured. These are token delegation offers/bids, not card-worker rentals. Quantities, prices and escrow retain their wire string types."
  },
  {
    "toolName": "rental_bids_lowest_price",
    "entryId": "vapi.delegation-rental.v3.bids.lowest-price",
    "description": "Read the public V3 delegation rental bids lowest-price endpoint. Preserve its price string, or nullable price allowed by the official schema. No unit conversion, annualization, quote execution or card-rental inference is performed."
  }
] satisfies ReadToolDefinition[];
export const RENTAL_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));
export function registerRentals(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
