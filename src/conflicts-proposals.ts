import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "conflict_seasons",
    "entryId": "api.conflicts.seasons",
    "description": "Read conflict seasons. Without id the upstream returned 24 records; an explicit id returned one object, so the response shape depends on the selector. All wire values, including nullable prize settings, are preserved."
  },
  {
    "toolName": "conflict_players",
    "entryId": "api.conflicts.players",
    "required": [
      "player"
    ],
    "requiredAny": [
      "id",
      "conflict"
    ],
    "listField": "players",
    "description": "Read a player's conflict reward-point record and reward_point_threshold with an explicit id or conflict selector. Both aliases selected the captured current conflict. Other declared mode/filter inputs are forwarded without presumed effectiveness.",
    "exclusive": [
      [
        "id",
        "conflict"
      ]
    ]
  },
  {
    "toolName": "conflict_airdrop_distribution",
    "entryId": "api.conflicts.airdrop-distribution",
    "required": [
      "player"
    ],
    "requiredAny": [
      "id",
      "conflict"
    ],
    "listField": "distribution",
    "description": "Read a player's recorded airdrop distribution for an explicit id or conflict. The conflict alias also returned conflict metadata, while id returned only distribution. No prizes are claimed; num_prizes is not recomputed.",
    "exclusive": [
      [
        "id",
        "conflict"
      ]
    ]
  },
  {
    "toolName": "conflict_leaderboard",
    "entryId": "api.conflicts.leaderboard",
    "required": [
      "id"
    ],
    "listField": "leaderboard",
    "description": "Read the conflict leaderboard, totals and prize metadata by id. The upstream returned 200 rows; the server returns a bounded leading portion while retaining totals and leaderboard_prizes. No working upstream pagination is established."
  },
  {
    "toolName": "conflict_player_rank",
    "entryId": "api.conflicts.leaderboard-with-player",
    "required": [
      "id",
      "username"
    ],
    "description": "Read one player's conflict ranking by id and username. Despite the upstream leaderboard_with_player name, the captured response contained only player, not the whole leaderboard. Rank and contribution values retain their string wire types."
  },
  {
    "toolName": "conflict_status",
    "entryId": "api.conflicts.status",
    "required": [
      "username"
    ],
    "listField": "wagons",
    "description": "Read conflict configuration, current conflict, player statistics and wagons for an explicit username. Flag strings use 1: only_config=1 returned config alone, only_wagons=1 returned stats and wagons, and exclude_wagons=1 omitted wagons. only_config=true did not reduce the response. Returned wagons are bounded with other requested sections unchanged."
  },
  {
    "toolName": "conflict_wagon",
    "entryId": "api.conflicts.wagon",
    "required": [
      "uid"
    ],
    "description": "Read one wagon by explicit uid, retaining its complete card list and original contribution values. An unknown uid returned an empty object, which is reported as an error rather than a fabricated wagon. This never stakes or removes cards."
  },
  {
    "toolName": "conflict_eligible_cards",
    "entryId": "api.conflicts.wagon-eligible-cards",
    "required": [
      "username"
    ],
    "listField": "groups",
    "description": "Read eligible card groups for an explicit username. max_group_size=1 or 2 limited the UID sample inside each group, while qty and total_cards retained the full counted quantities. Do not equate returned UID count with all eligible cards. Each group remains intact and groups are locally bounded."
  },
  {
    "toolName": "proposal_list",
    "entryId": "api.proposals.list",
    "description": "Read public proposal rows. limit=2 with offsets 0 and 2 returned distinct pages which concatenated exactly to limit=4,offset=0 in the capture. Each call fetches one page only; vote weights and thresholds remain decimal strings. Other filters are forwarded as supplied."
  },
  {
    "toolName": "proposal_pending_count",
    "entryId": "api.proposals.pending-proposal-count",
    "required": [
      "username"
    ],
    "description": "Read the pending-proposal count for an explicit username. This is a read of the reported value, not a vote or proposal submission."
  },
  {
    "toolName": "proposal_votes",
    "entryId": "api.proposals.votes",
    "required": [
      "proposal_id"
    ],
    "description": "Read recorded votes for an explicit proposal_id. Two pages of two voters matched the first four-row page exactly. Vote weights remain strings and approval remains boolean. This tool never casts or changes a vote."
  }
] satisfies ReadToolDefinition[];

export const CONFLICT_PROPOSAL_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerConflictsProposals(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
