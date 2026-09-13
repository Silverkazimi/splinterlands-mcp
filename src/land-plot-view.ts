const REFERENCE_FIELDS = [
 ["Base PP before cap", "total_base_pp"],
 ["Base PP after cap", "total_base_pp_after_cap"],
 ["Terrain Boost PP", "total_terrain_boost_pp"],
 ["Boostable PP", "total_construction_pp"],
 ["Total PP before efficiency", "total_harvest_pp"],
 ["Resource output per hour", "total_work_per_hour"],
] as const;
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function withLandPlotView(body: Record<string, unknown>): Record<string, unknown> {
 const data = body.data;
 if (!data || typeof data !== "object" || Array.isArray(data)) return body;
 const row = data as Record<string, unknown>;
 let hourly: number | null = null;
 if (numeric(row.runi_boost)) {
  if (row.runi_boost > 0) hourly = numeric(row.total_harvest_pp) ? row.total_harvest_pp : null;
  else if (row.is_powered === false) hourly = 0;
  else if (row.is_powered === true && numeric(row.total_harvest_pp) && numeric(row.efficiency)) {
   hourly = row.total_harvest_pp * row.efficiency;
  }
 }
 return {
  ...body,
  plot_view: {
   reference: "splinterlands://land/rules/screen-fields",
   scope: "PRODUCTION / HR follows the public plot overview numeric formula before display formatting. Reference values use explanatory labels, not asserted screen column names. Missing inputs remain unknown. This response does not establish live screen agreement.",
   display: { "PRODUCTION / HR": hourly },
   display_units: "Effective production points per hour, not resource units per hour.",
   reference_values: Object.fromEntries(REFERENCE_FIELDS.map(([label, field]) => [label, row[field] ?? null])),
   source_values: Object.fromEntries([...REFERENCE_FIELDS.map(([, field]) => field), "runi_boost", "is_powered", "efficiency"].map(field => [field, row[field] ?? null])),
  },
 };
}
