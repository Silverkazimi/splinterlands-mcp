import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fixtureCoverage, loadRecaptureInputs, writeRenewedFixture } from "../scripts/drift/fixture-files.js";

it("enforces bindings and rejects symlinked fixture targets", () => {
  const root = mkdtempSync(join(tmpdir(), "fixture-files-"));
  try {
    mkdirSync(join(root, "tests/fixtures"), { recursive: true });
    mkdirSync(join(root, "scripts/drift"), { recursive: true });
    writeFileSync(join(root, "scripts/drift/baseline-input.json"), JSON.stringify({ "sample.fixture.json": { entryId: "api.test.sample" } }));
    const file = join(root, "tests/fixtures/sample.fixture.json");
    writeFileSync(file, "{}");
    const config = [{ fixturePath: "tests/fixtures/sample.fixture.json", entryId: "api.test.sample", params: {} }];
    expect(loadRecaptureInputs(root, config)).toHaveLength(1);
    expect(() => loadRecaptureInputs(root, [{ ...config[0], entryId: "api.test.other" }])).toThrow("binding");
    const outside = join(root, "outside.json");
    writeFileSync(outside, "{}");
    rmSync(file);
    symlinkSync(outside, file);
    expect(() => loadRecaptureInputs(root, config)).toThrow("Unsafe");
    expect(() => writeRenewedFixture(root, config[0]!.fixturePath, "changed")).toThrow("Unsafe");
    expect(readFileSync(outside, "utf8")).toBe("{}");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("reports excluded fixtures separately from incomplete callable coverage", () => {
  const bindings = {
    "profile.fixture.json": { entryId: "api.players.details" },
    "excluded.fixture.json": { entryId: "vapi.land.deeds.details-by-id" },
  };
  const result = fixtureCoverage(bindings, new Set(["profile.fixture.json"]));
  expect(result.eligible).toBe(1);
  expect(result.unconfigured).toEqual([]);
  expect(result.excluded).toEqual([{ fixture: "excluded.fixture.json", entryId: "vapi.land.deeds.details-by-id" }]);
});

it("loads and renews existing underscore fixture names without admitting unsafe paths", () => {
  const root = mkdtempSync(join(tmpdir(), "fixture-filenames-"));
  try {
    mkdirSync(join(root, "tests/fixtures"), { recursive: true });
    mkdirSync(join(root, "scripts/drift"), { recursive: true });
    const name = "api-players-archived_balances.fixture.json";
    const path = "tests/fixtures/" + name;
    writeFileSync(join(root, "scripts/drift/baseline-input.json"), JSON.stringify({ [name]: { entryId: "api.players.archived-balances" } }));
    writeFileSync(join(root, path), "{}");
    const row = { fixturePath: path, entryId: "api.players.archived-balances", params: {} };
    expect(loadRecaptureInputs(root, [row])).toHaveLength(1);
    writeRenewedFixture(root, path, '{"body":[]}');
    expect(readFileSync(join(root, path), "utf8")).toBe('{"body":[]}');
    writeRenewedFixture(root, "tests/fixtures/pending/" + name, '{"body":[]}');
    expect(readFileSync(join(root, "tests/fixtures/pending/" + name), "utf8")).toBe('{"body":[]}');
    for (const unsafe of ["tests/fixtures/../outside.fixture.json", "tests/fixtures/nested/file.fixture.json", "tests/fixtures/.hidden.fixture.json", "tests/fixtures/a b.fixture.json"]) {
      expect(() => loadRecaptureInputs(root, [{ ...row, fixturePath: unsafe }])).toThrow();
      expect(() => writeRenewedFixture(root, unsafe, "{}")).toThrow();
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
