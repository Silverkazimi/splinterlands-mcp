import rawCatalogue from "./catalogue.json" with { type: "json" };
import type { SplinterlandsHttpClient } from "../http/client.js";
import type { HttpResult } from "../http/errors.js";
import { predicateFor } from "./predicates.js";
import {
  CatalogueDocumentSchema,
  CatalogueEntrySchema,
  type CatalogueEntry,
  type ResultContract,
} from "./schema.js";
import { z, type ZodTypeAny } from "zod";

const HOSTS = {
  api: "api.splinterlands.com",
  vapi: "vapi.splinterlands.com",
  prices: "prices.splinterlands.com",
} as const;

const cataloguePathBrand = Symbol("cataloguePath");
export type CataloguePath = { readonly value: string; readonly [cataloguePathBrand]: true };

function createCataloguePath(value: string): CataloguePath {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("..") || value.includes("//")) {
    throw new TypeError("Catalogue paths must be absolute, relative-free paths without a query or fragment");
  }
  return Object.freeze({ value, [cataloguePathBrand]: true as const });
}

export function isCataloguePath(value: unknown): value is CataloguePath {
  return value !== null && typeof value === "object" && (value as Partial<CataloguePath>)[cataloguePathBrand] === true;
}

export function createTestOnlyCataloguePath(value: string): CataloguePath {
  return createCataloguePath(value);
}

export class CatalogueProgrammingError extends TypeError {
  readonly code: "unknown_entry_id" | "invalid_parameters" | "unknown_variant" | "invalid_catalogue";

  constructor(code: CatalogueProgrammingError["code"], message: string) {
    super(message);
    this.name = "CatalogueProgrammingError";
    this.code = code;
  }
}

function entryLabel(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "entryId" in raw && typeof raw.entryId === "string") {
    return raw.entryId;
  }
  return "<unknown-entry>";
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const field = issue.path.length === 0 ? "<entry>" : issue.path.map(String).join(".");
  return `${field}: ${issue.message}`;
}

function parseCatalogue(raw: unknown): readonly CatalogueEntry[] {
  if (!Array.isArray(raw)) {
    throw new CatalogueProgrammingError("invalid_catalogue", "Catalogue document: expected an array of entries");
  }
  const entries: CatalogueEntry[] = [];
  const ids = new Set<string>();
  for (const rawEntry of raw) {
    const parsed = CatalogueEntrySchema.safeParse(rawEntry);
    if (!parsed.success) {
      const details = parsed.error.issues.map(formatIssue).join("; ");
      throw new CatalogueProgrammingError("invalid_catalogue", `Catalogue entry '${entryLabel(rawEntry)}': ${details}`);
    }
    if (ids.has(parsed.data.entryId)) {
      throw new CatalogueProgrammingError("invalid_catalogue", `Catalogue entry '${parsed.data.entryId}': entryId is duplicated`);
    }
    ids.add(parsed.data.entryId);
    try {
      predicateFor(parsed.data.resultContract);
      for (const variant of parsed.data.variants ?? []) {
        predicateFor(variant.resultContract);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CatalogueProgrammingError("invalid_catalogue", `Catalogue entry '${parsed.data.entryId}': resultContract.predicateId: ${message}`);
    }
    entries.push(parsed.data);
  }
  const documentResult = CatalogueDocumentSchema.safeParse(entries);
  if (!documentResult.success) {
    const details = documentResult.error.issues.map(formatIssue).join("; ");
    throw new CatalogueProgrammingError("invalid_catalogue", `Catalogue document: ${details}`);
  }
  return Object.freeze(entries);
}

export const catalogue = parseCatalogue(rawCatalogue);

export function loadCatalogue(raw: unknown = rawCatalogue): readonly CatalogueEntry[] {
  return parseCatalogue(raw);
}

export function getCatalogueEntry(entryId: string): CatalogueEntry {
  const entry = catalogue.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) {
    throw new CatalogueProgrammingError("unknown_entry_id", `Unknown catalogue entryId '${entryId}'`);
  }
  return entry;
}

type CatalogueParameter = CatalogueEntry["pathParams"][number] | CatalogueEntry["queryParams"][number];

function boundedNumberSchema(parameter: CatalogueParameter, integer: boolean): ZodTypeAny {
  let schema = integer ? z.number().int() : z.number();
  if (parameter.minimum !== undefined) {
    schema = schema.min(parameter.minimum);
  }
  if (parameter.maximum !== undefined) {
    schema = schema.max(parameter.maximum);
  }
  return schema;
}

function schemaForParameter(parameter: CatalogueParameter): ZodTypeAny {
  switch (parameter.type) {
    case "integer":
      return boundedNumberSchema(parameter, true);
    case "number":
      return boundedNumberSchema(parameter, false);
    case "boolean":
      return z.boolean();
    case "string":
      return z.string().min(1, "must not be empty").refine((value) => value.trim().length > 0, "must not be empty");
  }
}

export function bindableQueryParameters(entry: CatalogueEntry): CatalogueEntry["queryParams"] {
  return [
    ...entry.queryParams,
    ...(entry.observedQueryParams ?? []).filter((parameter) => !parameter.inertUpstream).map((parameter) => ({
      ...parameter, declaredRequired: false, measuredRequired: null,
    })),
  ];
}

export function inputSchemaForCatalogueEntry(entry: CatalogueEntry, variantKey?: string) {
  resolveContract(entry, variantKey);
  const shape: Record<string, ZodTypeAny> = {};
  for (const parameter of entry.pathParams) {
    shape[parameter.name] = schemaForParameter(parameter);
  }
  for (const parameter of bindableQueryParameters(entry)) {
    const parameterSchema = schemaForParameter(parameter);
    const required = parameter.measuredRequired ?? parameter.declaredRequired;
    shape[parameter.name] = required ? parameterSchema : parameterSchema.optional();
  }
  return z.object(shape).strict();
}

export function inputSchemaFor(entryId: string, variantKey?: string) {
  return inputSchemaForCatalogueEntry(getCatalogueEntry(entryId), variantKey);
}

function resolveContract(entry: CatalogueEntry, variantKey: string | undefined): { variantKey: string; contract: ResultContract } {
  if (variantKey === undefined || variantKey === "default") {
    return { variantKey: "default", contract: entry.resultContract };
  }
  const variant = entry.variants?.find((candidate) => candidate.variantKey === variantKey);
  if (variant === undefined) {
    throw new CatalogueProgrammingError("unknown_variant", `Entry '${entry.entryId}': unknown variantKey '${variantKey}'`);
  }
  return { variantKey: variant.variantKey, contract: variant.resultContract };
}

function invalidParameters(entryId: string, issue: { path: PropertyKey[]; message: string }): CatalogueProgrammingError {
  const field = issue.path.length === 0 ? "<params>" : issue.path.map(String).join(".");
  return new CatalogueProgrammingError("invalid_parameters", `Entry '${entryId}' parameter '${field}': ${issue.message}`);
}

export type BoundCatalogueRequest = {
  readonly entryId: string;
  readonly variantKey: string;
  readonly host: keyof typeof HOSTS;
  readonly hostname: (typeof HOSTS)[keyof typeof HOSTS];
  readonly endpointTemplate: string;
  readonly path: CataloguePath;
  readonly queryParams: Record<string, string | number | boolean>;
  execute(client: SplinterlandsHttpClient): Promise<HttpResult<unknown>>;
};

export function bindRequest(entryId: string, params: Record<string, unknown>, variantKey?: string): BoundCatalogueRequest {
  const entry = getCatalogueEntry(entryId);
  const selected = resolveContract(entry, variantKey);
  const parsed = inputSchemaForCatalogueEntry(entry, selected.variantKey).safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalidParameters(entryId, issue ?? { path: [], message: "parameters do not match the entry schema" });
  }
  const values = parsed.data as Record<string, string | number | boolean | undefined>;
  const path = entry.pathTemplate.replace(/\{([^{}]+)\}/g, (_placeholder, name: string) => {
    const value = values[name];
    if (value === undefined || (typeof value === "string" && value.trim() === "")) {
      throw invalidParameters(entryId, { path: [name], message: "required path parameter must not be empty" });
    }
    return encodeURIComponent(String(value));
  });
  const queryParams: Record<string, string | number | boolean> = {};
  for (const parameter of bindableQueryParameters(entry)) {
    const value = values[parameter.name];
    if (value !== undefined) {
      queryParams[parameter.name] = value;
    }
  }
  const brandedPath = createCataloguePath(path);
  const hostname = HOSTS[entry.host];
  const validator = predicateFor(selected.contract);
  return {
    entryId,
    variantKey: selected.variantKey,
    host: entry.host,
    hostname,
    endpointTemplate: entry.pathTemplate,
    path: brandedPath,
    queryParams,
    execute: (client) => client.request(hostname, brandedPath, queryParams, {
      authCacheKey: entryId,
      endpointTemplate: entry.pathTemplate,
      validate: validator,
    }),
  };
}

export function allCatalogueEntries(): readonly CatalogueEntry[] {
  return catalogue;
}
