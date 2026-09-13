import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "player_leaderboard",
    "entryId": "api.players.leaderboard",
    "description": "Read the ranked leaderboard rows for the selected season, leaderboard and format. The default capture returned 20 rows; an explicit modern-format capture returned 26. The undocumented limit=2 and offset=2 probe returned the unchanged default rows, so no pagination controls are exposed."
  },
  {
    "toolName": "player_leaderboard_with_player",
    "entryId": "api.players.leaderboard-with-player",
    "required": [
      "season",
      "username"
    ],
    "listField": "leaderboard",
    "description": "Read the selected season's leaderboard together with the requested player's separate rank record. Both season and username are required. The upstream returned HTTP 200 with an error object when season was omitted. The separate player record is retained even when the leaderboard list is locally shortened."
  },
  {
    "toolName": "player_richlist",
    "entryId": "api.players.richlist",
    "required": [
      "token_type"
    ],
    "listField": "richlist",
    "description": "Read token-holder rankings and the upstream's total_accounts and total_quantity figures. token_type is required; player optionally adds player_rank. The observed limit parameter returns leading rows. Offsets 0, 2 and 4 repeated the same two leading accounts with limit=2, so offset is not exposed and this is a top-N query, not a complete holder listing."
  },
  {
    "toolName": "player_richlist_ranking",
    "entryId": "api.players.richlist-ranking",
    "required": [
      "token_type",
      "player"
    ],
    "description": "Read one player's token rank and balance as the upstream reports them. token_type and player are required by this tool; without player the upstream returned only token_type, which is not an account ranking."
  },
  {
    "toolName": "player_burn_event_leaderboard",
    "entryId": "api.players.burn-event-leaderboard",
    "listField": "leaderboard",
    "description": "Read the burn-event leaderboard and its totals. The captured upstream list had 200 detailed rows; this server returns a bounded leading portion while retaining totals. Points and burn quantities are decimal strings returned unchanged."
  },
  {
    "toolName": "player_burn_event_full_leaderboard",
    "entryId": "api.players.burn-event-full-leaderboard",
    "listField": "leaderboard",
    "description": "Read the upstream full burn-event ranking route, whose captured response had 3344 compact rank/player/points rows. This server returns only a bounded leading portion, not the full ranking. The tested limit=2 and offset=2 query did not shorten or advance the response; no paging controls are exposed. Rank and points retain their string wire types."
  },
  {
    "toolName": "player_presale_leaders",
    "entryId": "api.players.rebellion-presale-leaders",
    "listField": "players",
    "description": "Read presale leader rows and upstream total pack figures. Optional username adds a separate curr_player record, retained outside the bounded leaders list. The full upstream capture had 300 rows and exceeded 256 KiB, but a bounded list can be returned without dropping totals or the requested-player record. The tested limit=2 and offset=2 query had no effect; there is no exposed page-two control."
  },
  {
    "toolName": "player_season",
    "entryId": "api.season",
    "required": [
      "id"
    ],
    "description": "Read one season record by its explicit id, including its end time and reset block value. Omitting id returned HTTP 400. This is GET /season on the main API host, not /players/season; obtain a season id from a leaderboard response if needed."
  }
] satisfies ReadToolDefinition[];

export const RANKING_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  definitions.map(({ toolName, entryId }) => [toolName, entryId]),
);

export function registerRankings(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
