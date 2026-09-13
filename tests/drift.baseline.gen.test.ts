import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateBaseline } from "../scripts/gen-drift-baseline.js";

describe("drift baseline generation", () => {
  it("regenerates the committed baseline exactly from its fixture map", () => {
    const input = JSON.parse(readFileSync(new URL("../scripts/drift/baseline-input.json", import.meta.url), "utf8")) as unknown;
    const committed = JSON.parse(readFileSync(new URL("../scripts/drift/baseline.json", import.meta.url), "utf8")) as { capturedAt: unknown };
    expect(committed.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(generateBaseline(input, new URL("./fixtures/", import.meta.url).pathname, committed.capturedAt as string)).toEqual(committed);
  });

  it("records empty fixtures without adding their fields to shape", () => {
    const baselineInput = JSON.parse(readFileSync(new URL("../scripts/drift/baseline-input.json", import.meta.url), "utf8")) as Record<string, { entryId: string; variantKey?: string }>;
    const input = Object.fromEntries(Object.keys(baselineInput).map((name) => [
      name,
      name === "land-deed-by-plot-miss.fixture.json"
        ? { entryId: "vapi.land.deeds.by-plot" }
        : { entryId: "vapi.test.unbaselined" },
    ]));
    const result = generateBaseline(input, new URL("./fixtures/", import.meta.url).pathname, "2026-09-07");
    const entry = result.entries.find(({ entryId }) => entryId === "vapi.land.deeds.by-plot");
    expect(entry?.shape).toBeNull();
    expect(entry?.shapeSources).toEqual(["empty:land-deed-by-plot-miss.fixture.json"]);
    expect(result.unbaselined.length).toBeGreaterThan(0);
  });
});

it("compares the response inside wrapped fixtures, not the fixture container", () => {
 const input = JSON.parse(readFileSync(new URL("../scripts/drift/baseline-input.json", import.meta.url), "utf8"));
 const result = generateBaseline(input, new URL("./fixtures/", import.meta.url).pathname, "2026-09-13");
 const shape = result.entries.find(e => e.entryId === "vapi.delegation.outgoing")?.shape;
 expect(shape?.fields["data[].amount"]).toEqual({ types: ["string"] });
 expect(shape?.fields["body"]).toBeUndefined();
});

it("uses measured public access when the specification declares authentication", () => {
  const input = JSON.parse(readFileSync(new URL("../scripts/drift/baseline-input.json", import.meta.url), "utf8"));
  const result = generateBaseline(input, new URL("./fixtures/", import.meta.url).pathname, "2026-09-13");
  expect(result.entries.find(entry => entry.entryId === "api.battle.battle-queue")?.authTier).toBe("public");
});
