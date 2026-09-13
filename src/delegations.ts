import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";
const definitions = [
  {
    "toolName": "delegations_outgoing",
    "entryId": "vapi.delegation.outgoing",
    "required": [
      "player",
      "limit"
    ],
    "description": "Read outgoing SPSP delegation records; each returned player is a recipient of the explicitly requested player. Two pages of two matched the first four records. Preserve amount strings, rental fields and nullable dates. No currency conversion or card-delegation inference. One bounded GET; no automatic paging. Sort effectiveness is unmeasured.",
    "listField": "data"
  },
  {
    "toolName": "delegations_incoming",
    "entryId": "vapi.delegation.incoming",
    "required": [
      "player",
      "limit"
    ],
    "description": "Read incoming SPSP delegation records; each returned player is a delegator to the explicitly requested player. A populated record matched the corresponding outgoing and pairwise reads. Paging is declared but not independently demonstrated on the one-row sample. Preserve amount strings, rental fields and nullable dates. No currency conversion or card-delegation inference. One bounded GET; no automatic paging. Sort effectiveness is unmeasured.",
    "listField": "data"
  },
  {
    "toolName": "delegation_to_target",
    "entryId": "vapi.delegation.delegation",
    "required": [
      "player",
      "target"
    ],
    "description": "Read the directed SPSP delegation from explicit player to explicit target. The positive pair matched outgoing/incoming evidence; reversing that pair returned HTTP 404. A zero-amount historical object was also observed: object presence does not imply a current positive delegation. Preserve amount strings, rental fields and nullable dates. No currency conversion or card-delegation inference. One bounded GET; no automatic paging. Sort effectiveness is unmeasured."
  }
] satisfies ReadToolDefinition[];
export const DELEGATION_ENTRY_IDS: Readonly<Record<string,string>> = Object.fromEntries(definitions.map(({toolName,entryId}) => [toolName,entryId]));
export function registerDelegations(server: McpServer, client: SplinterlandsHttpClient): void { registerReadTools(server,client,definitions); }
