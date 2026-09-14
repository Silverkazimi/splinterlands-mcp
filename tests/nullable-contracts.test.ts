import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";

const scenarios = [
  ["api.tournaments.mine", "tournament-mine-creator", ["[].allow_lite"]],
  ["api.players.current-rewards", "api-players-current-rewards", ["season_reward_info.survival_glint"]],
  ["api.players.item-details", "api-players-item-details", ["[].data", "[].stake_type_id"]],
  ["api.proposals.list", "governance-proposals", ["[].creator_avatar_id", "[].creator_league", "[].creator_modern_league"]],
  ["api.guilds.find", "guild-find", ["tournament_data", "tournament_id", "tournament_start_date", "tournament_status"]],
  ["vapi.land.resources.fragment-history", "land-resources-fragment-history", ["data[].fragment_found", "data[].fragment_chance", "data[].fragment_roll"]],
  ["api.tournaments.upcoming", "tournament-upcoming", ["[].allow_lite"]],
] as const;

function setPath(value: unknown, path: string, replacement: unknown): void {
  const [part, ...rest] = path.split(".");
  const array = part!.endsWith("[]");
  const key = array ? part!.slice(0, -2) : part!;
  const record = value as Record<string, unknown>;
  if (array) {
    const items = key === "" ? value : record[key];
    for (const item of items as unknown[]) setPath(item, rest.join("."), replacement);
  } else if (rest.length) setPath(record[key], rest.join("."), replacement);
  else record[key] = replacement;
}

it.each(scenarios)("accepts observed null fields while rejecting invalid non-null types: %s", (entryId, file, paths) => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/" + file + ".fixture.json", import.meta.url), "utf8"));
  const body = fixture.body ?? Object.fromEntries(Object.entries(fixture).filter(([key]) => !["provenance", "valueClasses"].includes(key)));
  const accepts = predicateFor(getCatalogueEntry(entryId).resultContract);
  expect(accepts(body)).toBe(true);
  const nullable = structuredClone(body);
  for (const path of paths) setPath(nullable, path, null);
  expect(accepts(nullable)).toBe(true);
  for (const path of paths) {
    const invalid = structuredClone(body);
    setPath(invalid, path, []);
    expect(accepts(invalid)).toBe(false);
  }
});

it("accepts an absent conflict participant but still validates present participant objects", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/governance-conflict-status.fixture.json", import.meta.url), "utf8"));
  const accepts = predicateFor(getCatalogueEntry("api.conflicts.status").resultContract);
  expect(accepts(fixture.body)).toBe(true);
  expect(accepts({ ...fixture.body, player: null })).toBe(true);
  expect(accepts({ ...fixture.body, player: {} })).toBe(false);
  expect(accepts({ ...fixture.body, player: [] })).toBe(false);
});
