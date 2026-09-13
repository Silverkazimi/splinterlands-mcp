import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import terrain from "../src/data/land-terrain-rules.json" with { type: "json" };

describe("public Land rule resources", () => {
  it("discovers and reads all five resources without any upstream call", async () => {
    let requests = 0;
    const server = createServer({ fetch: async () => { requests += 1; throw new Error("Rules must be offline"); } });
    const client = new Client({ name: "land-rules-test", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const listed = await client.listResources();
      expect(listed.resources.filter((r) => r.uri.startsWith("splinterlands://land/")).map((r) => r.uri).sort()).toEqual([
        "splinterlands://land/rules/cap", "splinterlands://land/rules/card-abilities", "splinterlands://land/rules/production", "splinterlands://land/rules/screen-fields", "splinterlands://land/rules/terrain",
      ]);
      const read = async (suffix: string) => {
        const result = await client.readResource({ uri: "splinterlands://land/rules/" + suffix });
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0]?.mimeType).toBe("application/json");
        return JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
      };
      const abilities = await read("card-abilities");
      expect(abilities).toMatchObject({
        edition: 19, originalCardIds: [866, 867, 868, 869], additionalObservedCardIds: [1051],
        verification: { originalLevelRowsCompared: 28 },
        rules: { bloodlineRequiresAnotherMatchingWorker: true, lightRationingMaximumBaseProduction: 20000, landCardAbilitiesRemainActiveAtBaseCap: true },
      });
      const cards = abilities.cards as Array<{ card_detail_id: number; levels: Array<{ level: number; abilities: unknown[][] }> }>;
      expect(cards.map((c) => [c.card_detail_id, c.levels.length])).toEqual([[866, 10], [867, 8], [868, 6], [869, 4], [1051, 10]]);
      for (const card of cards) expect(card.levels.map((l) => l.level)).toEqual(Array.from({ length: card.levels.length }, (_, i) => i + 1));
      expect(cards[0]?.levels[9]?.abilities).toContainEqual(["GRAIN", 0.6]);
      expect(cards[1]?.levels[7]?.abilities).toContainEqual(["BLOODLINE", 0.3, "Elf"]);
      expect(cards[2]?.levels[5]?.abilities).toContainEqual(["STONE", 0.85]);
      expect(cards[3]?.levels[3]?.abilities).toContainEqual(["DD", -0.99]);
      expect(cards[4]?.levels.slice(0, 9).every((l) => l.abilities.length === 0)).toBe(true);
      expect(cards[4]?.levels[9]?.abilities).toEqual([["ENERGIZED"], ["RATIONING_LITE", -0.1]]);
      const mapping = await read("screen-fields");
      expect(mapping).toMatchObject({
        capAllocation: { workerOrder: [1, 2, 3, 4, 5], runiExcluded: true },
        powerSlots: { ordinaryWorkersWithCoreOrEnergized: 5, ordinaryWorkersWithRuniOnly: 4 },
      });
      expect(mapping.workerFields).toEqual(expect.arrayContaining([
        expect.objectContaining({ apiField: "land_base_pp", screenLabel: "Base Production" }),
        expect.objectContaining({ apiField: "total_construction_pp", screenLabel: "Boostable Production" }),
        expect.objectContaining({ apiField: "total_harvest_pp", screenLabel: "Total Production" }),
      ]));
      const table = await read("terrain");
      expect(table.modifiers).toEqual(terrain.modifiers);
      const production = await read("production");
      expect(production.resourceOutputPerProductionPointPerHour).toEqual({ GRAIN: 0.02, WOOD: 0.005, STONE: 0.002, IRON: 0.0005 });
      expect(production.grainConsumptionPerBaseProductionPointPerHour).toBe(0.01);
      const cap = await read("cap");
      expect(cap).toMatchObject({ worksiteBaseProductionCap: 100000, runiExcludedFromCap: true, appliesBeforeBoosts: true });
      expect(cap.buildingCap).toMatch(/lower/);
      await expect(client.readResource({ uri: "splinterlands://land/rules/unverified" })).rejects.toThrow();
      expect(requests).toBe(0);
    } finally { await client.close(); await server.close(); }
  });

  it("preserves the complete diagram dimensions and its distinctive terrain preferences", () => {
    expect(Object.keys(terrain.modifiers)).toHaveLength(14);
    for (const row of Object.values(terrain.modifiers)) {
      expect(Object.keys(row).sort()).toEqual([...terrain.elements].sort());
      expect(Object.values(row).every((value) => [-0.5, 0, 0.1].includes(value))).toBe(true);
    }
    expect(terrain.modifiers.canyon).toEqual({ fire: 0.1, water: -0.5, life: -0.5, death: 0.1, earth: -0.5, dragon: 0.1 });
    expect(terrain.modifiers.tundra).toEqual({ fire: -0.5, water: 0.1, life: 0.1, death: -0.5, earth: 0.1, dragon: -0.5 });
    expect(terrain.modifiers.bog).toEqual(terrain.modifiers.swamp);
    expect(terrain.modifiers.forest).toEqual(terrain.modifiers.jungle);
    expect(terrain.modifiers.lake).toEqual(terrain.modifiers.river);
    expect(terrain.modifiers.plains).toEqual({ fire: 0, water: -0.5, life: 0.1, death: 0, earth: -0.5, dragon: 0.1 });
    expect(terrain.modifiers.badlands.water).toBe(0);
    expect(terrain.modifiers.caldera.dragon).toBe(0.1);
    expect(terrain.modifiers.mountain.death).toBe(0.1);
    expect(terrain.source.imageSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
