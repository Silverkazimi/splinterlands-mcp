import { describe, expect, it } from "vitest";
import { withLandWorkerView } from "../src/land-worker-view.js";

describe("Land worker screen view", () => {
  it("keeps raw precision and distinguishes base, capped base, terrain and total", () => {
    const card = { uid: "synthetic-card", slot: 5, is_powered: true, land_base_pp: "20000.000",
      base_pp_after_cap: "10000.000", terrain_boost: "-0.500", terrain_boost_pp: "-5000.000",
      total_construction_pp: "5000.000", boost_pp: "1000.000", total_harvest_pp: "6000.000" };
    const body = { status: "success", data: { cards: [card], items: [] } };
    const result = withLandWorkerView(body);
    expect(result.data).toBe(body.data);
    expect(result.worker_view).toMatchObject({ workers: [{
      slot: 5, terrain_modifier: "-0.500", source_values: { land_base_pp: "20000.000" },
      display: { "Base Production": "20000.000", "Base PP after cap": "10000.000",
        "Terrain Boost": "-5000.000", "Boostable Production": "5000.000", "Total Production": "6000.000" },
    }] });
  });
  it("separates explicitly unpowered display from absent evidence", () => {
    const result = withLandWorkerView({ data: { cards: [
      { is_powered: false, land_base_pp: "5000.000" }, { land_base_pp: "5000.000" }, { is_powered: true },
    ] } });
    expect(result.worker_view).toMatchObject({ workers: [
      { source_values: { land_base_pp: "5000.000" }, display: { "Base Production": 0 } },
      { is_powered: null, display: { "Base Production": null } },
      { display: { "Base Production": null } },
    ] });
  });
  it("does not manufacture a view for null or absent upstream cards", () => {
    for (const body of [{ data: null }, { data: {} }]) expect(withLandWorkerView(body)).toBe(body);
  });
});
