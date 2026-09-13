import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";
const definitions = [
  {
    "toolName": "land_power_core_available",
    "entryId": "vapi.land.stake.items-available",
    "required": [
      "player",
      "deedUid",
      "limit",
      "offset"
    ],
    "fixedStrings": {
      "stakeTypeUid": "STK-LND-PCR"
    },
    "listField": "ids",
    "listEnvelope": "data",
    "description": "Read available Power Core item IDs for an explicit player and deed. Restricted to the verified STK-LND-PCR stake type. A populated public-client-shaped query was observed; earlier other-account empty results remain valid. Preserve UIDs. One bounded page; no automatic continuation. Availability is point-in-time API evidence, not a guarantee that a later stake action will succeed. No staking or bulk stake-change operation is performed."
  },
  {
    "toolName": "land_power_core_grouped",
    "entryId": "vapi.land.stake.items-grouped",
    "required": [
      "player",
      "deedUid",
      "limit",
      "offset"
    ],
    "fixedStrings": {
      "stakeTypeUid": "STK-LND-PCR"
    },
    "listField": "items",
    "listEnvelope": "data",
    "description": "Read grouped available Power Core item counts for an explicit player and deed. Restricted to the verified STK-LND-PCR stake type. A populated public-client-shaped query was observed; earlier other-account empty results remain valid. Preserve item_detail_id, name, item_count and string boost. One bounded page; no automatic continuation. Availability is point-in-time API evidence, not a guarantee that a later stake action will succeed. No staking or bulk stake-change operation is performed."
  }
] satisfies ReadToolDefinition[];
export const POWER_CORE_ENTRY_IDS: Readonly<Record<string,string>> = Object.fromEntries(definitions.map(({toolName,entryId}) => [toolName,entryId]));
export function registerPowerCoreReads(server: McpServer, client: SplinterlandsHttpClient): void { registerReadTools(server,client,definitions); }
