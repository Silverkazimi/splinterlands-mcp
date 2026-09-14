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
      expect(test.calls).toHaveLength(3);
      test.advance(24 * 60 * 60 * 1000);
      await test.call();
      expect(test.calls.slice(-2)).toEqual(["/cards/get_details", "/cards/collection/fixture_account"]);
    } finally { await test.close(); }
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
