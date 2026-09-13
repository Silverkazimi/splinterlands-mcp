import definitionFixture from "./fixtures/api-cards-get-details.fixture.json" with { type: "json" };
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import collectionFixture from "./fixtures/api-cards-collection.fixture.json" with { type: "json" };
import { CollectionParseError, parseCardsCollection, type ProjectedCollectionCard } from "../src/cards-collection.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { matchesResultContract } from "../src/catalogue/fingerprint.js";
import { collectionCardMatches, createServer } from "../src/server.js";

function streamedJson(value: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += 7) {
        controller.enqueue(bytes.slice(offset, offset + 7));
      }
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("cards collection contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the trimmed upstream envelope and declares its projected fields", () => {
    const entry = getCatalogueEntry("api.cards.collection");
    expect(matchesResultContract(collectionFixture.body, entry.resultContract)).toBe(true);
    expect(entry.resultContract.requiredKeyPaths).toContain("cards[].collection_power");
    expect(entry.resultContract.fingerprint["cards[].xp"]).toEqual({ type: "number", valueClass: "numeric" });
    expect(entry.resultContract.fingerprint["cards[].bcx"]).toEqual({ type: "number", valueClass: "numeric" });
  });

  it("retains one page, re-streams for a later cursor, and re-streams after cache expiry", async () => {
    let now = Date.parse("2026-09-08T00:00:00Z");
    let fetchCalls = 0;
    const server = createServer({
      now: () => now,
      fetch: async (input) => {
        if (String(input).includes("/cards/get_details")) return streamedJson(definitionFixture.body);
        fetchCalls += 1;
        return streamedJson(collectionFixture.body);
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });
    const client = new Client({ name: "collection-contract-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const first = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", limit: 1 } });
      const firstBody = first.structuredContent as { cards: Array<Record<string, unknown>>; next_cursor: number | null; cache: string };
      expect(firstBody.cards).toHaveLength(1);
      expect(firstBody.cards[0]).toEqual(expect.objectContaining({ uid: "C3-79-0B847L3PGG", bcx: 1, xp: 1 }));
      expect(firstBody.cards[0]).toHaveProperty("land_base_pp", "1000.000");
      expect(firstBody.next_cursor).toBe(1);
      expect(firstBody.cache).toBe("miss");

      const second = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", cursor: 1, limit: 1 } });
      const secondBody = second.structuredContent as { cards: Array<Record<string, unknown>>; cache: string };
      expect(secondBody.cards[0]?.uid).toBe("C3-1-0B847L3PGH");
      expect(secondBody.cache).toBe("miss");
      expect(fetchCalls).toBe(2);

      const secondAgain = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", cursor: 1, limit: 1 } });
      expect((secondAgain.structuredContent as { cache: string }).cache).toBe("hit");
      expect(fetchCalls).toBe(2);

      now += 60_001;
      const third = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", cursor: 1, limit: 1 } });
      expect((third.structuredContent as { cache: string }).cache).toBe("miss");
      expect(fetchCalls).toBe(3);
      const filtered = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", min_land_base_pp: 250, limit: 1 } });
      expect(filtered.structuredContent).toMatchObject({ total: 2, next_cursor: 1, cache: "miss", cards: [{ land_base_pp: "1000.000" }] });
      const filteredAgain = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", min_land_base_pp: 250, limit: 1 } });
      expect(filteredAgain.structuredContent).toMatchObject({ cache: "hit" });
      expect(fetchCalls).toBe(4);
      const filteredNext = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", min_land_base_pp: 250, limit: 1, cursor: 1 } });
      expect(filteredNext.structuredContent).toMatchObject({ total: 2, next_cursor: null, cards: [{ land_base_pp: "250.000" }] });
      const higher = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", min_land_base_pp: 251 } });
      expect(higher.structuredContent).toMatchObject({ total: 1, cache: "miss" });
      expect(fetchCalls).toBe(6);

    } finally {
      await client.close();
      await server.close();
    }
  });

  it("compares each limit against the metric it was derived from, not merely against some metric", async () => {
    // Thresholds sit BETWEEN the two stubbed samples, so a guard that reads the
    // wrong process.memoryUsage() field fails here. Tripping thresholds that any
    // metric exceeds would pass even with the two comparisons swapped, which is
    // the exact defect class this row exists to prevent.
    const HEAP_SAMPLE = 100 * 1024 * 1024;
    const RSS_SAMPLE = 200 * 1024 * 1024;
    vi.spyOn(process, "memoryUsage").mockReturnValue({
      rss: RSS_SAMPLE,
      heapTotal: HEAP_SAMPLE,
      heapUsed: HEAP_SAMPLE,
      external: 0,
      arrayBuffers: 0,
    });

    // Heap under its limit, RSS under its own: parsing completes. A swapped guard
    // would compare the 100 MiB heap limit against the 200 MiB RSS sample and abort.
    const withinLimits = await parseCardsCollection(streamedJson(collectionFixture.body), {
      maxHeapBytes: HEAP_SAMPLE + 1,
      maxRssBytes: RSS_SAMPLE + 1,
    });
    expect(withinLimits.cards).toHaveLength(3);

    // Heap under its limit, RSS over its own: only the RSS ceiling may fire. A
    // swapped guard reaches the heap comparison first and throws the wrong message.
    await expect(parseCardsCollection(streamedJson(collectionFixture.body), {
      maxHeapBytes: HEAP_SAMPLE + 1,
      maxRssBytes: RSS_SAMPLE - 1,
    })).rejects.toThrow(/RSS operational ceiling/);

    // Heap over its limit while RSS stays under its own.
    const heapAbort = await parseCardsCollection(streamedJson(collectionFixture.body), {
      maxHeapBytes: HEAP_SAMPLE - 1,
      maxRssBytes: RSS_SAMPLE + 1,
    }).catch((error: unknown) => error);
    expect(heapAbort).toBeInstanceOf(CollectionParseError);
    expect((heapAbort as Error).message).toMatch(/heap occupancy guard/);
  });

  it("selects on each of the six local filters", () => {
    const [common, goldFoil, otherSet] = collectionFixture.body.cards as unknown as ProjectedCollectionCard[];
    if (common === undefined || goldFoil === undefined || otherSet === undefined) {
      throw new Error("The collection fixture must carry three cards for the filter matrix.");
    }
    const cards = { common, goldFoil, otherSet };

    expect(collectionCardMatches(cards.common, { username: "fixture_account" })).toBe(true);

    expect(collectionCardMatches(cards.goldFoil, { username: "u", gold: true })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", gold: true })).toBe(false);

    expect(collectionCardMatches(cards.goldFoil, { username: "u", foil: 1 })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", foil: 1 })).toBe(false);

    expect(collectionCardMatches(cards.otherSet, { username: "u", edition: 4 })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", edition: 4 })).toBe(false);

    expect(collectionCardMatches(cards.otherSet, { username: "u", card_set: "CONCLAVE" })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", card_set: "CONCLAVE" })).toBe(false);

    expect(collectionCardMatches(cards.goldFoil, { username: "u", min_level: 2 })).toBe(true);
    expect(collectionCardMatches(cards.otherSet, { username: "u", min_level: 2 })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", min_level: 2 })).toBe(false);

    expect(collectionCardMatches(cards.goldFoil, { username: "u", min_collection_power: 50 })).toBe(true);
    expect(collectionCardMatches(cards.otherSet, { username: "u", min_collection_power: 50 })).toBe(true);
    expect(collectionCardMatches(cards.common, { username: "u", min_collection_power: 50 })).toBe(false);

    expect(collectionCardMatches(cards.goldFoil, { username: "u", gold: true, min_level: 2 })).toBe(true);
    expect(collectionCardMatches(cards.goldFoil, { username: "u", gold: true, min_level: 5 })).toBe(false);
  });
});

describe("Land production projection", () => {
  it("preserves decimal strings, excludes unknown power from numeric filters, and keeps exact threshold matches", async () => {
    const body = structuredClone(collectionFixture.body);
    const missing = body.cards[1] as Record<string, unknown>;
    delete missing.land_base_pp;
    const all = await parseCardsCollection(streamedJson(body));
    expect(all.cards[1]).not.toHaveProperty("land_base_pp");
    const filtered = await parseCardsCollection(streamedJson(body), {
      matches: (card) => collectionCardMatches(card, { username: "fixture_account", min_land_base_pp: 0 }),
    });
    expect(filtered.total).toBe(2);
    expect(filtered.cards.map((card) => card.land_base_pp)).toEqual(["1000.000", "250.000"]);
    const exact = await parseCardsCollection(streamedJson(body), {
      matches: (card) => collectionCardMatches(card, { username: "fixture_account", min_land_base_pp: 1000 }),
    });
    expect(exact.total).toBe(1);
  });

  it.each(["", " ", "NaN", "Infinity", "-1", "12oops", "0x10", "9".repeat(400), 1000])(
    "refuses malformed production power %j",
    async (value) => {
      const body = structuredClone(collectionFixture.body);
      (body.cards[0] as Record<string, unknown>).land_base_pp = value;
      await expect(parseCardsCollection(streamedJson(body))).rejects.toThrow(/land_base_pp/);
    },
  );
});

it("preserves observed null production and never treats it as numeric zero", async () => {
 const body=structuredClone(collectionFixture.body);
 (body.cards[1] as Record<string,unknown>).land_base_pp=null;
 const all=await parseCardsCollection(streamedJson(body));
 expect(all.cards[1]?.land_base_pp).toBeNull();
 const filtered=await parseCardsCollection(streamedJson(body),{matches:card=>collectionCardMatches(card,{username:"fixture_account",min_land_base_pp:0})});
 expect(filtered.total).toBe(2);
 expect(filtered.cards.every(card=>typeof card.land_base_pp==="string")).toBe(true);
});
