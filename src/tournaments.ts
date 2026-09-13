import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "tournament_upcoming",
    "entryId": "api.tournaments.upcoming",
    "description": "Read upcoming tournament summaries. The observed public response had 58 rows. Optional username is forwarded; its effect is not established."
  },
  {
    "toolName": "tournament_upcoming_official",
    "entryId": "api.tournaments.upcoming-official",
    "description": "Read the official upcoming tournament route. It returned exactly the same 58 rows as upcoming in the capture; do not infer permanent equivalence or a distinct complete dataset."
  },
  {
    "toolName": "tournament_in_progress",
    "entryId": "api.tournaments.in-progress",
    "description": "Read in-progress tournament summaries. Optional username is forwarded only when supplied."
  },
  {
    "toolName": "tournament_completed",
    "entryId": "api.tournaments.completed",
    "description": "Read completed tournament summaries. The captured upstream list had 200 rows. An undocumented limit=2 and offset=2 request returned the unchanged 200 rows, so no paging controls are exposed and the bounded result is not a complete archive."
  },
  {
    "toolName": "tournament_cancelled",
    "entryId": "api.tournaments.cancelled",
    "description": "Read cancelled tournament summaries. The capture had 200 rows; no working pagination has been established."
  },
  {
    "toolName": "tournament_mine",
    "entryId": "api.tournaments.mine",
    "required": [
      "username"
    ],
    "description": "Read the upstream mine listing for an explicit username. A tournament creator returned 200 rows; two player accounts, including a known entrant, returned empty arrays. Do not present this route as a player's complete participation history."
  },
  {
    "toolName": "tournament_find",
    "entryId": "api.tournaments.find",
    "required": [
      "id"
    ],
    "listField": "players",
    "description": "Read tournament details by explicit id. Players are locally bounded while rounds, num_players and other fields are retained. The tested player_limit=2 still returned all 19 players, so it is not an effective upstream bound. No credentials are accepted."
  },
  {
    "toolName": "tournament_find_brawl",
    "entryId": "api.tournaments.find-brawl",
    "required": [
      "id",
      "guild_id"
    ],
    "listField": "players",
    "description": "Read brawl details for an explicit tournament id and guild_id. Omitting guild_id returned an error. Players are locally bounded while guilds and brawl rules remain intact."
  },
  {
    "toolName": "tournament_battles",
    "entryId": "api.tournaments.battles",
    "required": [
      "id",
      "round"
    ],
    "requiredAny": [
      "player",
      "swiss_group"
    ],
    "description": "Read tournament matchups by id and round, scoped to a player or swiss_group. The captured group number 1 returned 21 matchups, and an explicit player returned six. Omitting both, group 0, or username alone returned empty; username is not a substitute for player. Nested battle references and participant records remain intact."
  },
  {
    "toolName": "tournament_prizes",
    "entryId": "api.tournaments.prizes",
    "description": "Read upstream awarded and upcoming tournament prize aggregate figures without recomputing them. This does not claim any prize."
  }
] satisfies ReadToolDefinition[];

export const TOURNAMENT_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerTournaments(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
