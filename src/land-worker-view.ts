const FIELDS = [
  ["Base Production", "land_base_pp"],
  ["Base PP after cap", "base_pp_after_cap"],
  ["Terrain Boost", "terrain_boost_pp"],
  ["Boostable Production", "total_construction_pp"],
  ["Boost", "boost_pp"],
  ["Total Production", "total_harvest_pp"],
] as const;

export function withLandWorkerView(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  if (!data || typeof data !== "object" || !("cards" in data) || !Array.isArray(data.cards)) return body;
  return {
    ...body,
    worker_view: {
      reference: "splinterlands://land/rules/screen-fields",
      units: "Production points; terrain_modifier is a decimal fraction. Strings retain upstream precision.",
      scope: "Same-response worker values. Display values are zero for explicitly unpowered workers and unknown for missing power state or fields. Base Production is before cap; Base PP after cap is explicitly separate. No plot totals or free-slot inference.",
      workers: data.cards.map((card: Record<string, unknown>) => ({
        uid: card.uid ?? null,
        card_name: card.name ?? null,
        slot: card.slot ?? null,
        is_powered: typeof card.is_powered === "boolean" ? card.is_powered : null,
        terrain_modifier: card.terrain_boost ?? null,
        source_values: Object.fromEntries(FIELDS.map(([, field]) => [field, card[field] ?? null])),
        display: Object.fromEntries(FIELDS.map(([label, field]) => [
          label, card.is_powered === false ? 0 : card.is_powered === true ? card[field] ?? null : null,
        ])),
      })),
    },
  };
}
