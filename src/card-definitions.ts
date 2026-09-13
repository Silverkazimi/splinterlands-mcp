import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import type { HttpResult, FreshSuccess } from "./http/errors.js";
import { CARD_DETAILS_TTL_MS } from "./http/cache.js";
import type { ProjectedCollectionCard } from "./cards-collection.js";

export type CardDefinition = {
  name: string;
  color: string;
  sub_type: string | null;
  secondary_color?: string | null;
  landAbilities?: Array<Array<Array<string | number>>>;
};

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
      name: row.name, color: row.color, sub_type: row.sub_type,
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
  if (!definition) return card;
  const { landAbilities, ...fields } = definition;
  const colors: Record<string, string> = { red: "fire", blue: "water", green: "earth", white: "life", black: "death", gold: "dragon", gray: "neutral" };
  const element = colors[definition.color.toLowerCase()];
  const secondary = definition.secondary_color == null ? null : colors[definition.secondary_color.toLowerCase()];
  const abilities = landAbilities === undefined ? [] : landAbilities[card.level - 1];
  return {
    ...card, ...fields,
    ...(element === undefined ? {} : { element }),
    ...(secondary === undefined ? {} : { secondary_element: secondary }),
    ...(abilities === undefined ? { land_abilities_status: "level_missing" as const }
      : { land_abilities: abilities.map(tuple => [...tuple]), land_abilities_status: "known" as const }),
  };
}
