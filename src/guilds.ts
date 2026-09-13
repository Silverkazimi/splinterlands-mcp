import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    "toolName": "guild_list",
    "entryId": "api.guilds.list",
    "required": [
      "name"
    ],
    "listField": "guilds",
    "description": "Search guilds by an explicit name filter. The unfiltered response exceeded the 2 MiB transport limit; a specific name returned one guild and an unmatched name returned no guilds. Other declared filters are forwarded without assuming their effectiveness. The bounded list preserves num_actionable_mail and other surrounding fields."
  },
  {
    "toolName": "guild_find",
    "entryId": "api.guilds.find",
    "required": [
      "id"
    ],
    "description": "Read one guild by its explicit ID. The default capture included extra fields absent with ext=true; do not assume ext=true expands the response. Building, tournament and crest data retain their JSON-encoded string wire types."
  },
  {
    "toolName": "guild_members",
    "entryId": "api.guilds.members",
    "required": [
      "guild_id"
    ],
    "description": "Read guild membership rows for an explicit guild_id. The default capture returned 230 rows across statuses; status=active returned 30. Membership status is not inferred. Undocumented limit=2 and offset=2 did not shorten or advance active members, so no paging controls are exposed."
  },
  {
    "toolName": "guild_contributions",
    "entryId": "api.guilds.contributions",
    "required": [
      "guild_id",
      "type"
    ],
    "description": "Read contributions for a guild and explicit building type. guild_hall and arena each returned 50 rows, while omitted type returned empty. Amounts and cumulative fields retain their original units and wire values; no complete contribution history or working pagination is established."
  },
  {
    "toolName": "guild_brawl_records",
    "entryId": "api.guilds.brawl-records",
    "required": [
      "guild_id"
    ],
    "listField": "results",
    "description": "Read brawl records for an explicit guild. cycle selected one row; start_cycle and end_cycle selected the two captured inclusive endpoint cycles. Other tournament and date selectors remain forwarded but unverified. SPS payout quantities remain decimal strings and the bounded list does not establish a complete history."
  },
  {
    "toolName": "guild_brawl_sps_rewards",
    "entryId": "api.guilds.brawl-sps-rewards",
    "requiredAny": [
      "include_total",
      "include_cycles"
    ],
    "listField": "sps_reward_records",
    "description": "Read global brawl SPS payout totals and/or cycle records. Use the string 1 for include_total or include_cycles: true returned an empty object. Each section can be selected independently. The total is global even when cycle narrows records; it is not a guild or selected-cycle sum. Cycle records are bounded while a requested total is retained."
  }
] satisfies ReadToolDefinition[];

export const GUILD_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerGuilds(server: McpServer, client: SplinterlandsHttpClient): void {
  registerReadTools(server, client, definitions);
}
