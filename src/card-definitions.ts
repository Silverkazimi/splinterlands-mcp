import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import type { HttpResult, FreshSuccess } from "./http/errors.js";
import { CARD_DETAILS_TTL_MS } from "./http/cache.js";
import type { ProjectedCollectionCard } from "./cards-collection.js";

export type CardDefinition = {
  name: string;
  color: string;
  sub_type: string | null;
  rarity: number | null;
  maxLevel: number | null;
  secondary_color?: string | null;
  landAbilities?: Array<Array<Array<string | number>>>;
};

// Maximum BCX per rarity (common, rare, epic, legendary). The modern and
// Foundations values are the last entries of official /settings
// combine_rates{,_gold} and foundations_combine_rates{,_gold}. Alpha/Beta
// values follow the same /settings XP tables for legacy cards. See
// library/observations/collection-maxed-rules-2026-10-26.md.
const MAX_BCX = {
  alpha: { regular: [379, 86, 32, 8], gold: [31, 17, 8, 3] },
  beta: { regular: [505, 115, 46, 11], gold: [38, 22, 10, 4] },
  modern: { regular: [400, 115, 46, 11], gold: [38, 22, 10, 4] },
  foundations: { regular: [60, 25, 10, 3], gold: [5, 4, 2, 1] },
} as const;

function maxBcx(card: ProjectedCollectionCard, rarity: number): number | null {
  if (card.foil === 3 || card.foil === 4) return 1;
  const set = card.card_set?.toLowerCase();
  const regime = set === "alpha" || set === "beta" || set === "foundations" ? set
    : set && set !== "other" ? "modern"
    : card.edition === 0 ? "alpha"
    : card.edition === 15 || card.edition === 16 ? "foundations"
    : card.edition === 1 || card.edition === 3 ? "beta"
    : card.edition === 2 ? (card.card_detail_id < 100 ? "alpha" : "beta")
    : null;
  if (regime === null) return null;
  return MAX_BCX[regime][card.gold ? "gold" : "regular"][rarity - 1] ?? null;
}

export function indexCardDefinitions(data: unknown): Map<number, CardDefinition> {
  if (!Array.isArray(data) || data.length === 0) throw new Error("Card definitions must be a nonempty array.");
  const index = new Map<number, CardDefinition>();
  for (const value of data) {
    if (value === null || typeof value !== "object") throw new Error("Invalid card definition.");
    const row = value as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || (row.id as number) < 1 ||
        typeof row.name !== "string" || row.name.length === 0 ||
        typeof row.color !== "string" || row.color.length === 0 ||
        (row.sub_type !== null && typeof row.sub_type !== "string") ||
        (row.secondary_color !== undefined && row.secondary_color !== null && typeof row.secondary_color !== "string")) {
      throw new Error("Card definition join fields have an unexpected type.");
    }
    const stats = row.stats as Record<string, unknown> | undefined;
    const rarity = Number.isInteger(row.rarity) && (row.rarity as number) >= 1 && (row.rarity as number) <= 4 ? row.rarity as number : null;
    // Official /settings exposes rarity-indexed combine_rates (10/8/6/4 levels) and
    // foundations_combine_rates (5/4/3/2). Definition stat arrays can provide a
    // card-specific cap. BCX thresholds vary by set and foil; the collection's
    // upstream `level` has already resolved those thresholds for each copy.
    // Source: https://api2.splinterlands.com/settings and
    // https://docs.splinterlands.com/cards/combining-cards (checked 2026-10-26).
    const levelLengths = stats && typeof stats === "object" ? Object.entries(stats)
      .filter(([key, value]) => ["mana", "attack", "ranged", "magic", "armor", "health", "speed", "abilities", "land_abilities"].includes(key) && Array.isArray(value))
      .map(([, value]) => (value as unknown[]).length).filter(length => length > 0) : [];
    const maxLevel = levelLengths.length > 0 && levelLengths.every(length => length === levelLengths[0]) ? levelLengths[0]! : null;
    const landAbilities = stats?.land_abilities;
    if (landAbilities !== undefined && landAbilities !== null && (!Array.isArray(landAbilities)
      || !landAbilities.every(level => Array.isArray(level) && level.every(tuple => Array.isArray(tuple)
        && tuple.length > 0 && typeof tuple[0] === "string"
        && tuple.every(value => typeof value === "string" || (typeof value === "number" && Number.isFinite(value))))))) {
      throw new Error("Card definition Land ability levels have an unexpected type.");
    }
    const id = row.id as number;
    if (index.has(id)) throw new Error("Duplicate card definition identity.");
    index.set(id, {
      name: row.name, color: row.color, sub_type: row.sub_type, rarity, maxLevel,
      ...(landAbilities == null ? {} : { landAbilities: landAbilities as Array<Array<Array<string | number>>> }),
      ...(row.secondary_color === undefined ? {} : { secondary_color: row.secondary_color as string | null }),
    });
  }
  return index;
}

export function createCardDefinitionLoader(client: SplinterlandsHttpClient, now: () => number) {
  let cached: { result: FreshSuccess<Map<number, CardDefinition>>; expiresAt: number } | undefined;
  return async (): Promise<HttpResult<Map<number, CardDefinition>>> => {
    if (cached && now() < cached.expiresAt) {
      return { ...cached.result, freshness: {
        retrievedAt: cached.result.freshness.retrievedAt,
        ageMs: Math.max(0, now() - Date.parse(cached.result.freshness.retrievedAt)),
      } };
    }
    const bound = bindRequest("api.cards.get-details", {});
    const result = await bound.execute(client);
    if (!result.ok) return result;
    try {
      const projected = { ...result, data: indexCardDefinitions(result.data) };
      cached = { result: projected, expiresAt: now() + CARD_DETAILS_TTL_MS };
      return projected;
    } catch (error) {
      return {
        ok: false, kind: "upstream_malformed", endpoint: result.endpoint,
        traceId: result.traceId, freshness: result.freshness,
        message: error instanceof Error ? error.message : "Invalid card definition join.",
      };
    }
  };
}

export function joinCardDefinition(card: ProjectedCollectionCard, definitions: Map<number, CardDefinition>): ProjectedCollectionCard {
  const definition = definitions.get(card.card_detail_id);
  // Black foils (3/4) are always max level, even when the definition is unknown (Ceres card_browser rule).
  if (!definition) return { ...card, rarity: null, max_level: null, maxed: card.foil === 3 || card.foil === 4 ? true : null, bcx_max: null, overlevelled: null, excess_bcx: null };
  const { landAbilities, rarity, maxLevel, ...fields } = definition;
  const defaultCaps = [10, 8, 6, 4];
  const foundationCaps = [5, 4, 3, 2];
  const set = card.card_set?.toLowerCase();
  const cap = rarity === null ? null : set === "foundations" ? foundationCaps[rarity - 1]!
    : maxLevel ?? (set && set !== "other" ? defaultCaps[rarity - 1]! : null);
  const threshold = rarity === null ? null : maxBcx(card, rarity);
  const black = card.foil === 3 || card.foil === 4;
  const colors: Record<string, string> = { red: "fire", blue: "water", green: "earth", white: "life", black: "death", gold: "dragon", gray: "neutral" };
  const element = colors[definition.color.toLowerCase()];
  const secondary = definition.secondary_color == null ? null : colors[definition.secondary_color.toLowerCase()];
  const abilities = landAbilities === undefined ? [] : landAbilities[card.level - 1];
  return {
    ...card, ...fields, rarity, max_level: cap, bcx_max: threshold,
    maxed: black ? true : cap === null || threshold === null ? null : card.bcx >= threshold,
    overlevelled: threshold === null ? null : card.bcx > threshold,
    excess_bcx: threshold === null ? null : Math.max(0, card.bcx - threshold),
    ...(element === undefined ? {} : { element }),
    ...(secondary === undefined ? {} : { secondary_element: secondary }),
    ...(abilities === undefined ? { land_abilities_status: "level_missing" as const }
      : { land_abilities: abilities.map(tuple => [...tuple]), land_abilities_status: "known" as const }),
  };
}
