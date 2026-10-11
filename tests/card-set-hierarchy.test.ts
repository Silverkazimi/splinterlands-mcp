import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import editions from "../src/data/card-editions.json" with { type: "json" };
import { withCardSetHierarchy } from "../src/card-set-hierarchy.js";
import { collectionCardMatches, createServer } from "../src/server.js";
import type { ProjectedCollectionCard } from "../src/cards-collection.js";
import definitions from "./fixtures/api-cards-get-details.fixture.json" with { type: "json" };

const regressions = [
  { id: 79, edition: 3, card_set: "beta" },
  { id: 337, edition: 3, card_set: "chaos" },
  { id: 2, edition: 2, card_set: "alpha" },
  { id: 202, edition: 2, card_set: "conclave" },
  { id: 17, edition: 17, card_set: "foundations" },
  { id: 5, edition: 5, card_set: "untamed" },
  { id: 13, edition: 13, card_set: "rebellion" },
  { id: 20, edition: 20, card_set: "conclave" },
];

function copy(row: { id: number; edition: number; card_set: string }): ProjectedCollectionCard {
  return {
    uid: `synthetic-${row.id}-${row.card_set}`, card_detail_id: row.id,
    edition: row.edition, card_set: row.card_set, gold: false, foil: 0,
    level: 1, xp: 1, bcx: 1, collection_power: 1,
  };
}

describe("main set and sub set hierarchy", () => {
  it("keeps all 10 main sets independent of every numeric edition 0–21", () => {
    for (const set of editions.cardSetValues) {
      for (const edition of editions.numericEditions) {
        const card = withCardSetHierarchy({ card_set: set.value, edition: edition.number });
        expect(card.main_set).toBe(set.value);
        expect(card.main_set_label).toBe(set.label);
        expect(card.print_class).toBe(edition.printClass);
        expect(card.sub_set).toBe(edition.subSet);
        expect(card.edition_unmapped).toBeUndefined();
      }
    }
  });

  it.each(regressions)("preserves named copy $id edition $edition in $card_set", (row) => {
    const card = withCardSetHierarchy(copy(row));
    const edition = editions.numericEditions[row.edition];
    expect(card.main_set).toBe(row.card_set);
    expect(card.print_class).toBe(edition?.printClass);
    expect(card.sub_set).toBe(edition?.subSet);
  });

  it("marks unknown editions and absent card_set without inventing labels", () => {
    expect(withCardSetHierarchy({ edition: 99 })).toMatchObject({ main_set: null, main_set_label: null, print_class: null, sub_set: null, edition_unmapped: true });
    expect(withCardSetHierarchy({ card_set: "future", edition: 3 })).toMatchObject({ main_set: "future", main_set_label: null, print_class: "reward" });
  });

  it("filters Chaos rewards separately from Beta rewards and reward copies across sets", () => {
    const beta = withCardSetHierarchy(copy(regressions[0]!));
    const chaos = withCardSetHierarchy(copy(regressions[1]!));
    const rows = [beta, chaos];
    expect(rows.filter((card) => collectionCardMatches(card, { username: "synthetic", main_set: "chaos" })).map((card) => card.card_detail_id)).toEqual([337]);
    expect(rows.filter((card) => collectionCardMatches(card, { username: "synthetic", print_class: "reward" })).map((card) => card.card_detail_id)).toEqual([79, 337]);
  });

  it("normalizes cards_find rows and validates collection filters without extra requests", async () => {
    const rows = regressions.slice(0, 2).map(copy);
    let calls = 0;
    const server = createServer({
      fetch: async (input) => {
        calls += 1;
        const path = String(input);
        const body = path.includes("/cards/find") ? rows.map((row) => ({ ...row, player: "synthetic", bcx_unbound: 0 })) : path.includes("/cards/get_details") ? definitions.body : { player: "synthetic", cards: rows };
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });
    const client = new Client({ name: "hierarchy-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const found = await client.callTool({ name: "cards_find", arguments: { ids: rows.map((row) => row.uid).join(",") } });
      if (!found.structuredContent || typeof found.structuredContent !== "object" || !("data" in found.structuredContent)) throw new Error(JSON.stringify(found));
      expect((found.structuredContent as { data: Array<Record<string, unknown>> }).data.map((row) => [row.main_set, row.print_class])).toEqual([["beta", "reward"], ["chaos", "reward"]]);
      const chaos = await client.callTool({ name: "cards_collection", arguments: { username: "synthetic", main_set: "CHAOS" } });
      expect((chaos.structuredContent as { cards: Array<Record<string, unknown>> }).cards.map((row) => row.main_set)).toEqual(["chaos"]);
      const reward = await client.callTool({ name: "cards_collection", arguments: { username: "synthetic", print_class: "ReWaRd" } });
      expect((reward.structuredContent as { cards: Array<Record<string, unknown>> }).cards.map((row) => row.main_set)).toEqual(["beta", "chaos"]);
      expect(calls).toBe(3); // find, definitions, then one collection stream that indexes both filters
      expect((await client.callTool({ name: "cards_collection", arguments: { username: "synthetic", print_class: "invented" } })).isError).toBe(true);
      expect(calls).toBe(3);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
