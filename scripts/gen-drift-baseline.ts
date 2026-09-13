import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allCatalogueEntries } from "../src/catalogue/index.js";
import { isEmptyResult } from "../src/http/errors.js";
import { observeShape, type ShapeFingerprint } from "./drift/shape.js";
import type { BaselineEntry, DriftBaseline } from "./drift/types.js";

type FixtureBinding = { entryId: string; variantKey?: string };

function mergeShapes(shapes: ShapeFingerprint[]): ShapeFingerprint | null {
  if (shapes.length === 0) return null;
  const fields = new Map<string, Set<ShapeFingerprint["fields"][string]["types"][number]>>();
  const truncatedAt = new Set<string>();
  for (const shape of shapes) {
    for (const [keyPath, field] of Object.entries(shape.fields)) {
      const types = fields.get(keyPath) ?? new Set();
      for (const type of field.types) types.add(type);
      fields.set(keyPath, types);
    }
    for (const keyPath of shape.truncatedAt) truncatedAt.add(keyPath);
  }
  return {
    fields: Object.fromEntries([...fields.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([keyPath, types]) => [keyPath, { types: [...types].sort((left, right) => left.localeCompare(right)) }])),
    truncatedAt: [...truncatedAt].sort((left, right) => left.localeCompare(right)),
  };
}

function fixtureBody(fixture: Record<string, unknown>): unknown {
  const response = Object.fromEntries(Object.entries(fixture).filter(([key]) => key !== "provenance" && key !== "valueClasses"));
  return Object.keys(response).length === 1 && Object.hasOwn(response, "body") ? response.body : response;
}

export function generateBaseline(input: unknown, fixturesDirectory: string, capturedAt: string): DriftBaseline {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Drift baseline input must be an object map");
  }
  const bindings = input as Record<string, FixtureBinding>;
  const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith(".fixture.json")).sort();
  const expected = new Set(fixtureNames);
  for (const name of Object.keys(bindings)) {
    if (!expected.has(name)) throw new Error(`Drift baseline input names missing fixture '${name}'`);
  }
  for (const name of fixtureNames) {
    if (bindings[name] === undefined) throw new Error(`Fixture '${name}' is not present in drift baseline input`);
  }

  const grouped = new Map<string, { shapes: ShapeFingerprint[]; shapeSources: string[]; truncatedAt: Set<string> }>();
  for (const name of fixtureNames) {
    const binding = bindings[name];
    if (binding === undefined) continue;
    const fixture = JSON.parse(readFileSync(resolve(fixturesDirectory, name), "utf8")) as Record<string, unknown>;
    const body = fixtureBody(fixture);
    const group = grouped.get(binding.entryId) ?? { shapes: [], shapeSources: [], truncatedAt: new Set<string>() };
    if (isEmptyResult(body)) {
      group.shapeSources.push(`empty:${name}`);
    } else {
      const shape = observeShape(body);
      group.shapes.push(shape);
      group.shapeSources.push(name);
      for (const keyPath of shape.truncatedAt) group.truncatedAt.add(keyPath);
    }
    grouped.set(binding.entryId, group);
  }

  const entries: BaselineEntry[] = [];
  const unbaselined: Array<{ entryId: string; reason: string }> = [];
  for (const catalogueEntry of allCatalogueEntries()) {
    const group = grouped.get(catalogueEntry.entryId);
    if (group === undefined) {
      unbaselined.push({ entryId: catalogueEntry.entryId, reason: "no fixture is bound to this catalogue entry" });
      continue;
    }
    entries.push({
      entryId: catalogueEntry.entryId,
      host: catalogueEntry.host,
      pathTemplate: catalogueEntry.pathTemplate,
      authTier: catalogueEntry.measured?.authTier ?? catalogueEntry.declared.authTier ?? "public",
      statusesObserved: [200],
      shape: mergeShapes(group.shapes),
      shapeSources: group.shapeSources.sort((left, right) => left.localeCompare(right)),
      truncatedAt: [...group.truncatedAt].sort((left, right) => left.localeCompare(right)),
      capturedAt,
    });
  }
  return { entries, unbaselined, capturedAt };
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = resolve(argument("--input", "scripts/drift/baseline-input.json"));
  const fixturePath = resolve(argument("--fixtures", "tests/fixtures"));
  const outputPath = resolve(argument("--output", "scripts/drift/baseline.json"));
  const capturedAt = argument("--date", new Date().toISOString().slice(0, 10));
  const output = `${JSON.stringify(generateBaseline(JSON.parse(readFileSync(inputPath, "utf8")), fixturePath, capturedAt), null, 2)}\n`;
  writeFileSync(outputPath, output, "utf8");
}
