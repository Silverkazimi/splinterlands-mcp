import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fingerprintSpec, type ParsedSpec } from "./spec-diff.js";
import { SPEC_SOURCES } from "./spec-source.js";
import { deliverReview, deliveryCommand, type DeliveryCommand } from "./fixture-delivery.js";

export type SpecificationSet = Record<keyof typeof SPEC_SOURCES, ParsedSpec>;
const methods = ["get", "head", "post", "put", "patch", "delete", "options", "trace"];
export const SPEC_REVIEW_PATHS = [
  "scripts/drift/spec-baseline.json", "scripts/drift/spec-baseline-api.json",
  "scripts/drift/spec-declarations.json", "src/catalogue/catalogue.json",
];

export function specificationReviewFiles(specs: SpecificationSet): Map<string, string> {
  const files = new Map<string, string>();
  const declarations = [];
  for (const source of ["vapi", "api"] as const) {
    const spec = specs[source];
    if (!spec || !Object.keys(spec.paths).length) throw new Error("Both specifications are required.");
    const fingerprint = fingerprintSpec(spec);
    const path = source === "vapi" ? SPEC_REVIEW_PATHS[0]! : SPEC_REVIEW_PATHS[1]!;
    files.set(path, JSON.stringify({ source: SPEC_SOURCES[source], ...fingerprint }, null, 2) + "\n");
    for (const [route, value] of Object.entries(spec.paths).sort(([a], [b]) => a.localeCompare(b))) {
      if (route.length > 200 || !/^\/[A-Za-z0-9_{}./:*-]*$/.test(route)) throw new Error("Unsupported specification route.");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported specification path item.");
      const item = value as Record<string, unknown>;
      declarations.push({ source, path: route, methods: methods.filter(method => Object.hasOwn(item, method)),
        fingerprint: fingerprint.paths[route] });
    }
  }
  files.set(SPEC_REVIEW_PATHS[2]!, JSON.stringify({
    purpose: "Upstream declarations for review; not verified runtime capabilities or access permissions.",
    declarations,
  }, null, 2) + "\n");
  return files;
}

export async function deliverSpecificationReview(root: string, repository: string, runId: string,
  specs: SpecificationSet, run: DeliveryCommand = deliveryCommand,
  writer: (path: string, contents: string) => void = (path, contents) => writeFileSync(resolve(root, path), contents),
): Promise<"held" | "unchanged" | "review-opened"> {
  const files = specificationReviewFiles(specs);
  return deliverReview(repository, runId, "spec-review", SPEC_REVIEW_PATHS, () => {
    for (const [path, contents] of files) writer(path, contents);
    run("npm", ["exec", "--", "tsx", "scripts/gen-catalogue.ts"]);
  }, "Review upstream API specification changes",
  "Regenerate both specification fingerprints and the declaration catalogue. Regenerate the runtime catalogue from its reviewed input without promoting unverified routes or authentication declarations. Review upstream changes and update curated input, endpoint verification and tests where needed before merging. No merge or release is automatic.", run);
}
