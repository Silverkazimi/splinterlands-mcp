import { describe, expect, it } from "vitest";
import { withLandPlotView } from "../src/land-plot-view.js";
describe("plot overview production view", () => {
 it("separates effective PP from raw, capped, boosted and resource values", () => {
  const data = { total_base_pp: 120000, total_base_pp_after_cap: 100000, total_terrain_boost_pp: 10000,
   total_construction_pp: 110000, total_harvest_pp: 220000, total_work_per_hour: 2200,
   runi_boost: 0, is_powered: true, efficiency: 0.5 };
  const result = withLandPlotView({ status: "success", data });
  expect(result.data).toBe(data);
  expect(result.plot_view).toMatchObject({ display: { "PRODUCTION / HR": 110000 },
   reference_values: { "Base PP before cap": 120000, "Base PP after cap": 100000, "Boostable PP": 110000,
    "Total PP before efficiency": 220000, "Resource output per hour": 2200 } });
 });
 it("applies Runi before the powered/efficiency branch and preserves unknown inputs", () => {
  const view = (data: Record<string, unknown>) => withLandPlotView({ data }).plot_view;
  expect(view({ runi_boost: 1, is_powered: false, efficiency: 0, total_harvest_pp: 1000 })).toMatchObject({ display: { "PRODUCTION / HR": 1000 } });
  expect(view({ runi_boost: 0, is_powered: false })).toMatchObject({ display: { "PRODUCTION / HR": 0 } });
  for (const data of [{}, { runi_boost: 1 }, { runi_boost: 0, is_powered: true, total_harvest_pp: 1000 },
    { runi_boost: 0, is_powered: true, efficiency: 1, total_harvest_pp: "1000" }]) {
   expect(view(data)).toMatchObject({ display: { "PRODUCTION / HR": null } });
  }
 });
 it("does not manufacture a view for absent, null or array data", () => {
  for (const body of [{}, { data: null }, { data: [] }]) expect(withLandPlotView(body)).toBe(body);
 });
});
