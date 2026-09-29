import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  { toolName: "player_dyk", entryId: "api.players.dyk", description: "Read public did-you-know tips and lore for an explicit locale. This does not establish coverage of every locale." },
  { toolName: "player_daily_updates", entryId: "api.players.daily-updates", description: "Read the public daily-update object, including its upstream enabled flag, announcement and did-you-know data." },
  { toolName: "player_burn_event_player", entryId: "api.players.burn-event-player", required: ["username"], description: "Read the public burn-event player record for an explicit username. A missing username was rejected by the upstream; this is not account-existence proof." },
  { toolName: "player_burn_event_prizes", entryId: "api.players.burn-event-prizes", required: ["username"], description: "Read the public burn-event prize summary for an explicit username without inferring a claimable balance." },
  { toolName: "land_liquidity_positions_no_vesting", entryId: "vapi.land.liquidity.all-no-vesting", description: "Read one explicitly named player's public no-vesting liquidity positions and fee fields. This live-observed route is absent from the sampled VAPI Swagger; units and completeness are not inferred." },
] satisfies ReadToolDefinition[];

export const V105_PUBLIC_READ_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));
export function registerV105PublicReads(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
