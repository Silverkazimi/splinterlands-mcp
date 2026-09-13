import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "battle_queue",
    "entryId": "api.battle.battle-queue",
    "required": [
      "username"
    ],
    "description": "Read the existing battle queue records for an explicit username. This does not join a queue or submit a team. Captured queue fields such as mana_cap and team may be null even when status returns fuller data. Settings and team values retain their JSON-encoded string wire types."
  },
  {
    "toolName": "battle_status",
    "entryId": "api.battle.status",
    "required": [
      "id"
    ],
    "description": "Read battle status by explicit queue transaction ID. Obtain an ID from battle_queue. Team and settings are returned as upstream JSON-encoded strings. Unknown IDs returned HTTP 200 with an error string and are reported as errors, not successful battle records."
  },
  {
    "toolName": "battle_result",
    "entryId": "api.battle.result",
    "required": [
      "id"
    ],
    "description": "Read a battle result by explicit queue transaction ID. Either captured opponent queue ID returned the same battle. Details, settings and reward information retain their original wire types, including JSON-encoded strings. Unknown IDs returned an error string. Oversized results are refused without dropping rounds or player data."
  }
] satisfies ReadToolDefinition[];

export const BATTLE_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerBattles(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
