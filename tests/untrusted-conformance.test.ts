import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanUntrustedText } from "../src/untrusted.js";
import { HIDDEN_RANGES } from "../src/untrusted-hidden.js";

// The cleaner has a twin in another language; both must give byte-identical output on these shared vectors.
// expected/clean.jsonl is that twin's output (uncapped); a change in either side shows up here.
type Vector = { id: string; carrier: string; text: string };
type Expected = { id: string; clean: string };

const readJsonl = <T>(path: string): T[] =>
  readFileSync(new URL(path, import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line) as T);

const vectors = readJsonl<Vector>("./vectors/injections.jsonl");
const expected = new Map(readJsonl<Expected>("./vectors/expected/clean.jsonl").map((row) => [row.id, row.clean]));

describe("shared cleaner vectors", () => {
  it("has an expected output for every vector", () => {
    expect(vectors.map((v) => v.id).filter((id) => !expected.has(id))).toEqual([]);
  });

  it.each(vectors.map((v) => [v.id, v] as const))("cleans %s exactly like the twin", (_id, vector) => {
    expect(cleanUntrustedText(vector.text)).toBe(expected.get(vector.id));
  });

  it("uses the same frozen hidden-character table", () => {
    const shared = JSON.parse(readFileSync(new URL("./vectors/expected/hidden-ranges.json", import.meta.url), "utf8")) as number[][];
    expect(HIDDEN_RANGES.map(([lo, hi]) => [lo, hi])).toEqual(shared);
  });

  it("is idempotent", () => {
    for (const vector of vectors) {
      const once = cleanUntrustedText(vector.text);
      expect(cleanUntrustedText(once)).toBe(once);
    }
  });
});
