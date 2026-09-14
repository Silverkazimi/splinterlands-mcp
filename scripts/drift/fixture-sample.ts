import { verifiedSample } from "./sample-state.js";

type Sample = { kind: "first"; limit: number } | { kind: "ids"; ids: number[] };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function sampleFixtureBody(existing: Record<string, unknown>, body: unknown, entryId: string) {
  const raw = record(existing.provenance) ? existing.provenance.fixtureSample : undefined;
  if (raw === undefined) return { body };
  if (!record(raw)) throw new Error("Invalid fixture sample.");
  let sample: Sample;
  if (raw.kind === "first" && ["api.market.for-sale-grouped", "api.players.rebellion-presale-leaders"].includes(entryId)
    && Object.keys(raw).length === 2 && Number.isInteger(raw.limit) && Number(raw.limit) >= 1 && Number(raw.limit) <= 100) {
    sample = { kind: "first", limit: Number(raw.limit) };
  } else if (raw.kind === "ids" && ["api.cards.get-details", "api.players.item-details"].includes(entryId)
    && Object.keys(raw).length === 2 && Array.isArray(raw.ids) && raw.ids.length >= 1 && raw.ids.length <= 100
    && raw.ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(raw.ids).size === raw.ids.length) {
    sample = { kind: "ids", ids: raw.ids as number[] };
  } else throw new Error("Invalid fixture sample.");
  // Validate the complete response before selecting rows, so sampling cannot conceal malformed records.
  if (!verifiedSample(entryId, body)) throw new Error("Invalid fixture response.");
  if (sample.kind === "first" && entryId === "api.players.rebellion-presale-leaders") {
    if (!record(body) || !Array.isArray(body.players)) throw new Error("Invalid fixture response.");
    return { body: { ...body, players: body.players.slice(0, sample.limit) }, sample };
  }
  if (!Array.isArray(body)) throw new Error("Invalid fixture response.");
  if (sample.kind === "first") return { body: body.slice(0, sample.limit), sample };
  const selected = sample.ids.map(id => {
    const matches = body.filter(row => record(row) && row.id === id);
    if (matches.length !== 1) throw new Error("Fixture sample unavailable.");
    return matches[0];
  });
  return { body: selected, sample };
}
