import { verifiedSample } from "./sample-state.js";

export const MAX_SAMPLED_BODY_BYTES = 128 * 1024;

const firstSamplePaths: Readonly<Record<string, readonly string[]>> = {
  "api.market.for-sale-grouped": [],
  "api.market.for-rent-grouped": [],
  "api.market.for-sale-packages": [],
  "api.players.rebellion-presale-leaders": [
    "players"
  ],
  "api.conflicts.leaderboard": [
    "leaderboard"
  ],
  "api.players.burn-event-leaderboard": [
    "leaderboard"
  ],
  "api.players.burn-event-full-leaderboard": [
    "leaderboard"
  ],
  "vapi.market.meta.asset": [
    "data",
    "details"
  ],
  "vapi.market.landing": [
    "data",
    "assets"
  ],
  "vapi.land.resources.liquidity.swaps": [
    "data"
  ],
  "vapi.land.resources.history": [
    "data"
  ],
  "vapi.land.resources.titles-assigned": [
    "data"
  ],
  "api.tournaments.completed": [],
  "api.tournaments.cancelled": []
};

type Sample = { kind: "first"; limit: number } | { kind: "ids"; ids: number[] };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function sampleFixtureBody(existing: Record<string, unknown>, body: unknown, entryId: string) {
  const raw = record(existing.provenance) ? existing.provenance.fixtureSample : undefined;
  if (raw === undefined) return { body };
  if (!record(raw)) throw new Error("Invalid fixture sample.");
  let sample: Sample;
  if (raw.kind === "first" && Object.hasOwn(firstSamplePaths, entryId)
    && Object.keys(raw).length === 2 && Number.isInteger(raw.limit) && Number(raw.limit) >= 1 && Number(raw.limit) <= 100) {
    sample = { kind: "first", limit: Number(raw.limit) };
  } else if (raw.kind === "ids" && ["api.cards.get-details", "api.players.item-details"].includes(entryId)
    && Object.keys(raw).length === 2 && Array.isArray(raw.ids) && raw.ids.length >= 1 && raw.ids.length <= 100
    && raw.ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(raw.ids).size === raw.ids.length) {
    sample = { kind: "ids", ids: raw.ids as number[] };
  } else throw new Error("Invalid fixture sample.");
  // Validate the complete response before selecting rows, so sampling cannot conceal malformed records.
  if (!verifiedSample(entryId, body)) throw new Error("Invalid fixture response.");
  if (sample.kind === "first") {
    const path = firstSamplePaths[entryId]!;
    const result: unknown = structuredClone(body);
    let parent: unknown = result;
    for (const key of path.slice(0, -1)) {
      if (!record(parent)) throw new Error("Invalid fixture response.");
      parent = parent[key];
    }
    if (path.length === 0) {
      if (!Array.isArray(result)) throw new Error("Invalid fixture response.");
      const rows = result.slice(0, sample.limit);
      while (Buffer.byteLength(JSON.stringify(rows)) > MAX_SAMPLED_BODY_BYTES) {
        if (rows.length <= 1) throw new Error("Fixture sample exceeds byte budget.");
        rows.pop();
      }
      return { body: rows, sample };
    }
    const key = path.at(-1)!;
    if (!record(parent) || !Array.isArray(parent[key])) throw new Error("Invalid fixture response.");
    const rows = parent[key].slice(0, sample.limit);
    parent[key] = rows;
    while (Buffer.byteLength(JSON.stringify(result)) > MAX_SAMPLED_BODY_BYTES) {
      if (rows.length <= 1) throw new Error("Fixture sample exceeds byte budget.");
      rows.pop();
    }
    return { body: result, sample };
  }
  if (!Array.isArray(body)) throw new Error("Invalid fixture response.");
  const selected = sample.ids.map(id => {
    const matches = body.filter(row => record(row) && row.id === id);
    if (matches.length !== 1) throw new Error("Fixture sample unavailable.");
    return matches[0];
  });
  return { body: selected, sample };
}
