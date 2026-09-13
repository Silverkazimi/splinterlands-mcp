import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import definitions from "./fixtures/api-cards-get-details.fixture.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { withCollectionStaking } from "../src/collection-staking.js";
import { parseCardsCollection, type ProjectedCollectionCard } from "../src/cards-collection.js";
import { collectionCardMatches } from "../src/server.js";
import fixture from "./fixtures/api-cards-collection.fixture.json" with { type: "json" };
const at = Date.parse("2026-09-12T00:00:00Z");
const base = fixture.body.cards[0] as ProjectedCollectionCard;

describe("collection staking state", () => {
  it("rejects incomplete selectors before HTTP and applies plot filtering without forwarding it", async () => {
    const urls: string[] = [];
    let clock = at;
    const server = createServer({ now: () => clock, sleep: async () => undefined,
      limiterOptions: { sleep: async () => undefined }, fetch: async input => {
        urls.push(String(input));
        const body = String(input).includes("/cards/get_details") ? definitions.body : {
          player: "synthetic", cards: [{ ...base, stake_start_date: "2026-09-01T00:00:00Z", stake_end_date: null, stake_plot: 101 }],
        };
        return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      } });
    const client = new Client({ name: "staking-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      expect((await client.callTool({ name: "cards_collection", arguments: { username: "synthetic", staked: "plot" } })).isError).toBe(true);
      expect(urls).toHaveLength(0);
      const args = { username: "synthetic", staked: "plot", stake_plot_id: 101 };
      const first = await client.callTool({ name: "cards_collection", arguments: args });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({ total: 1, cards: [{ stake_plot: 101, staking_status: "staked" }] });
      expect(urls).toHaveLength(2);
      expect(urls.every(url => !url.includes("stake_plot") && !url.includes("staked="))).toBe(true);
      clock += 1000;
      const second = await client.callTool({ name: "cards_collection", arguments: args });
      expect(second.structuredContent).toMatchObject({ cache: "hit", cards: [{ staking_observed_at: "2026-09-12T00:00:00.000Z" }] });
      expect(urls).toHaveLength(2);
    } finally { await client.close(); await server.close(); }
  });

  it("separates active staking, cooldown, completed cooldown, pending and missing evidence", () => {
    const start = "2026-09-01T00:00:00Z";
    const cases = [
      [{ stake_start_date: start, stake_end_date: null }, "staked"],
      [{ stake_start_date: start, stake_end_date: "2026-09-13T00:00:00Z" }, "unstaking"],
      [{ stake_start_date: start, stake_end_date: "2026-09-12T00:00:00Z" }, "unstaked"],
      [{ stake_start_date: "2026-09-13T00:00:00Z", stake_end_date: null }, "pending"],
      [{ stake_start_date: null, stake_end_date: null }, "unstaked"],
      [{}, "unknown"], [{ stake_start_date: start }, "unknown"],
    ] as const;
    for (const [fields, status] of cases) expect(withCollectionStaking({ ...base, ...fields }, at).staking_status).toBe(status);
  });
  it("filters active numeric plots and never treats missing or cooling state as unstaked", () => {
    const card = withCollectionStaking({ ...base, stake_start_date: "2026-09-01T00:00:00Z", stake_end_date: null, stake_plot: 101 }, at);
    expect(collectionCardMatches(card, { username: "synthetic", staked: "plot", stake_plot_id: 101 })).toBe(true);
    expect(collectionCardMatches(card, { username: "synthetic", staked: "plot", stake_plot_id: 102 })).toBe(false);
    for (const state of ["unknown", "unstaking", "pending"] as const)
      expect(collectionCardMatches({ ...card, staking_status: state }, { username: "synthetic", staked: "no" })).toBe(false);
  });
  it("streams optional staking fields before filtering and pagination, preserving absent fields", async () => {
    const cards = [
      { ...base }, { ...base, stake_start_date: "2026-09-01T00:00:00Z", stake_end_date: null, stake_plot: 101, land_dec_stake_needed: 1250 },
      { ...base, stake_start_date: null, stake_end_date: null, stake_plot: null },
    ];
    const result = await parseCardsCollection(new Response(JSON.stringify({ player: "synthetic", cards })), {
      enrich: c => withCollectionStaking(c, at), matches: c => c.staking_status === "staked", limit: 1,
    });
    expect(result.total).toBe(1);
    expect(result.cards[0]).toMatchObject({ land_dec_stake_needed: 1250, stake_plot: 101, staking_status: "staked", staking_observed_at: "2026-09-12T00:00:00.000Z" });
    await expect(parseCardsCollection(new Response(JSON.stringify({ player: "synthetic", cards: [{ ...base, stake_plot: "101" }] })))).rejects.toThrow("wire type");
  });
});
