import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./read-tools.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import type { createCardDefinitionLoader } from "./card-definitions.js";

const definitions = [
  ["player_balances", "balances", "players", "Read current token balances for the explicitly supplied players. The players selector can contain a comma-separated list; token_type is an upstream filter. No balances are totalled or converted."],
  ["player_archived_balances", "archived-balances", "players", "Read archived token balances for the explicitly supplied players. Use players: the upstream error message asks for username, but that alias returned HTTP 500 in the recorded probes."],
  ["player_authorities", "authorities", "players", "Read public purchase, delegation and rental authority assignments for the explicitly supplied players. These are public account names, not credentials; this tool never changes authorities."],
  ["player_quests", "quests", "username", "Read the quest rows returned for one player. JSON-encoded rewards strings are passed through unchanged."],
  ["player_skins", "skins", "username", "Read owned skins with their upstream active flag and public card name by card_detail_id. Missing names have an explicit status. Optional skin and active selectors filter this player's inventory locally before start_index continuation; skin matches the exact upstream name. Results fit within 256 KiB or use local continuation."],
  ["player_lp_claim_history", "lp-claim-history", "username", "Read liquidity-provider claim history for one player. In paired probes limit=1 returned one leading row; limit=2 with offset=1 repeated the two rows returned without offset. No working page-two cursor is established."],
  ["player_reward_delegation_history", "reward-delegation-history", "username", "Read reward-delegation history for one player. In paired probes limit=1 returned one leading row, but limit=2 with offset=1 returned an empty array despite a populated response without offset. An empty offset result does not establish the end of history."],
  ["player_reward_delegations", "reward-delegations", "username", "Read current reward-delegation rows for one player. Percent values are returned with their original wire types."],
  ["player_recent_teams", "recent-teams", "player", "Read the public recent team compositions for one player. The credential-bearing decrypt_key parameter is not exposed; this tool never accepts a decryption key."],
  ["player_pack_purchases", "pack-purchases", "username", "Read the upstream pack-purchase summary for one player and optional edition. This is a read operation and never purchases packs."],
  ["player_card_airdrop", "card-airdrop", "username", "Read card-airdrop eligibility and recorded claim information for one player. This tool never claims an airdrop."],
  ["player_voucher", "voucher", "username", "Read the upstream voucher balance and available figures for one player. Values, including negative values, are returned unchanged without interpretation."],
  ["player_dec", "dec", null, "Read the global DEC accounting figures. This endpoint has no declared player selector and does not report a player's DEC balance; use player_balances for that question."],
  ["player_energy_purchase_information", "energy-purchase-information", "username", "Read purchased-energy and purchase-tier information for one player. This tool never purchases energy."],
] as const;

export const PLAYER_COMPLETION_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  definitions.map(([name, suffix]) => [name, `api.players.${suffix}`]),
);

export function registerPlayerCompletion(server: McpServer, client: SplinterlandsHttpClient, loadCardDefinitions: ReturnType<typeof createCardDefinitionLoader>): void {
  registerReadTools(server, client, definitions.map(([name, suffix, selector, description]) => ({
    toolName: name, entryId: `api.players.${suffix}`, description,
    required: selector === null ? [] : [selector],
    ...(name === "player_skins" ? {
      localContinuation: { parameter: "start_index" },
      localSkinFilters: true,
      enrichRows: async (rows: unknown[]) => {
        if (rows.length === 0) return rows;
        let definitions;
        try { definitions = await loadCardDefinitions(); } catch { definitions = undefined; }
        return rows.map((value) => {
          const row = value as Record<string, unknown>;
          const definition = definitions?.ok ? definitions.data.get(row.card_detail_id as number) : undefined;
          return { ...row, card_name: definition?.name ?? null,
            card_name_status: definition ? "known" : definitions?.ok ? "definition_missing" : "definitions_unavailable" };
        });
      },
    } : {}),
  })));
}
