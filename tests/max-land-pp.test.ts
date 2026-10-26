import { describe, expect, it } from "vitest";
import { maxLandBasePp, MAX_LAND_PP_MULTIPLIERS, indexCardDefinitions, joinCardDefinition } from "../src/card-definitions.js";
import { createServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("max-level Land base PP", () => {
  it("uses every supported set regime, rarity and regular/gold/black foil", () => {
    const regular = [1000, 1100, 1250, 1500];
    const gold = [2000, 4000, 6000, 10000];
    for (const [set, multiplier] of Object.entries(MAX_LAND_PP_MULTIPLIERS)) {
      for (let rarity = 1; rarity <= 4; rarity++) {
        expect(maxLandBasePp(set, rarity, 0)).toBe(regular[rarity - 1]! * multiplier);
        expect(maxLandBasePp(set, rarity, 1)).toBe(gold[rarity - 1]! * multiplier);
        expect(maxLandBasePp(set, rarity, 3)).toBeNull();
      }
    }
  });
  it("returns zero for no_pp and null for unknown set, rarity and special foil", () => {
    expect(maxLandBasePp("chaos", 1, 0, true)).toBe(0);
    expect(maxLandBasePp("unknown", 1, 0)).toBeNull();
    expect(maxLandBasePp("chaos", null, 0)).toBeNull();
    expect(maxLandBasePp("chaos", 1, 2)).toBeNull();
    expect(maxLandBasePp("chaos", 1, 4)).toBeNull();
  });
  it("adds the value to collection joins and exposes an offline reference tool", async () => {
    const base = { uid: "fixture-card", card_detail_id: 1, card_set: "rebellion", foil: 1, gold: true, edition: 1, level: 1, xp: 0, bcx: 1, collection_power: 1 };
    const definitions = indexCardDefinitions([{ id: 1, name: "Fixture", color: "Red", sub_type: null, rarity: 2, no_pp: false }]);
    expect(joinCardDefinition(base, definitions)).toMatchObject({ max_land_base_pp: 2000 });
    expect(joinCardDefinition({ ...base, foil: 3, gold: false, land_base_pp: "2750" }, definitions)).toMatchObject({ maxed: true, max_land_base_pp: 2750 });
    expect(joinCardDefinition({ ...base, card_detail_id: 2 }, definitions)).toMatchObject({ max_land_base_pp: null });
    const server = createServer({ fetch: async () => { throw Error("offline tool fetched"); } });
    const client = new Client({ name: "fixture", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "cards_max_land_pp", arguments: { card_set: "rebellion", rarity: 2, foil: 1 } });
      expect(result.structuredContent).toMatchObject({ max_land_base_pp: 2000, rule_source: expect.any(String) });
    } finally { await client.close(); await server.close(); }
  });
});
