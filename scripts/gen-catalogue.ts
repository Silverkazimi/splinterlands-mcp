import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogueEntrySchema, type CatalogueEntry } from "../src/catalogue/schema.js";

type SourceEntry = Partial<CatalogueEntry> & Pick<CatalogueEntry, "entryId" | "host" | "pathTemplate" | "owningTool" | "notes">;

const SOURCE_ENTRY_KEYS = new Set([
  "entryId",
  "host",
  "method",
  "pathTemplate",
  "pathParams",
  "queryParams",
  "observedQueryParams",
  "tier",
  "declared",
  "measured",
  "resultContract",
  "variants",
  "owningTool",
  "notes",
  "provenance",
]);

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

export function generate(input: unknown): CatalogueEntry[] {
  if (!Array.isArray(input)) {
    throw new TypeError("Catalogue input must be an array");
  }
  const entries = input.map((source, index) => {
    if (typeof source !== "object" || source === null) {
      throw new TypeError(`Catalogue input entry ${index}: expected an object`);
    }
    const unexpectedKeys = Object.keys(source).filter((key) => !SOURCE_ENTRY_KEYS.has(key));
    if (unexpectedKeys.length > 0) {
      throw new TypeError(`Catalogue input entry ${index}: unrecognised field(s): ${unexpectedKeys.join(", ")}`);
    }
    const candidate = source as SourceEntry;
    const entry = {
      entryId: candidate.entryId,
      host: candidate.host,
      method: "GET" as const,
      pathTemplate: candidate.pathTemplate,
      pathParams: candidate.pathParams ?? [],
      queryParams: (candidate.queryParams ?? []).map((parameter) => ({
        ...parameter,
        measuredRequired: parameter.measuredRequired ?? null,
      })),
      ...(candidate.observedQueryParams === undefined ? {} : { observedQueryParams: candidate.observedQueryParams }),
      tier: candidate.tier ?? null,
      declared: candidate.declared ?? {
        authTier: null,
        pagination: null,
      },
      measured: candidate.measured ?? null,
      resultContract: candidate.resultContract ?? {
        envelope: candidate.host === "vapi" ? "vapi" : "bare",
        fingerprint: {},
        requiredKeyPaths: [],
      },
      ...(candidate.variants === undefined ? {} : { variants: candidate.variants }),
      owningTool: candidate.owningTool,
      notes: candidate.notes,
      provenance: candidate.provenance ?? null,
    };
    const parsed = CatalogueEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.map(String).join(".") || "entry"}: ${issue.message}`).join("; ");
      throw new TypeError(`Catalogue input entry '${candidate.entryId ?? index}': ${details}`);
    }
    return parsed.data;
  });
  return entries.sort((left, right) => left.entryId.localeCompare(right.entryId));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = resolve(argument("--input", "scripts/catalogue-input.json"));
  const outputPath = resolve(argument("--output", "src/catalogue/catalogue.json"));
  const input = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  const output = `${JSON.stringify(generate(input), null, 2)}\n`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}
