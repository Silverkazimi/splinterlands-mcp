import definitionFixture from "./fixtures/api-cards-get-details.fixture.json" with { type: "json" };
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import collectionFixture from "./fixtures/api-cards-collection.raw.json" with { type: "json" };
import { createServer } from "../src/server.js";
import { COLLECTION_INDEX_CARD_LIMIT } from "../src/cards-collection.js";

// Kept in its own file so its large synthetic body does not share a worker heap with the parse-guard tests.
function chunkedJson(value: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += 65_536) controller.enqueue(bytes.subarray(offset, offset + 65_536));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("collection index", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pages a large collection with one upstream read and offers a compact projection", async () => {
    const source = collectionFixture.body.cards[0] as Record<string, unknown>;
    const template = Object.fromEntries(["card_detail_id", "edition", "gold", "foil", "level", "xp", "bcx", "collection_power", "card_set", "land_base_pp"].map((field) => [field, source[field]]));
    const body = { player: "fixture_account", cards: Array.from({ length: 8_000 }, (_, i) => ({ ...template, uid: `C3-79-${String(i).padStart(10, "0")}` })) };
    // The worker heap carries earlier tests; the guard itself is covered by the memory-limit tests.
    vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 1, heapTotal: 1, heapUsed: 1, external: 0, arrayBuffers: 0 });
    let fetchCalls = 0;
    const server = createServer({
      fetch: async (input) => {
        if (String(input).includes("/cards/get_details")) return chunkedJson(definitionFixture.body);
        fetchCalls += 1;
        return chunkedJson(body);
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });
    const client = new Client({ name: "collection-index-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const seen = new Set<string>();
      let cursor: number | null = 0;
      let pages = 0;
      while (cursor !== null) {
        const page = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", cursor, all: true } });
        if (page.isError) throw new Error(JSON.stringify(page.content));
        const content = page.structuredContent as { cards: Array<Record<string, unknown>>; next_cursor: number | null; projection: string; index: { age_ms: number } };
        expect(content.projection).toBe("compact");
        expect(typeof content.index.age_ms).toBe("number");
        for (const card of content.cards) {
          expect(Object.keys(card).sort()).toEqual(["bcx", "bcx_max", "card_detail_id", "card_set", "edition", "excess_bcx", "foil", "land_base_pp", "level", "max_land_base_pp", "max_level", "maxed", "overlevelled", "rarity", "uid"]);
          seen.add(String(card.uid));
        }
        cursor = content.next_cursor;
        pages += 1;
      }
      expect(pages).toBe(80);
      expect(seen.size).toBe(8_000);
      expect(fetchCalls).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  }, 30_000);

  it("falls back to the 60-second page cache above the index card limit", async () => {
    const source = collectionFixture.body.cards[0] as Record<string, unknown>;
    const template = Object.fromEntries(["card_detail_id", "edition", "gold", "foil", "level", "xp", "bcx", "collection_power", "card_set", "land_base_pp"].map((field) => [field, source[field]]));
    const body = { player: "fixture_account", cards: Array.from({ length: COLLECTION_INDEX_CARD_LIMIT + 1 }, (_, i) => ({ ...template, uid: `C-${i}`, gold: i % 2 === 0 })) };
    vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 1, heapTotal: 1, heapUsed: 1, external: 0, arrayBuffers: 0 });
    let now = Date.parse("2026-10-11T00:00:00Z");
    let fetchCalls = 0;
    const server = createServer({
      now: () => now,
      fetch: async (input) => {
        if (String(input).includes("/cards/get_details")) return chunkedJson(definitionFixture.body);
        fetchCalls += 1;
        return chunkedJson(body);
      },
      sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined },
    });
    const client = new Client({ name: "collection-fallback-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const first = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", limit: 2 } });
      expect(first.structuredContent).toMatchObject({ total: COLLECTION_INDEX_CARD_LIMIT + 1, cache: "miss", index: { source: "upstream", cached: false, card_count: null } });
      const again = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", limit: 2 } });
      expect(again.structuredContent).toMatchObject({ cache: "hit", index: { source: "page_cache" } });
      expect(fetchCalls).toBe(1);
      const filtered = await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", gold: true, limit: 2 } });
      expect(filtered.structuredContent).toMatchObject({ cache: "miss", total: Math.ceil((COLLECTION_INDEX_CARD_LIMIT + 1) / 2) });
      expect(fetchCalls).toBe(2);
      now += 60_001;
      expect((await client.callTool({ name: "cards_collection", arguments: { username: "fixture_account", gold: true, limit: 2 } })).structuredContent).toMatchObject({ cache: "miss" });
      expect(fetchCalls).toBe(3);
    } finally {
      await client.close();
      await server.close();
    }
  }, 120_000);
});
