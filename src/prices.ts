import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { PRICES_TTL_MS } from "./http/cache.js";
import { registerReadTools, type ReadToolDefinition } from "./read-tools.js";

const definitions = [
  {
    toolName: "prices_current",
    entryId: "prices.prices",
    cacheTtlMs: PRICES_TTL_MS,
    description: "Read the current public token-to-USD price object from the official price feed. The observed key set is open-ended and may change upstream; values are returned as received.",
  },
] satisfies ReadToolDefinition[];

export const PRICES_ENTRY_IDS: Readonly<Record<string, string>> = Object.fromEntries(definitions.map(({ toolName, entryId }) => [toolName, entryId]));

export function registerPrices(server: McpServer, client: SplinterlandsHttpClient, now: () => number): void {
  registerReadTools(server, client, definitions, now);
}
