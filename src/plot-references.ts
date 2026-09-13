import { z } from "zod";

export type PlotCoordinates = { region: number; tract: number; plot: number };
export type PlotIdentity = { plot_id: number; plot_label: string; deed_uid: string };

export function parsePlotLabel(value: string): PlotCoordinates | undefined {
  const match = /^(\d{1,3})-(\d{1,2})-(\d{1,3})$/.exec(value.trim());
  if (!match) return undefined;
  const [region, tract, plot] = match.slice(1).map(Number) as [number, number, number];
  if (region < 1 || region > 150 || tract < 1 || tract > 10 || plot < 1 || plot > 100) return undefined;
  return { region, tract, plot };
}

export function formatPlotLabel({ region, tract, plot }: PlotCoordinates): string {
  return [String(region).padStart(3, "0"), String(tract).padStart(2, "0"), String(plot).padStart(3, "0")].join("-");
}

// This candidate is inferred from live boundaries; callers must verify response coordinates.
export function candidatePlotId({ region, tract, plot }: PlotCoordinates): number {
  return (tract - 1) * 15000 + (region - 1) * 100 + plot;
}

export const plotIdOrLabelSchema = z.union([
  z.number().int().min(1),
  z.string().refine(value => parsePlotLabel(value) !== undefined, "Use region-tract-plot: region 1-150, tract 1-10, plot 1-100."),
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function plotIdentityFromResponse(body: unknown): PlotIdentity | undefined {
  const data = record(record(body)?.data);
  if (!data || !Number.isSafeInteger(data.plot_id) || Number(data.plot_id) < 1
    || typeof data.deed_uid !== "string" || data.deed_uid.trim() === "") return undefined;
  if (![data.region_number, data.tract_number, data.plot_number].every(Number.isInteger)) return undefined;
  const coordinates = parsePlotLabel(`${String(data.region_number)}-${String(data.tract_number)}-${String(data.plot_number)}`);
  if (!coordinates) return undefined;
  return { plot_id: Number(data.plot_id), plot_label: formatPlotLabel(coordinates), deed_uid: data.deed_uid };
}

export function matchesPlotLabel(body: unknown, coordinates: PlotCoordinates): boolean {
  const identity = plotIdentityFromResponse(body);
  return identity !== undefined && identity.plot_id === candidatePlotId(coordinates)
    && identity.plot_label === formatPlotLabel(coordinates);
}
