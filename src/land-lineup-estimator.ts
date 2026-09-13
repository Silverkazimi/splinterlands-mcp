import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import terrain from "./data/land-terrain-rules.json" with { type: "json" };
import cards from "./data/land-card-ability-rules.json" with { type: "json" };
import production from "./data/land-production-rules.json" with { type: "json" };

const amount = z.number().finite().min(0).max(1e9);
const fraction = z.number().finite().min(0).max(10);
const ability = z.union([
  z.tuple([z.enum(["ENERGIZED", "LL"])]),
  z.tuple([z.enum(["DD", "RATIONING", "RATIONING_LITE"]), z.number().finite().min(-1).max(0)]),
  z.tuple([z.enum(["GRAIN", "WOOD", "STONE", "IRON", "AURA"]), fraction]),
  z.tuple([z.literal("BLOODLINE"), fraction, z.string().min(1).max(100)]),
]);
// Tool clients need a single items schema; validate positional semantics after decoding.
const wireAbility = z.array(z.union([z.string().min(1).max(100), z.number().finite().min(-1).max(10)]))
  .min(1).max(3)
  .describe("Ability tuple: [ENERGIZED|LL], [DD|RATIONING|RATIONING_LITE, negative fraction], [GRAIN|WOOD|STONE|IRON|AURA, positive fraction], or [BLOODLINE, positive fraction, bloodline].")
  .transform((value, context) => {
    const parsed = ability.safeParse(value);
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ability code, tuple length, value or bloodline." });
      return z.NEVER;
    }
    return parsed.data;
  });
const element = z.enum(["fire", "water", "life", "death", "earth", "dragon", "neutral"]);
const worker = z.object({
  uid: z.string().min(1).max(100),
  card_detail_id: z.number().int().positive(),
  level: z.number().int().min(1).max(100),
  base_pp: amount,
  land_dec_stake_needed: amount.optional(),
  element,
  secondary_element: element.optional(),
  bloodline: z.string().min(1).max(100),
  abilities: z.array(wireAbility).max(20).optional(),
}).strict();
export const lineupSchema = z.object({
  plot: z.object({
    terrain: z.enum(Object.keys(terrain.modifiers) as [keyof typeof terrain.modifiers, ...Array<keyof typeof terrain.modifiers>]),
    resource: z.enum(["GRAIN", "WOOD", "STONE", "IRON"]),
    base_cap: amount.max(100000).default(100000),
    efficiency: z.number().finite().min(0).max(1).optional(),
    rarity_boost: fraction.default(0),
    status_boost: fraction.default(0),
  }).strict(),
  workers: z.array(worker).max(5),
  runi: z.object({ uid: z.string().min(1).max(100), base_pp: amount, terrain_modifier: z.number().finite().min(-0.5).max(0.1), bloodline: z.string().min(1).max(100) }).strict().optional(),
  regional_power: z.object({
    staked_dec: amount,
    current_required_dec: amount,
    current_plot_required_dec: amount,
  }).strict().optional(),
  power_core: z.boolean(),
  totem_boost: fraction.default(0),
  title_boost: fraction.default(0),
}).strict();
export const lineupToolSchema = lineupSchema.extend({
  comparisons: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    lineup: lineupSchema,
  }).strict()).min(1).max(10).refine(rows => new Set(rows.map(row => row.label)).size === rows.length,
    "Comparison labels must be unique.").optional(),
});
export type LineupInput = z.input<typeof lineupSchema>;
type Ability = z.infer<typeof ability>;
const round = (n: number, digits = 3) => Number(n.toFixed(digits));

export function estimateLineup(input: LineupInput) {
  const args = lineupSchema.parse(input);
  const errors: string[] = [];
  const notes: string[] = [];
  if ((args.plot.efficiency !== undefined) === (args.regional_power !== undefined)) errors.push("Supply exactly one of plot.efficiency or regional_power.");
  if (args.regional_power && args.regional_power.current_plot_required_dec > args.regional_power.current_required_dec) errors.push("Current plot demand cannot exceed current regional demand.");
  if (args.regional_power && !args.runi && args.workers.some(w => w.land_dec_stake_needed === undefined)) errors.push("Regional recomputation requires each ordinary worker’s raw land_dec_stake_needed before cap and Dark Discount.");
  const resolved = args.workers.map(w => {
    const definition = cards.cards.find(c => c.card_detail_id === w.card_detail_id);
    const level = definition?.levels.find(l => l.level === w.level);
    if (definition && !level) errors.push("Unsupported level for known Land card " + w.uid);
    if (definition && w.abilities !== undefined) errors.push("Known Land card abilities must come from the dated resource: " + w.uid);
    if (!definition && w.abilities === undefined) errors.push("Supply explicit abilities (including an empty array for none) for other cards: " + w.uid);
    const abilities = (level?.abilities ?? w.abilities ?? []).flatMap(a => {
      const parsed = ability.safeParse(a);
      if (!parsed.success) { errors.push("Unsupported Land ability " + String(a[0]) + " on " + w.uid); return []; }
      return [parsed.data];
    });
    return { ...w, abilities };
  });
  const energized = resolved.some(w => w.abilities.some(a => a[0] === "ENERGIZED"));
  const ordinarySlots = args.power_core || energized ? 5 : args.runi ? 4 : 0;
  if (ordinarySlots === 0) errors.push("No Power Core, Energized worker or Runi powers this lineup.");
  if (resolved.length > ordinarySlots) errors.push("Too many ordinary workers for the supplied power sources.");
  const uids = [...resolved.map(w => w.uid), ...(args.runi ? [args.runi.uid] : [])];
  if (new Set(uids).size !== uids.length) errors.push("A card UID occurs more than once.");
  if (!production.resourceTerrains[args.plot.resource].includes(args.plot.terrain)) errors.push("This terrain does not support the requested " + args.plot.resource + " worksite.");
  const checks = { errors, ordinary_slots: ordinarySlots, energized, runi: Boolean(args.runi), power_core: args.power_core };
  if (errors.length) return { valid: false as const, checks, estimate: null };

  let rationing = 0, lite = 0, dark = 0, resourceBoost = 0;
  const bloodlineBoosts = new Map<string, number>();
  const activation: Array<{ uid: string; code: string; bloodline: string; active: boolean }> = [];
  resolved.forEach((w, index) => {
    for (const a of w.abilities as Ability[]) {
      if (a[0] === "RATIONING") rationing = Math.min(rationing, a[1]);
      else if (a[0] === "RATIONING_LITE") lite = Math.min(lite, a[1]);
      else if (a[0] === "DD") dark = Math.min(dark, a[1]);
      else if (a[0] === args.plot.resource) resourceBoost = Math.max(resourceBoost, a[1] as number);
      else if (a[0] === "BLOODLINE") {
        const target = a[2];
        const active = resolved.some((other, j) => j !== index && other.bloodline === target) || args.runi?.bloodline === target;
        activation.push({ uid: w.uid, code: a[0], bloodline: target, active });
        if (active) bloodlineBoosts.set(target, Math.max(bloodlineBoosts.get(target) ?? 0, a[1]));
      }
    }
  });
  const bloodlineBoost = [...bloodlineBoosts.values()].reduce((sum, value) => sum + value, 0);
  const boostParts = {
    runi: args.runi ? 1 : 0, totem: args.totem_boost, title: args.title_boost,
    rarity: args.plot.rarity_boost, status: args.plot.status_boost, resource: resourceBoost, bloodline: bloodlineBoost,
  };
  let remaining = args.plot.base_cap;
  const prepared = resolved.map((w, i) => {
    const retained = Math.min(w.base_pp, remaining);
    remaining -= retained;
    const modifierFor = (e: z.infer<typeof element>) => e === "neutral" ? terrain.neutralModifier : terrain.modifiers[args.plot.terrain][e];
    const primary = modifierFor(w.element);
    const secondary = w.secondary_element === undefined ? primary : modifierFor(w.secondary_element);
    const selected = secondary > primary ? w.secondary_element! : w.element;
    return { uid: w.uid, slot: i + 1, base: w.base_pp, retained, modifier: Math.max(primary, secondary), selected_element: selected as string, dec_required: args.runi || retained === 0 ? 0 : w.land_dec_stake_needed === undefined ? null : Math.ceil(round(w.land_dec_stake_needed * (retained / w.base_pp) * (1 + dark))), runi: false };
  });
  if (args.runi) prepared.push({ uid: args.runi.uid, slot: 0, base: args.runi.base_pp, retained: args.runi.base_pp, modifier: args.runi.terrain_modifier, selected_element: "caller-supplied", dec_required: 0, runi: true });
  const plotDecRequired = prepared.some(w => w.dec_required === null) ? null : prepared.reduce((sum, w) => sum + (w.dec_required ?? 0), 0);
  const regionalRequired = args.regional_power
    ? args.regional_power.current_required_dec - args.regional_power.current_plot_required_dec + plotDecRequired!
    : null;
  const regionalEfficiency = args.regional_power
    ? regionalRequired! === 0 ? 1 : Math.min(1, args.regional_power.staked_dec / regionalRequired!)
    : args.plot.efficiency!;
  const efficiency = args.runi ? 1 : regionalEfficiency;
  const power = {
    mode: args.regional_power ? "recomputed_region" : "supplied_efficiency",
    plot_dec_required: plotDecRequired, regional_dec_required: regionalRequired,
    regional_efficiency: regionalEfficiency, plot_efficiency: efficiency,
    regional_dec_shortfall: args.regional_power ? Math.max(0, regionalRequired! - args.regional_power.staked_dec) : null,
    scope: "Regional totals must describe the same account/region and include the current plot exactly once. Other plots and staked DEC are held unchanged. Zero demand uses efficiency 1. All inputs are supplied facts, not fetched balances.",
  };
  const workers = prepared.map(w => {
    const terrainPP = round(w.retained * w.modifier);
    const boostable = round(w.retained * (1 + w.modifier));
    const contributions = Object.fromEntries(Object.entries(boostParts).map(([key, value]) => [key, round(boostable * value)]));
    const total = round(boostable + Object.values(contributions).reduce((sum, value) => sum + value, 0));
    return { uid: w.uid, slot: w.slot, runi: w.runi, base_pp: w.base, base_pp_after_cap: w.retained,
      over_cap_pp: round(w.base - w.retained), terrain_modifier: w.modifier, selected_element: w.selected_element, terrain_pp: terrainPP,
      boostable_pp: boostable, boost_contributions: contributions, total_pp: total, dec_required: w.dec_required,
      resource_per_hour: round(total * efficiency * production.resourceOutputPerProductionPointPerHour[args.plot.resource]) };
  });
  const sum = (field: "base_pp" | "base_pp_after_cap" | "boostable_pp" | "total_pp" | "resource_per_hour") => round(workers.reduce((n, w) => n + w[field], 0));
  const retainedBase = sum("base_pp_after_cap");
  const foodReduction = rationing + (retainedBase <= 20000 ? lite : 0);
  if (foodReduction < -1) return { valid: false as const, checks: { ...checks, errors: ["Combined caller-supplied food reductions exceed 100%."] }, estimate: null };
  const output = sum("resource_per_hour");
  const food = output > 0 && efficiency > 0 ? Math.round(retainedBase * efficiency * (1 + foodReduction) * 0.01 * 100) / 100 : 0;
  notes.push("Offline what-if from supplied values; ownership, current staking, DEC balances and backend agreement are not verified.");
  notes.push("Resource output is gross before taxes. Runi terrain and base, external abilities and boosts are explicit caller inputs. Power uses either supplied efficiency or a supplied regional snapshot with this plot’s demand replaced.");
  return { valid: true as const, checks, estimate: {
    workers, base_pp: sum("base_pp"), base_pp_after_cap: retainedBase, boostable_pp: sum("boostable_pp"), total_pp: sum("total_pp"),
    resource: args.plot.resource, resource_per_hour: output, grain_per_hour: args.plot.resource === "GRAIN" ? output : null,
    food_per_hour: food, grain_balance_before_tax_per_hour: args.plot.resource === "GRAIN" ? round(output - food) : null,
    efficiency, power, boost_parts: boostParts, boost_sum: Object.values(boostParts).reduce((a, b) => a + b, 0),
    rationing, light_rationing: lite, light_rationing_applies: retainedBase <= 20000,
    dark_discount: dark, bloodline_activation: activation,
  }, rules_reviewed_at: "2026-09-12", notes };
}


export function estimateLineups(input: z.input<typeof lineupToolSchema>) {
  const { comparisons, ...baseline } = lineupToolSchema.parse(input);
  const result = estimateLineup(baseline);
  if (!comparisons) return result;
  return {
    ...result,
    comparisons: comparisons.map(({ label, lineup }) => ({ label, ...estimateLineup(lineup) })),
    comparison_scope: "Independent alternatives, each with its own complete snapshot. No moves are applied between alternatives. No ranking is inferred across resources or different supplied facts.",
  };
}

export function registerLineupEstimator(server: McpServer): void {
  server.registerTool("land_lineup_estimate", {
    description: "Optionally supply up to ten uniquely labelled comparisons, each with a complete lineup snapshot, to evaluate alternatives alongside the baseline in one offline call. Each result retains its own validity; any invalid result sets isError while valid alternatives remain available. Alternatives are independent, not sequential moves. Offline deterministic Land what-if for Grain/Wood/Stone/Iron worksites. Supply an ordered worker snapshot (UID, detail ID, level, base PP, element and bloodline), plot terrain and efficiency, Power Core, optional Runi and item boost fractions. Bare UIDs cannot be resolved offline. Known edition-19 abilities use the dated resource; other workers require explicit ability tuples or an empty array. Returns raw/capped Base, Boostable and Total PP, gross resource/hour, food/hour, cap losses, ability activation and validity checks. Five ordinary slots with Core/Energized; Runi alone powers four plus itself. No HTTP, signing, ownership or live staking validation. Supply exactly one of plot.efficiency or regional_power (staked_dec, current_required_dec including this plot, current_plot_required_dec). Regional mode also needs each worker’s raw land_dec_stake_needed before cap/discount; it replaces old plot demand with the estimated new demand and holds all other plots unchanged. Output reports per-worker/plot demand, regional efficiency and shortfall. Runi needs no plot DEC and runs at full efficiency. Neutral workers have zero terrain modifier; dual-element workers use the better modifier. Terrain eligibility is checked for all four resources. Castles/Keeps, SPS and Research are outside this current estimator. Public-client formula evidence is dated; use an agreeing land_lineup_snapshot baseline for live comparisons.",
    inputSchema: lineupToolSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => {
    const result = estimateLineups(input);
    const invalidComparison = "comparisons" in result && result.comparisons.some(row => !row.valid);
    return { isError: !result.valid || invalidComparison, content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
  });
}
