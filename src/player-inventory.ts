import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { bindRequest } from "./catalogue/index.js";
import { z } from "zod";

export const INVENTORY_ENTRY_IDS = { player_inventory: "api.players.inventory" } as const;
const schema = z.object({
 username: z.string().trim().min(1).max(100),
 type: z.string().trim().min(1).max(100),
 item_detail_id: z.number().int().positive().optional(),
}).strict();
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

export function registerInventory(server: McpServer, client: SplinterlandsHttpClient): void {
 server.registerTool("player_inventory", {
  description: "Read one account's inventory with an explicit upstream type filter. Land reduced the observed response but retained Token rows, so type is not an exact row-type predicate; other type values are not verified. Optional item_detail_id filters the entire returned array locally before the 100-row/256-KiB result bound, without another request. Reports upstream and matched counts; truncation is explicit and no continuation is fetched. Preserves records, quantities and wire types. Inventory presence or absence does not establish eligibility to stake an item or complete holdings. Power Core item detail ID 322 was absent from the observed inventory response. Separate land_power_core_available and land_power_core_grouped tools expose the dated populated STK-LND-PCR contracts; availability is not a guarantee of staking eligibility. No credentials or mutations. Makes one logical GET with a 2-MiB transport bound.",
  inputSchema: schema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
 }, async params => {
  const bound = bindRequest(INVENTORY_ENTRY_IDS.player_inventory, { username: params.username, type: params.type });
  const result = await bound.execute(client);
  const provenance = { endpoint: bound.endpointTemplate, traceId: result.traceId, freshness: result.freshness,
   requestScope: { username: { supplied: true }, type: params.type },
   localFilter: { item_detail_id: params.item_detail_id ?? null } };
  if (!result.ok) return { isError: true, content: [{ type: "text" as const, text: result.message }],
   structuredContent: { kind: result.kind }, _meta: { provenance } };
  const source = result.data as Array<Record<string, unknown>>;
  const matches = params.item_detail_id === undefined ? source : source.filter(row => row.item_detail_id === params.item_detail_id);
  const rows = matches.slice(0, 100);
  const body = () => ({ data: rows, upstream_rows: source.length, matched_rows: matches.length,
   returned_rows: rows.length, truncated: rows.length < matches.length });
  while (rows.length && bytes(body()) > 256 * 1024) rows.pop();
  if (matches.length && !rows.length) return { isError: true,
   content: [{ type: "text" as const, text: "The matching inventory record exceeds the 256 KiB result bound; no partial record is returned." }],
   structuredContent: { kind: "response_too_large" }, _meta: { provenance } };
  const output = body();
  return { content: [{ type: "text" as const, text: JSON.stringify(output) }],
   structuredContent: output, _meta: { provenance } };
 });
}
