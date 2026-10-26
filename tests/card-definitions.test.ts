import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
import nullSubtype from "./fixtures/card-definition-null-subtype.fixture.json" with { type: "json" };
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { indexCardDefinitions, joinCardDefinition } from "../src/card-definitions.js";
import collection from "./fixtures/api-cards-collection.raw.json" with { type: "json" };
import definitions from "./fixtures/api-cards-get-details.fixture.json" with { type: "json" };

const definitionRows = () => [
  { ...definitions.body[0], id: 79, name: "Fixture Worker", color: "Red", secondary_color: "Blue", sub_type: "Human" },
  { ...definitions.body[0], id: 1, name: "Fixture Other", color: "Green", secondary_color: null, sub_type: "Elf" },
];

async function rig(rows: unknown) {
  let now = Date.parse("2026-09-12T00:00:00Z");
  const calls: string[] = [];
  const server = createServer({
    now: () => now,
    fetch: async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      return new Response(JSON.stringify(url.pathname === "/cards/get_details" ? rows : collection.body));
    },
    sleep: async () => undefined, limiterOptions: { sleep: async () => undefined },
  });
  const client = new Client({ name: "collection-join-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  return { calls, advance: (ms: number) => { now += ms; }, close: async () => { await client.close(); await server.close(); },
    call: (args: Record<string, unknown> = {}) => client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", ...args } }),
  };
}

describe("collection definition join", () => {
  it("projects only the selected ability level and distinguishes a missing level from no table", () => {
    const rows = [{ ...definitionRows()[0]!, stats: { land_abilities: [[], [["BLOODLINE", 0.2, "Human"]]] } }];
    const index = indexCardDefinitions(rows);
    const instance = { ...collection.body.cards[0]!, card_detail_id: 79, level: 2 };
    expect(joinCardDefinition(instance, index)).toMatchObject({
      element: "fire", secondary_element: "water", land_abilities_status: "known", land_abilities: [["BLOODLINE", 0.2, "Human"]],
    });
    expect(joinCardDefinition({ ...instance, level: 3 }, index)).toMatchObject({ land_abilities_status: "level_missing" });
    expect(joinCardDefinition({ ...instance, level: 3 }, index)).not.toHaveProperty("land_abilities");
    const noTable = indexCardDefinitions([{ ...definitionRows()[0]!, stats: {} }]);
    expect(joinCardDefinition(instance, noTable)).toMatchObject({ land_abilities_status: "known", land_abilities: [] });
    expect(() => indexCardDefinitions([{ ...rows[0]!, stats: { land_abilities: [[["DD", {}]]] } }])).toThrow("ability");
  });
  it("filters normalized secondary element through MCP without forwarding local filters", async () => {
    const test = await rig(definitionRows());
    try {
      const result = await test.call({ element: "water" });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ total: 1, cards: [{ element: "fire", secondary_element: "water" }] });
      expect(test.calls).toEqual(["/cards/get_details", "/cards/collection/fixture_account"]);
    } finally { await test.close(); }
  });
  it("validates each live definition family without inventing combat stats", () => {
    const accepts = predicateFor(getCatalogueEntry("api.cards.get-details").resultContract);
    expect(accepts(nullSubtype.body)).toBe(true);
    expect(accepts([{ ...definitions.body[0], stats: { mana: 4, abilities: [] }, distribution: [] }])).toBe(true);
    expect(accepts(definitions.body)).toBe(true);
    expect(accepts([{ ...definitions.body[0], stats: { mana: "4" } }])).toBe(false);
    expect(accepts([{ ...definitions.body[0], stats: { mana: [4, "5"] } }])).toBe(false);
    expect(accepts([{ ...definitions.body[0], distribution: [{}] }])).toBe(false);
  });

  it("preserves live null subtypes", () => {
    const index = indexCardDefinitions(nullSubtype.body);
    expect(index.get(10001)?.sub_type).toBeNull();
  });
  it("joins both colors, filters before paging, reports unknown definitions and caches with separate freshness", async () => {
    const test = await rig(definitionRows());
    try {
      const first = await test.call({ color: "blue", sub_type: "human", min_land_base_pp: 1000, limit: 1 });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        total: 1, next_cursor: null, definition_missing_count: 1,
        cards: [{ card_detail_id: 79, name: "Fixture Worker", color: "Red", secondary_color: "Blue", sub_type: "Human", land_base_pp: "1000.000" }],
      });
      expect(test.calls).toEqual(["/cards/get_details", "/cards/collection/fixture_account"]);
      test.advance(1000);
      const cached = await test.call({ color: "blue", sub_type: "human", min_land_base_pp: 1000, limit: 1 });
      expect(cached.structuredContent).toMatchObject({ cache: "hit" });
      expect(test.calls).toHaveLength(2);
      expect(cached._meta).toMatchObject({ card_definitions: { endpoint: "/cards/get_details", freshness: { ageMs: 1000 } } });
      const all = await test.call();
      expect(all.structuredContent).toMatchObject({ total: 3, definition_missing_count: 1 });
      const unknown = (all.structuredContent as { cards: Array<Record<string, unknown>> }).cards[2];
      expect(unknown).not.toHaveProperty("name");
      expect(unknown).toMatchObject({ rarity: null, max_level: null, maxed: null, bcx_max: null, overlevelled: null, excess_bcx: null });
      expect(all.structuredContent).toHaveProperty("warning");
      expect(test.calls).toHaveLength(2); // the unfiltered page is served from the collection index
      test.advance(24 * 60 * 60 * 1000);
      await test.call();
      expect(test.calls.slice(-2)).toEqual(["/cards/get_details", "/cards/collection/fixture_account"]);
    } finally { await test.close(); }
  });

  it("classifies each rarity, Foundations caps, gold and black copies, then filters before paging", async () => {
    const base = definitions.body[0]!;
    const rows = [1, 2, 3, 4].map((rarity) => ({ ...base, id: 100 + rarity, rarity, stats: { mana: Array([10, 8, 6, 4][rarity - 1]).fill(1) } }));
    const index = indexCardDefinitions(rows);
    const copy = { ...collection.body.cards[0]!, card_set: "REBELLION", level: 1 };
    for (const [i, cap] of [10, 8, 6, 4].entries()) {
      const threshold = [400, 115, 46, 11][i]!;
      expect(joinCardDefinition({ ...copy, card_detail_id: 101 + i, level: cap, bcx: threshold }, index)).toMatchObject({ rarity: i + 1, max_level: cap, bcx_max: threshold, maxed: true });
      expect(joinCardDefinition({ ...copy, card_detail_id: 101 + i, level: cap - 1, bcx: threshold - 1 }, index)).toMatchObject({ maxed: false });
      expect(joinCardDefinition({ ...copy, card_detail_id: 101 + i, level: cap, bcx: threshold + 1 }, index)).toMatchObject({ maxed: true, overlevelled: true, excess_bcx: 1 });
    }
    expect(joinCardDefinition({ ...copy, card_detail_id: 101, card_set: "foundations", level: 5, bcx: 60 }, index)).toMatchObject({ max_level: 5, bcx_max: 60, maxed: true });
    expect(joinCardDefinition({ ...copy, card_detail_id: 101, card_set: "foundations", level: 5, bcx: 61 }, index)).toMatchObject({ overlevelled: true, excess_bcx: 1 });
    expect(joinCardDefinition({ ...copy, card_detail_id: 102, gold: true, foil: 1, level: 8, bcx: 22 }, index)).toMatchObject({ max_level: 8, maxed: true });
    expect(joinCardDefinition({ ...copy, card_detail_id: 104, gold: false, foil: 3, level: 4, bcx: 1 }, index)).toMatchObject({ max_level: 4, maxed: true });
    expect(joinCardDefinition({ ...copy, card_detail_id: 999_999, gold: false, foil: 3, level: 1, bcx: 1 }, index)).toMatchObject({ rarity: null, maxed: true, overlevelled: null });
    expect(joinCardDefinition({ ...copy, card_detail_id: 101, card_set: "alpha", edition: 0, bcx: 379 }, index)).toMatchObject({ bcx_max: 379, maxed: true });
    expect(joinCardDefinition({ ...copy, card_detail_id: 101, card_set: "beta", edition: 1, bcx: 379 }, index)).toMatchObject({ bcx_max: 505, maxed: false });
    expect(joinCardDefinition({ ...copy, card_detail_id: 101, card_set: "foundations", gold: true, foil: 1, bcx: 6 }, index)).toMatchObject({ bcx_max: 5, overlevelled: true, excess_bcx: 1 });
  });

  it("rejects bad metadata before the collection request and does not cache the failure", async () => {
    const rows = definitionRows(); rows.push({ ...rows[0]! });
    const test = await rig(rows);
    try {
      const first = await test.call();
      expect(first.isError).toBe(true);
      expect(test.calls).toEqual(["/cards/get_details"]);
      await test.call();
      expect(test.calls).toEqual(["/cards/get_details", "/cards/get_details"]);
    } finally { await test.close(); }
  });

  it("filters maxed copies across the full collection and combines PP with AND", async () => {
    const test = await rig(definitionRows().map(row => ({ ...row, stats: { mana: [1, 1, 1, 1] } })));
    try {
      const maxed = await test.call({ maxed: true, all: true, limit: 1 });
      expect(maxed.structuredContent).toMatchObject({ total: 1, next_cursor: null, cards: [{ card_detail_id: 1, maxed: true }] });
      const highPowerUnmaxed = await test.call({ maxed: false, min_land_base_pp: 1000, all: true, limit: 1 });
      expect(highPowerUnmaxed.structuredContent).toMatchObject({ total: 1, next_cursor: null, cards: [{ card_detail_id: 79, maxed: false, land_base_pp: "1000.000" }] });
      expect(test.calls).toEqual(["/cards/get_details", "/cards/collection/fixture_account"]);
    } finally { await test.close(); }
  });

  it("rejects unknown credential inputs before either request", async () => {
    const test = await rig(definitionRows());
    try {
      const result = await test.call({ access_token: "fixture-invalid" });
      expect(result.isError).toBe(true);
      expect(test.calls).toHaveLength(0);
    } finally { await test.close(); }
  });

  it("refuses an oversized joined record rather than emitting a nonadvancing cursor", async () => {
    const rows = definitionRows(); rows[0]!.name = "x".repeat(270_000);
    const test = await rig(rows);
    try {
      const result = await test.call();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    } finally { await test.close(); }
  });

  it.each([[], [{ id: 1 }], [{ ...definitions.body[0], secondary_color: 12 }]].map((rows) => ({ rows })))("refuses unsupported definition shapes", ({ rows }) => {
    expect(() => indexCardDefinitions(rows)).toThrow();
  });
});
