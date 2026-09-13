import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generate } from "../scripts/gen-catalogue.js";

describe("catalogue generation", () => {
  it("F4 passes on current main and fails when manifest and catalogue drift", () => {
    const manifest = JSON.parse(readFileSync(new URL("../scripts/catalogue-input.json", import.meta.url), "utf8")) as unknown;
    const committedCatalogue = JSON.parse(readFileSync(new URL("../src/catalogue/catalogue.json", import.meta.url), "utf8")) as unknown;

    expect(generate(manifest)).toEqual(committedCatalogue);
  });

  it("keeps unverified card availability entries uncontracted in the canonical source", () => {
    const manifest = JSON.parse(readFileSync(new URL("../scripts/catalogue-input.json", import.meta.url), "utf8")) as Array<Record<string, unknown>>;
    const entryIds = new Set([
      "vapi.land.stake.cards-available",
      "vapi.land.stake.cards-grouped",
    ]);
    const sourceEntries = manifest.filter((entry) => entryIds.has(String(entry.entryId)));
    const generatedEntries = generate(manifest).filter((entry) => entryIds.has(entry.entryId));

    expect(sourceEntries).toHaveLength(2);
    expect(sourceEntries.every((entry) => !Object.hasOwn(entry, "resultContract"))).toBe(true);
    expect(generatedEntries.every((entry) => Object.keys(entry.resultContract.fingerprint).length === 0)).toBe(true);
    expect(generatedEntries.every((entry) => entry.resultContract.requiredKeyPaths.length === 0)).toBe(true);
  });
});
