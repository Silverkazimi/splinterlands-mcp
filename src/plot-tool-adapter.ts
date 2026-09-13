import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { candidatePlotId, matchesPlotLabel, parsePlotLabel, plotIdentityFromResponse, plotIdOrLabelSchema, type PlotIdentity } from "./plot-references.js";

export const PLOT_TOOL_KEYS: Readonly<Record<string, string>> = {
  land_power_core_available: "deedUid", land_power_core_grouped: "deedUid",
  land_deed_by_plot: "plot_id", land_deed_by_uid: "deed_uid",
  land_projects_active: "deed_uid", land_projects_history: "deed_uid",
  land_projects_count: "deed_uid", land_projects_requirements: "deed_uid",
  land_stake_assets: "deedUid", land_stake_deed_details: "deedUid",
  land_resources_taxes: "deedUID", land_resources_rewardactions: "deedUID",
  land_resources_rewardactions_count: "deedUID",
};

export function plotToolSchema(schema: unknown, key: string): z.AnyZodObject {
  const base = schema instanceof z.ZodObject ? schema : z.object(schema as z.ZodRawShape);
  return base.partial({ [key]: true }).extend({
    plot_id: plotIdOrLabelSchema.optional(),
    deed_uid: z.string().min(1).refine(value => value.trim().length > 0).optional(),
  }).strict();
}

const failure = (kind: string, text: string): CallToolResult => ({
  isError: true, content: [{ type: "text", text }], structuredContent: { kind },
});

function attach(result: CallToolResult, identity: PlotIdentity, resolution?: Record<string, unknown>): CallToolResult {
  return {
    ...result,
    content: [...result.content, { type: "text", text: `Plot ${identity.plot_label}; numeric ID ${identity.plot_id}; deed UID ${identity.deed_uid}.` }],
    structuredContent: { ...result.structuredContent, plot_reference: identity },
    _meta: { ...result._meta, ...(resolution ? { plot_resolution: resolution } : {}) },
  };
}

export async function callPlotTool(
  tool: string,
  client: SplinterlandsHttpClient,
  args: unknown[],
  invoke: (...args: unknown[]) => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  const key = PLOT_TOOL_KEYS[tool]!;
  const params = args[0] as Record<string, unknown>;
  const selectors = [...new Set(["plot_id", "deed_uid", key])].filter(field => params[field] !== undefined);
  if (selectors.length !== 1) return failure("invalid_input", "Supply exactly one plot_id (number or display label) or deed_uid. The original deedUID spelling remains accepted where advertised.");
  const selector = selectors[0]!;
  const value = params[selector];
  const nativeDeed = (tool === "land_deed_by_plot" && selector === "plot_id")
    || (tool === "land_deed_by_uid" && selector === "deed_uid");
  if (nativeDeed) {
    const result = await invoke(...args);
    if (result.isError) return result;
    const identity = plotIdentityFromResponse(result.structuredContent);
    if (!identity) return result;
    if ((tool === "land_deed_by_uid" && identity.deed_uid !== value)
      || (tool === "land_deed_by_plot" && typeof value === "number" && identity.plot_id !== value)) {
      return failure("plot_resolution_unverified", "The returned deed identity does not match the requested reference. No deed is presented as a match.");
    }
    return attach(result, identity);
  }

  const byPlot = selector === "plot_id";
  const coordinates = byPlot && typeof value === "string" ? parsePlotLabel(value)! : undefined;
  const numericId = coordinates ? candidatePlotId(coordinates) : value;
  const bound = byPlot
    ? bindRequest("vapi.land.deeds.by-plot", { plot_id: numericId })
    : bindRequest("vapi.land.deeds.details-by-uid", { deed_uid: value });
  const resolved = await bound.execute(client);
  if (!resolved.ok) return {
    ...failure(resolved.kind, resolved.message),
    _meta: { plot_resolution: { endpoint: bound.endpointTemplate, traceId: resolved.traceId, freshness: resolved.freshness } },
  };
  const resolvedAt = performance.now();
  const identity = plotIdentityFromResponse(resolved.data);
  if (!identity || (coordinates && !matchesPlotLabel(resolved.data, coordinates))
    || (byPlot && identity.plot_id !== numericId)
    || (!byPlot && identity.deed_uid !== value)) {
    return failure("plot_resolution_unverified", "The reference did not resolve to a matching deed with complete coordinates. No target request was made; this is not proof that the location is nonexistent.");
  }

  const normalized = { ...params };
  for (const field of new Set(["plot_id", "deed_uid", key])) delete normalized[field];
  normalized[key] = key === "plot_id" ? identity.plot_id : identity.deed_uid;
  const result = await invoke(normalized, ...args.slice(1));
  if (!result.isError && (tool === "land_deed_by_plot" || tool === "land_deed_by_uid")) {
    const actual = plotIdentityFromResponse(result.structuredContent);
    if (!actual || actual.plot_id !== identity.plot_id || actual.deed_uid !== identity.deed_uid || actual.plot_label !== identity.plot_label) {
      return failure("plot_resolution_unverified", "The final deed read no longer matches the resolved reference. No deed is presented as a match.");
    }
  }
  return attach(result, identity, { requested: { [selector]: value }, endpoint: bound.endpointTemplate, traceId: resolved.traceId, freshness: { ...resolved.freshness, ageMs: resolved.freshness.ageMs + Math.floor(Math.max(0, performance.now() - resolvedAt)) } });
}
