import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { describe, expect, it } from "vitest";
import abilityRules from "../src/data/land-card-ability-rules.json" with {type:"json"};
import { estimateLineup, type LineupInput } from "../src/land-lineup-estimator.js";
const worker = (uid: string, base_pp: number): LineupInput["workers"][number] => ({
  uid, card_detail_id: 1, level: 1, base_pp, element: "water", bloodline: "Human", abilities: [],
});
const input = (workers: LineupInput["workers"]): LineupInput => ({
  plot: { terrain: "lake", resource: "GRAIN", efficiency: 1 }, workers, power_core: true,
});
describe("offline Land lineup engine", () => {
  it("replaces old plot demand and applies cap-scaled strongest Dark Discount", () => {
    const args = input([
      { ...worker("a", 80000), land_dec_stake_needed: 10000, abilities: [["DD", -0.5]] },
      { ...worker("b", 40000), land_dec_stake_needed: 10000, abilities: [["DD", -0.1]] },
    ]);
    delete args.plot.efficiency;
    args.regional_power = { staked_dec: 45000, current_required_dec: 50000, current_plot_required_dec: 10000 };
    const result = estimateLineup(args);
    expect(result.estimate?.power).toMatchObject({ plot_dec_required: 7500, regional_dec_required: 47500, regional_dec_shortfall: 2500 });
    expect(result.estimate?.efficiency).toBeCloseTo(45000 / 47500);
    expect(result.estimate?.workers.map(w => w.dec_required)).toEqual([5000, 2500]);
  });
  it("matches the public 400k/500k regional example and saturates at full funding", () => {
    const args = input([{ ...worker("a", 1000), land_dec_stake_needed: 10000 }]);
    delete args.plot.efficiency;
    args.regional_power = { staked_dec: 400000, current_required_dec: 500000, current_plot_required_dec: 10000 };
    expect(estimateLineup(args).estimate?.efficiency).toBe(0.8);
    args.regional_power.staked_dec = 600000;
    expect(estimateLineup(args).estimate?.efficiency).toBe(1);
  });
  it("removes Runi plot demand without changing other plots and handles zero demand", () => {
    const args = input([worker("a", 1000)]);
    delete args.plot.efficiency;
    args.runi = { uid: "runi", base_pp: 1500, terrain_modifier: 0, bloodline: "Construct" };
    args.regional_power = { staked_dec: 0, current_required_dec: 10000, current_plot_required_dec: 10000 };
    expect(estimateLineup(args).estimate?.power).toMatchObject({ plot_dec_required: 0, regional_dec_required: 0, regional_efficiency: 1, plot_efficiency: 1 });
  });
  it("refuses conflicting power modes, inconsistent snapshots and missing raw worker demand", () => {
    const args = input([worker("a", 1000)]);
    args.regional_power = { staked_dec: 0, current_required_dec: 0, current_plot_required_dec: 100 };
    expect(estimateLineup(args).valid).toBe(false);
    delete args.plot.efficiency;
    args.regional_power.current_plot_required_dec = 0;
    expect(estimateLineup(args).valid).toBe(false);
    delete args.regional_power;
    expect(estimateLineup(args).valid).toBe(false);
  });
  it("uses neutral zero and the better dual-element modifier, retaining primary on ties", () => {
    const neutral = { ...worker("neutral", 1000), element: "neutral" as const };
    const dual = { ...worker("dual", 1000), element: "fire" as const, secondary_element: "water" as const };
    const tie = { ...worker("tie", 1000), element: "water" as const, secondary_element: "earth" as const };
    expect(estimateLineup(input([neutral, dual, tie])).estimate).toMatchObject({ workers: [
      { terrain_modifier: 0, selected_element: "neutral", boostable_pp: 1000 },
      { terrain_modifier: 0.1, selected_element: "water", boostable_pp: 1100 },
      { terrain_modifier: 0.1, selected_element: "water" },
    ] });
  });
  it("uses the official Plains Death and Earth columns independently of Hills", () => {
    const args = input([{ ...worker("death", 1000), element: "death" }, { ...worker("earth", 1000), element: "earth" }]);
    args.plot.terrain = "plains";
    expect(estimateLineup(args).estimate).toMatchObject({ workers: [
      { terrain_modifier: 0, boostable_pp: 1000 }, { terrain_modifier: -0.5, boostable_pp: 500 },
    ] });
  });
  it("checks all 14 terrain assignments against the four natural resources", () => {
    const groups = { GRAIN: ["plains", "river", "bog", "lake"], WOOD: ["swamp", "forest", "tundra", "jungle"],
      STONE: ["canyon", "desert", "hills"], IRON: ["mountain", "badlands", "caldera"] } as const;
    for (const [resource, terrains] of Object.entries(groups)) for (const land of terrains) {
      const args = input([worker("a", 1000)]);
      args.plot.terrain = land;
      for (const other of Object.keys(groups)) {
        args.plot.resource = other as LineupInput["plot"]["resource"];
        expect(estimateLineup(args).valid).toBe(other === resource);
      }
    }
  });
  it("runs deterministically through MCP with zero upstream calls", async () => {
    let calls = 0;
    const server = createServer({ fetch: async () => { calls++; throw new Error("Offline estimator attempted HTTP"); } });
    const client = new Client({ name: "lineup-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const args = input([worker("synthetic", 1000)]);
      const first = await client.callTool({ name: "land_lineup_estimate", arguments: args });
      const second = await client.callTool({ name: "land_lineup_estimate", arguments: args });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toEqual(second.structuredContent);
      expect(first.structuredContent).toMatchObject({ valid: true, estimate: { total_pp: 1100, grain_per_hour: 22, food_per_hour: 10 } });
      expect((await client.callTool({ name: "land_lineup_estimate", arguments: { ...args, power_core: false } })).isError).toBe(true);
      const regional = input([{ ...worker("synthetic", 1000), land_dec_stake_needed: 1000 }]);
      delete regional.plot.efficiency;
      regional.regional_power = { staked_dec: 500, current_required_dec: 1000, current_plot_required_dec: 1000 };
      const calculated = await client.callTool({ name: "land_lineup_estimate", arguments: regional });
      expect(calculated.structuredContent).toMatchObject({ valid: true, estimate: {
        efficiency: 0.5, grain_per_hour: 11, food_per_hour: 5,
        power: { mode: "recomputed_region", regional_dec_required: 1000, regional_dec_shortfall: 500 },
      } });
      expect(calls).toBe(0);
    } finally { await client.close(); await server.close(); }
  });
  it("allocates cap in slot order and keeps abilities from a fully clipped worker", () => {
    const result = estimateLineup(input([worker("a", 80000), worker("b", 40000),
      { ...worker("c", 10000), abilities: [["GRAIN", 0.2]] }]));
    expect(result.valid).toBe(true);
    expect(result.estimate).toMatchObject({
      base_pp: 130000, base_pp_after_cap: 100000, boostable_pp: 110000, total_pp: 132000,
      resource_per_hour: 2640, food_per_hour: 1000,
      workers: [{ base_pp_after_cap: 80000 }, { base_pp_after_cap: 20000 }, { base_pp_after_cap: 0 }],
    });
  });
  it("adds Runi outside cap, provides its boost, and overrides regional efficiency", () => {
    const args = input([worker("a", 100000)]);
    args.plot.efficiency = 0;
    args.runi = { uid: "runi", base_pp: 1500, terrain_modifier: 0, bloodline: "Construct" };
    expect(estimateLineup(args).estimate).toMatchObject({
      base_pp_after_cap: 101500, boostable_pp: 111500, total_pp: 223000, efficiency: 1, food_per_hour: 1015,
    });
  });
  it("uses strongest duplicate abilities and requires another matching bloodline worker", () => {
    const only = { ...worker("a", 1000), abilities: [["BLOODLINE", 0.3, "Human"]] as [["BLOODLINE", number, string]] };
    expect(estimateLineup(input([only])).estimate?.bloodline_activation[0]?.active).toBe(false);
    const other = { ...worker("b", 1000), abilities: [["BLOODLINE", 0.1, "Human"], ["GRAIN", 0.1]] as Array<["BLOODLINE", number, string] | ["GRAIN", number]> };
    const third = { ...worker("c", 1000), abilities: [["GRAIN", 0.2]] as [["GRAIN", number]] };
    expect(estimateLineup(input([only, other, third])).estimate).toMatchObject({
      boost_parts: { bloodline: 0.3, resource: 0.2 }, total_pp: 4950,
    });
  });
  it("combines eligible food reductions at the 20k boundary and applies efficiency", () => {
    const w = { ...worker("a", 20000), abilities: [["RATIONING", -0.3], ["RATIONING_LITE", -0.1]] as Array<["RATIONING" | "RATIONING_LITE", number]> };
    const args = input([w]); args.plot.efficiency = 0.5;
    expect(estimateLineup(args).estimate).toMatchObject({ food_per_hour: 60, light_rationing_applies: true });
    w.base_pp = 20001;
    expect(estimateLineup(args).estimate).toMatchObject({ food_per_hour: 70, light_rationing_applies: false });
  });
  it("rejects missing power, duplicate identity and unsupported ability evidence", () => {
    const a = input([worker("a", 1000)]); a.power_core = false;
    expect(estimateLineup(a).valid).toBe(false);
    expect(estimateLineup(input([worker("a", 1000), worker("a", 1000)])).valid).toBe(false);
    const unknown = worker("a", 1000); delete unknown.abilities;
    expect(estimateLineup(input([unknown])).valid).toBe(false);
  });
  it("resolves edition-19 levels from the shipped resource and validates Runi-only slots", () => {
    const farmhand = { ...worker("farmhand", 1000), card_detail_id: 866, level: 10 };
    delete farmhand.abilities;
    const args = input([farmhand]); args.power_core = false;
    expect(estimateLineup(args)).toMatchObject({ valid: true, checks: { energized: true }, estimate: { rationing: -0.3, boost_parts: { resource: 0.6 } } });
    const crowded = input(Array.from({ length: 5 }, (_, i) => worker("w"+i, 1000)));
    crowded.power_core = false;
    crowded.runi = { uid: "runi", base_pp: 1500, terrain_modifier: 0, bloodline: "Construct" };
    expect(estimateLineup(crowded).valid).toBe(false);
  });
});

it("refuses a future unsupported ability added to the pinned known-card resource",()=>{
 const level=abilityRules.cards.find(c=>c.card_detail_id===1051)!.levels.find(l=>l.level===10)!;
 const previous=level.abilities;
 try{
  level.abilities=[["SYNTHETIC_UNSUPPORTED"]];
  const result=estimateLineup(input([{...worker("synthetic-worker",2000),card_detail_id:1051,level:10,abilities:undefined}]));
  expect(result.valid).toBe(false);
  expect(result.checks.errors.join(" ")).toContain("SYNTHETIC_UNSUPPORTED");
  expect(result.estimate).toBeNull();
 }finally{level.abilities=previous;}
});

it("advertises homogeneous array schemas and still rejects malformed ability tuples", async () => {
  const server = createServer({ fetch: async () => { throw new Error("Offline only"); } });
  const client = new Client({ name: "schema-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const tool = (await client.listTools()).tools.find(t => t.name === "land_lineup_estimate")!;
    const inspect = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      const node = value as Record<string, unknown>;
      expect(Array.isArray(node.items)).toBe(false);
      Object.values(node).forEach(inspect);
    };
    inspect(tool.inputSchema);
    for (const abilities of [[["GRAIN"]], [["GRAIN", "bad"]], [["DD", 0.5]], [["ENERGIZED", 1]], [["BLOODLINE", 0.2]], [["UNKNOWN"]]]) {
      const args = input([worker("synthetic", 1000)]);
      const result = await client.callTool({ name: "land_lineup_estimate", arguments: {
        ...args, workers: [{ ...args.workers[0], abilities }],
      } });
      expect(result.isError).toBe(true);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
