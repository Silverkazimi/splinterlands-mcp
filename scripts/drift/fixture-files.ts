import { lstatSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { z } from "zod";
import { TOOL_ENTRY_IDS } from "../../src/server.js";
import type { RecaptureInput } from "./recapture.js";

const configSchema = z.array(z.object({
  fixturePath: z.string().regex(/^tests\/fixtures\/[a-z0-9][a-z0-9-]*\.fixture\.json$/),
  entryId: z.string(),
  params: z.record(z.union([z.string().max(1000), z.number().finite(), z.boolean()])),
  variantKey: z.string().optional(),
}).strict()).min(1).max(512);

function fixtureRoot(root: string): string {
  const base = realpathSync(root);
  const expected = resolve(base, "tests/fixtures");
  if (realpathSync(expected) !== expected || lstatSync(expected).isSymbolicLink()) throw new Error("Unsafe fixture directory.");
  return expected;
}

export function loadRecaptureInputs(root: string, raw: unknown): RecaptureInput[] {
  const config = configSchema.parse(raw);
  const base = fixtureRoot(root);
  const bindings = JSON.parse(readFileSync(resolve(root, "scripts/drift/baseline-input.json"), "utf8")) as Record<string, { entryId: string; variantKey?: string }>;
  return config.map(item => {
    const name = basename(item.fixturePath);
    const binding = bindings[name];
    if (!binding || binding.entryId !== item.entryId || (binding.variantKey ?? "default") !== (item.variantKey ?? "default")) throw new Error("Fixture binding mismatch.");
    const path = resolve(base, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(path) !== path || stat.size > 2 * 1024 * 1024) throw new Error("Unsafe fixture file.");
    const existing: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error("Invalid fixture envelope.");
    return { fixturePath: item.fixturePath, entryId: item.entryId, params: item.params,
      ...(item.variantKey === undefined ? {} : { variantKey: item.variantKey }),
      existing: existing as Record<string, unknown> };
  });
}

export function writeRenewedFixture(root: string, path: string, contents: string): void {
  if (!/^tests\/fixtures\/(?:pending\/)?[a-z0-9][a-z0-9-]*\.fixture\.json$/.test(path)) throw new Error("Unsafe renewal target.");
  const base = fixtureRoot(root);
  const target = resolve(realpathSync(root), path);
  const parent = dirname(target);
  if (parent !== base) {
    if (parent !== resolve(base, "pending")) throw new Error("Unsafe renewal parent.");
    mkdirSync(parent, { recursive: true });
    if (realpathSync(parent) !== parent || lstatSync(parent).isSymbolicLink()) throw new Error("Unsafe pending directory.");
  }
  let exists = true;
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(target) !== target) throw new Error("Unsafe renewal file.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    exists = false;
  }
  writeFileSync(target, contents, { encoding: "utf8", flag: exists ? "w" : "wx" });
}

export function fixtureCoverage(bindings: Record<string, { entryId: string }>, configured: ReadonlySet<string>) {
  const callable = new Set<string>(Object.values(TOOL_ENTRY_IDS));
  const entries = Object.entries(bindings);
  const eligible = entries.filter(([, binding]) => callable.has(binding.entryId));
  return {
    eligible: eligible.length,
    excluded: entries.filter(([, binding]) => !callable.has(binding.entryId))
      .map(([fixture, binding]) => ({ fixture, entryId: binding.entryId })),
    unconfigured: eligible.filter(([name]) => !configured.has(name)).map(([name]) => name),
  };
}
