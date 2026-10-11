import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { candidatePlotId, matchesPlotLabel, parsePlotLabel, plotIdentityFromResponse, plotIdOrLabelSchema } from "./plot-references.js";

const steps = [
  ["active_project", "vapi.land.projects.deed-active", "deed_uid"],
  ["stake_details", "vapi.land.stake.deed-details", "deedUid"],
  ["stake_assets", "vapi.land.stake.deeds-assets", "deedUid"],
] as const;
const SECTIONS = ["deed", "active_project", "stake_details", "stake_assets"] as const;
export const PLOT_SNAPSHOT_TOOL_ROUTE: Readonly<Record<string, string>> = {
  land_plot_snapshot: "Up to four bounded public GETs: deed by plot, then active project, stake details and stake assets in parallel",
};
export function registerLandPlotSnapshot(server: McpServer, client: SplinterlandsHttpClient): void {
  server.registerTool("land_plot_snapshot", {
    description: "Read one plot's deed, active project, stake details and stake assets from four public endpoints. Supply a numeric plot_id or padded region-tract-plot label. Optional include selects sections from deed, active_project, stake_details and stake_assets; the default is all four. The deed is always read because it verifies the plot identity and supplies the deed UID, but it is returned only when included. include=[\"deed\",\"stake_details\"] makes two GETs. The follow-up reads run in parallel after the deed read. Each call reads afresh and returns a whole result only when the deed identity is verified and every selected follow-up read succeeds; a failed read returns no partial result, although the other parallel reads may already have been sent. Null active project is a valid no-project result. No account defaults, cache or inferred plot data.",
    inputSchema: { plot_id: plotIdOrLabelSchema, include: z.array(z.enum(SECTIONS)).min(1).max(4).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ plot_id, include }) => {
    const selected = new Set(include ?? SECTIONS);
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
      plot_reference: identity, ...(selected.has("deed") ? { deed: deed.data } : {}),
      reads: { deed: { endpoint: deedRequest.endpointTemplate, traceId: deed.traceId, freshness: deed.freshness } },
      included: SECTIONS.filter((section) => selected.has(section)),
    };
    const reads = result.reads as Record<string, unknown>;
    // The three follow-ups depend only on the deed UID, so they are independent of each other.
    const followUps = await Promise.all(steps.filter(([key]) => selected.has(key)).map(async ([key, entryId, parameter]) => {
      const bound = bindRequest(entryId, { [parameter]: identity.deed_uid });
      return { key, bound, response: await bound.execute(client) };
    }));
    for (const { key, bound, response } of followUps) {
      if (!response.ok) return failure(response.kind, key, response.message);
      result[key] = response.data;
      reads[key] = { endpoint: bound.endpointTemplate, traceId: response.traceId, freshness: response.freshness };
    }
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized) > 256 * 1024) return failure("response_too_large", "result", "The complete plot snapshot exceeds 256 KiB; no partial result is returned.");
    return { content: [{ type: "text" as const, text: serialized }], structuredContent: result };
  });
}
