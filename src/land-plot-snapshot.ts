import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { candidatePlotId, matchesPlotLabel, parsePlotLabel, plotIdentityFromResponse, plotIdOrLabelSchema } from "./plot-references.js";

const steps = [
  ["active_project", "vapi.land.projects.deed-active", "deed_uid"],
  ["stake_details", "vapi.land.stake.deed-details", "deedUid"],
  ["stake_assets", "vapi.land.stake.deeds-assets", "deedUid"],
] as const;
export const PLOT_SNAPSHOT_TOOL_ROUTE: Readonly<Record<string, string>> = {
  land_plot_snapshot: "Four bounded public GETs: deed by plot, active project, stake details and stake assets",
};
export function registerLandPlotSnapshot(server: McpServer, client: SplinterlandsHttpClient): void {
  server.registerTool("land_plot_snapshot", {
    description: "Read one plot's deed, active project, stake details and stake assets from four public endpoints. Supply a numeric plot_id or padded region-tract-plot label. Each call reads afresh, makes at most four GETs, and returns a whole result only when the deed identity is verified and all three follow-up reads succeed. Null active project is a valid no-project result. No account defaults, cache or inferred plot data.",
    inputSchema: { plot_id: plotIdOrLabelSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ plot_id }) => {
    const coordinates = typeof plot_id === "string" ? parsePlotLabel(plot_id)! : undefined;
    const numericId = coordinates ? candidatePlotId(coordinates) : plot_id;
    const deedRequest = bindRequest("vapi.land.deeds.by-plot", { plot_id: numericId });
    const deed = await deedRequest.execute(client);
    const failure = (kind: string, stage: string, message: string) => ({
      isError: true, content: [{ type: "text" as const, text: message }], structuredContent: { kind, stage },
    });
    if (!deed.ok) return failure(deed.kind, "deed", deed.message);
    const identity = plotIdentityFromResponse(deed.data);
    if (!identity || identity.plot_id !== numericId || (coordinates && !matchesPlotLabel(deed.data, coordinates))) {
      return failure("plot_resolution_unverified", "deed", "The deed response did not verify the requested plot identity.");
    }
    const result: Record<string, unknown> = {
      plot_reference: identity, deed: deed.data,
      reads: { deed: { endpoint: deedRequest.endpointTemplate, traceId: deed.traceId, freshness: deed.freshness } },
    };
    const reads = result.reads as Record<string, unknown>;
    for (const [key, entryId, parameter] of steps) {
      const bound = bindRequest(entryId, { [parameter]: identity.deed_uid });
      const response = await bound.execute(client);
      if (!response.ok) return failure(response.kind, key, response.message);
      result[key] = response.data;
      reads[key] = { endpoint: bound.endpointTemplate, traceId: response.traceId, freshness: response.freshness };
    }
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized) > 256 * 1024) return failure("response_too_large", "result", "The complete plot snapshot exceeds 256 KiB; no partial result is returned.");
    return { content: [{ type: "text" as const, text: serialized }], structuredContent: result };
  });
}
