import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import mintHistory from "./fixtures/api-cards-mint-history-card-detail-id-871-foil-2.fixture.json" with { type: "json" };
import mintHistoryEmpty from "./fixtures/api-cards-mint-history-card-detail-id-100-foil-0.fixture.json" with { type: "json" };
import jackpot from "./fixtures/api-cards-pack-jackpot-overview-edition-19.fixture.json" with { type: "json" };
import jackpotEmpty from "./fixtures/api-cards-pack-jackpot-overview-edition-13.fixture.json" with { type: "json" };
import goldRewards from "./fixtures/api-cards-ca-gold-rewards.fixture.json" with { type: "json" };

type Fixture = { body: unknown };
let server: ReturnType<typeof createServer> | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
});

async function connect(fetch: typeof globalThis.fetch, now: () => number = Date.now): Promise<void> {
  server = createServer({ fetch, now, sleep: async () => undefined, limiterOptions: { sleep: async () => undefined } });
  client = new Client({ name: "card-mints-contract-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
}

function body(fixture: Fixture): unknown {
  return fixture.body;
}

describe("card mint tools", () => {
  it("routes the three public endpoints and preserves their wire shapes", async () => {
    const calls: URL[] = [];
    await connect(async input => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === "/cards/mint_history") return new Response(JSON.stringify(body(mintHistory)));
      if (url.pathname === "/cards/pack_jackpot_overview") return new Response(JSON.stringify(body(jackpot)));
      return new Response(JSON.stringify(body(goldRewards)));
    });

    const mint = await client!.callTool({ name: "cards_mint_history", arguments: { card_detail_id: 871, foil: 2 } });
    expect(mint.isError).not.toBe(true);
    expect(mint.structuredContent).toEqual(body(mintHistory));
    expect(calls[0]?.hostname).toBe("api.splinterlands.com");
    expect(Object.fromEntries(calls[0]!.searchParams)).toEqual({ card_detail_id: "871", foil: "2" });

    const overview = await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 19 } });
    expect(overview.structuredContent).toEqual({ data: body(jackpot) });
    const rewards = await client!.callTool({ name: "cards_ca_gold_rewards", arguments: {} });
    expect(rewards.structuredContent).toEqual({ data: body(goldRewards) });
    expect((body(goldRewards) as Array<Record<string, unknown>>)[0]?.count).toEqual(expect.any(String));
    expect(calls.map(url => url.pathname)).toEqual([
      "/cards/mint_history", "/cards/pack_jackpot_overview", "/cards/ca_gold_rewards",
    ]);
  });

  it("accepts empty mint and jackpot answers, including omitted total_minted", async () => {
    await connect(async input => {
      const path = new URL(String(input)).pathname;
      return new Response(JSON.stringify(path === "/cards/mint_history" ? body(mintHistoryEmpty) : body(jackpotEmpty)));
    });
    const mint = await client!.callTool({ name: "cards_mint_history", arguments: { card_detail_id: 100, foil: 0 } });
    expect(mint.structuredContent).toEqual(body(mintHistoryEmpty));
    expect(mint.structuredContent).not.toHaveProperty("total_minted");
    const overview = await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 13 } });
    expect(overview.structuredContent).toEqual({ data: [] });
  });

  it("caches static metadata but not mint history", async () => {
    let now = Date.parse("2026-09-18T00:00:00Z");
    let requests = 0;
    await connect(async input => {
      requests += 1;
      const path = new URL(String(input)).pathname;
      return new Response(JSON.stringify(path === "/cards/mint_history" ? body(mintHistory) : body(jackpot)));
    }, () => now);
    await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 19 } });
    await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 19 } });
    expect(requests).toBe(1);
    await client!.callTool({ name: "cards_mint_history", arguments: { card_detail_id: 871, foil: 2 } });
    await client!.callTool({ name: "cards_mint_history", arguments: { card_detail_id: 871, foil: 2 } });
    expect(requests).toBe(3);
    now += 24 * 60 * 60 * 1000;
    await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 19 } });
    expect(requests).toBe(4);
  });

  it("enforces catalogue integer bounds and the shared row limit", async () => {
    await connect(async () => new Response(JSON.stringify(Array.from({ length: 101 }, (_, card_detail_id) => ({
      card_detail_id, total_minted: 1, total: 1, foils: [{ foil: 1, minted: 1, total: 1 }],
    })) )));
    for (const args of [
      { name: "cards_mint_history", arguments: { card_detail_id: 0, foil: 0 } },
      { name: "cards_mint_history", arguments: { card_detail_id: 1, foil: -1 } },
      { name: "cards_pack_jackpot_overview", arguments: { edition: -1 } },
    ]) expect((await client!.callTool(args)).isError).toBe(true);
    const result = await client!.callTool({ name: "cards_pack_jackpot_overview", arguments: { edition: 19 } });
    expect(result.structuredContent).toMatchObject({ data: expect.any(Array) });
    expect((result.structuredContent as { data: unknown[] }).data).toHaveLength(100);
    expect(result._meta).toMatchObject({ resultLimit: { truncated: true, returnedRows: 100, upstreamRows: 101 } });
  });
});
