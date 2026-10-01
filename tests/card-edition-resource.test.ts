import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("card edition reference", () => {
  it("lists and reads the dated resource offline and points to it from card tools", async () => {
    let requests = 0;
    const server = createServer({ fetch: async () => { requests += 1; throw new Error("Resource must be offline"); } });
    const client = new Client({ name: "card-editions-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const uri = "splinterlands://cards/editions";
      const listed = await client.listResources();
      expect(listed.resources).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "card-editions", uri, title: "Card sets and numeric editions", mimeType: "application/json" }),
      ]));
      const read = await client.readResource({ uri });
      expect(read.contents).toHaveLength(1);
      expect(read.contents[0]).toMatchObject({ uri, mimeType: "application/json" });
      const data = JSON.parse((read.contents[0] as { text: string }).text) as Record<string, unknown>;
      expect(data).toMatchObject({
        schemaVersion: 2,
        asOf: "2026-10-01",
        answerRule: expect.stringContaining("card_set"),
        fields: { card_set: expect.any(String), edition: expect.any(String), editions: expect.any(String) },
        sharedAlphaBeta: expect.stringContaining("1–59"),
        uidPrefixWarning: expect.stringContaining("C3-"),
        measurement: { publicAccounts: 7, distinctCollectionCardDetailIds: 1100, cardDefinitionRows: 1102 },
        sources: expect.any(Array),
      });
      const numeric = data.numericEditions as Array<{ number: number; label: string; role: string; printClass: string; subSet: string | null; underMainSet: string | null }>;
      expect(numeric.map((row) => row.number)).toEqual(Array.from({ length: 22 }, (_, n) => n));
      expect(numeric.every((row) => ["main set", "mini-set", "print class", "outlier"].includes(row.role))).toBe(true);
      expect(numeric[2]).toMatchObject({ label: "Promo", role: "print class" });
      expect(numeric[3]).toMatchObject({ label: "Reward", role: "print class" });
      expect(numeric[17]).toMatchObject({ label: "Extra", role: "print class", printClass: "extra", underMainSet: null });
      expect(numeric[5]).toMatchObject({ printClass: "mini_set", subSet: "Dice", underMainSet: "untamed" });
      expect(numeric[8]).toMatchObject({ printClass: "mini_set", subSet: "Riftwatchers", underMainSet: "chaos" });
      const sets = data.cardSetValues as Array<{ value: string; numericEditions: number[] }>;
      expect(sets.map((row) => row.value)).toEqual(["alpha", "beta", "untamed", "chaos", "rebellion", "conclave", "foundations", "gladius", "land", "other"]);
      expect(sets.filter((row) => ["foundations", "gladius", "other"].includes(row.value)).every((row) => row.numericEditions.length === 0)).toBe(true);
      const tools = await client.listTools();
      for (const name of ["cards_get_details", "cards_collection", "cards_find"]) {
        const description = tools.tools.find((tool) => tool.name === name)?.description;
        expect(description).toContain(uri);
        expect(description).toContain("card_set");
      }
      expect(requests).toBe(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
