import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CARD_DETAILS_TTL_MS } from "./http/cache.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const CARDS_MINT_HISTORY_ENTRY_ID = "api.cards.mint-history";
const CARDS_PACK_JACKPOT_OVERVIEW_ENTRY_ID = "api.cards.pack-jackpot-overview";
const CARDS_CA_GOLD_REWARDS_ENTRY_ID = "api.cards.ca-gold-rewards";

export const CARD_MINT_ENTRY_IDS = {
  cards_mint_history: CARDS_MINT_HISTORY_ENTRY_ID,
  cards_pack_jackpot_overview: CARDS_PACK_JACKPOT_OVERVIEW_ENTRY_ID,
  cards_ca_gold_rewards: CARDS_CA_GOLD_REWARDS_ENTRY_ID,
} as const;

const definitions = [
  {
    toolName: "cards_mint_history",
    entryId: CARDS_MINT_HISTORY_ENTRY_ID,
    listField: "mints",
    required: ["card_detail_id", "foil"],
    description: "Read the public mint history for one card detail and foil. The populated observation returned total, total_minted and mints; an empty card returned total and mints without total_minted. The upstream's by_date/by_date_edition form was observed separately but is not exposed because this tool binds the card_detail_id plus foil contract. Mint rows retain the upstream wire fields and account names are public upstream data, not supplied by this server.",
  },
  {
    toolName: "cards_pack_jackpot_overview",
    entryId: CARDS_PACK_JACKPOT_OVERVIEW_ENTRY_ID,
    required: ["edition"],
    cacheTtlMs: CARD_DETAILS_TTL_MS,
    description: "Read the public pack jackpot circulation overview for one edition. The response is a bare array of card totals with per-foil totals; an empty array is a valid upstream answer for editions with no observed rows.",
  },
  {
    toolName: "cards_ca_gold_rewards",
    entryId: CARDS_CA_GOLD_REWARDS_ENTRY_ID,
    cacheTtlMs: CARD_DETAILS_TTL_MS,
    description: "Read the public card gold-reward counts. The response is a bare array and count remains a JSON string exactly as sent by the upstream.",
  },
] satisfies ReadToolDefinition[];

export function registerCardMints(server: McpServer, client: SplinterlandsHttpClient, now: () => number): void {
  registerReadTools(server, client, definitions, now);
}
