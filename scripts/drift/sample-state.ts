import { getCatalogueEntry } from "../../src/catalogue/index.js";
import { predicateFor } from "../../src/catalogue/predicates.js";
import { isEmptyResult } from "../../src/http/errors.js";

export function verifiedSample(entryId: string, body: unknown, variantKey = "default"): boolean {
  const entry = getCatalogueEntry(entryId);
  const contract = variantKey === "default" ? entry.resultContract
    : entry.variants?.find(variant => variant.variantKey === variantKey)?.resultContract;
  if (contract === undefined) return false;
  // Generic VAPI predicates allow status-only responses; maintenance needs an
  // explicit payload unless an endpoint-specific predicate verifies that form.
  if (contract.envelope === "vapi" && contract.predicateId === undefined
    && (typeof body !== "object" || body === null || !Object.hasOwn(body, "data"))) return false;
  return predicateFor(contract)(body);
}

export function fixtureIsEmpty(fixture: Record<string, unknown>): boolean {
  const data = Object.fromEntries(Object.entries(fixture).filter(([key]) => !["provenance", "valueClasses"].includes(key)));
  return isEmptyResult(Object.keys(data).length === 1 && Object.hasOwn(data, "body") ? data.body : data);
}
