import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  diffShapes,
  observeShape,
  SHAPE_MAX_DEPTH,
  type ShapeFingerprint,
} from "../scripts/drift/shape.js";

function fixturePaths(value: unknown, path = ""): string[] {
  const paths = path === "" ? [] : [path];
  if (Array.isArray(value)) {
    for (const item of value) {
      paths.push(...fixturePaths(item, `${path}[]`));
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      paths.push(...fixturePaths(child, path === "" ? key : `${path}.${key}`));
    }
  }
  return paths;
}

describe("drift shape observation", () => {
  it("uses catalogue paths, records containers, and ignores array indexes and length", () => {
    const observed = observeShape({ data: [{ uid: "first" }, { uid: "second" }] });

    expect(observed).toEqual({
      fields: {
        data: { types: ["array"] },
        "data[]": { types: ["object"] },
        "data[].uid": { types: ["string"] },
      },
      truncatedAt: [],
    });
  });

  it("unions every observed type, including null, at one path", () => {
    const observed = observeShape({ data: [{ value: "x" }, { value: null }, { value: 1 }] });

    expect(observed.fields["data[].value"]).toEqual({ types: ["null", "number", "string"] });
  });

  it("discards values and retains only structural fields", () => {
    const observed = observeShape({ secret: "response-value", count: 918273645 });

    expect(observed).toEqual({
      fields: {
        count: { types: ["number"] },
        secret: { types: ["string"] },
      },
      truncatedAt: [],
    });
    expect(JSON.stringify(observed)).not.toContain("response-value");
    expect(JSON.stringify(observed)).not.toContain("918273645");
  });

  it("stops at the configured depth and records the truncated container path", () => {
    const observed = observeShape({ a: { b: { c: { d: { e: true } } } } }, 4);

    expect(observed.fields["a.b.c.d"]).toEqual({ types: ["object"] });
    expect(observed.truncatedAt).toEqual(["a.b.c.d"]);
    expect(observed.fields["a.b.c.d.e"]).toBeUndefined();
    expect(SHAPE_MAX_DEPTH).toBe(8);
  });

  it("fully observes fixture response bodies without counting classification metadata as wire nesting", () => {
    const directory = new URL("./fixtures/", import.meta.url);
    const walk = (current: URL, relativeDirectory: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const relativePath = `${relativeDirectory}${entry.name}`;
        const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), current);
        if (entry.isDirectory()) {
          walk(entryUrl, `${relativePath}/`);
          continue;
        }
        if (!entry.name.endsWith(".json")) continue;
        const fixture = JSON.parse(readFileSync(entryUrl, "utf8")) as unknown;
        const body = typeof fixture === "object" && fixture !== null && "body" in fixture
          ? (fixture as { body: unknown }).body : fixture;
        const observed = observeShape(body);
        expect(observed.truncatedAt, relativePath).toEqual([]);
        expect(Object.keys(observed.fields).sort(), relativePath).toEqual([...new Set(fixturePaths(body))].sort());
      }
    };
    walk(directory, "");
  });

  it("observes tournament payout leaves at depth eight without widening the cap", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/tournament-upcoming.fixture.json", import.meta.url), "utf8")) as { body: unknown };
    const observed = observeShape(fixture.body);
    expect(SHAPE_MAX_DEPTH).toBe(8);
    expect(observed.truncatedAt).toEqual([]);
    expect(observed.fields["[].data.prizes.payouts[].items[].qty"]).toEqual({ types: ["number"] });
  });

  it("sorts all output deterministically", () => {
    const first = observeShape({ z: [{ b: true, a: null }], a: "x" });
    const second = observeShape({ a: "x", z: [{ a: null, b: true }] });

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("diffs additions, removals, retypes, and truncation without extra changes", () => {
    const baseline: ShapeFingerprint = {
      fields: {
        kept: { types: ["string"] },
        removed: { types: ["number"] },
        "tree.branch": { types: ["object"] },
        "tree.branch.leaf": { types: ["string"] },
        tree: { types: ["object"] },
      },
      truncatedAt: [],
    };
    const observed: ShapeFingerprint = {
      fields: {
        added: { types: ["boolean"] },
        kept: { types: ["number"] },
        "tree.branch": { types: ["object"] },
        tree: { types: ["object"] },
      },
      truncatedAt: ["tree.branch"],
    };

    expect(diffShapes(baseline, observed)).toEqual([
      { keyPath: "added", change: "added", observedTypes: ["boolean"] },
      { keyPath: "kept", change: "retyped", baselineTypes: ["string"], observedTypes: ["number"] },
      { keyPath: "removed", change: "removed", baselineTypes: ["number"] },
    ]);
  });
});
