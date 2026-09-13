import { z } from "zod";

export const CatalogueHostSchema = z.enum(["api", "vapi"]);
export const HttpMethodSchema = z.literal("GET");
export const AuthTierSchema = z.enum(["public", "requires_auth", "blocked"]);
export const PaginationSchema = z.enum(["none", "limit-offset", "limit-only", "page-size", "client-side"]);
export const ParameterTypeSchema = z.enum(["string", "integer", "number", "boolean"]);
export const JsonTypeSchema = z.enum(["string", "number", "boolean", "object", "array", "null"]);
export const ValueClassSchema = z.enum([
  "name",
  "enum",
  "id",
  "numeric",
  "timestamp",
  "freetext",
  "opaque",
]);

const ParameterNameSchema = z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_]*$/);

const ParameterBounds = {
  minimum: z.number().optional(),
  maximum: z.number().optional(),
};

function validateParameterBounds(
  parameter: { type: string; minimum?: number | undefined; maximum?: number | undefined },
  context: z.RefinementCtx,
): void {
  if ((parameter.minimum !== undefined || parameter.maximum !== undefined)
    && parameter.type !== "integer"
    && parameter.type !== "number") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minimum and maximum are only valid for integer or number parameters",
    });
  }
  if (parameter.minimum !== undefined
    && parameter.maximum !== undefined
    && parameter.minimum > parameter.maximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "minimum must not exceed maximum" });
  }
}

export const PathParameterSchema = z.object({
  name: ParameterNameSchema,
  type: ParameterTypeSchema,
  required: z.boolean(),
  isPlayerName: z.boolean(),
  ...ParameterBounds,
}).superRefine(validateParameterBounds);

export const QueryParameterSchema = z.object({
  name: ParameterNameSchema,
  type: ParameterTypeSchema,
  declaredRequired: z.boolean(),
  measuredRequired: z.boolean().nullable(),
  inertUpstream: z.boolean(),
  ...ParameterBounds,
}).superRefine(validateParameterBounds);

export const ObservedQueryParameterSchema = z.object({
  name: ParameterNameSchema,
  type: ParameterTypeSchema,
  inertUpstream: z.boolean(),
  ...ParameterBounds,
}).strict().superRefine(validateParameterBounds);

export const FingerprintFieldSchema = z.object({
  type: JsonTypeSchema,
  valueClass: ValueClassSchema,
  nullable: z.boolean().optional(),
}).superRefine((field, context) => {
  if (field.type === "null") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "type null declarations are not permitted" });
  }
});

export const FingerprintSchema = z.record(FingerprintFieldSchema).superRefine((fingerprint, context) => {
  for (const keyPath of Object.keys(fingerprint)) {
    if (keyPath.trim() === "") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "key path must not be empty", path: [keyPath] });
    }
  }
});

export const ResultContractSchema = z.object({
  envelope: z.enum(["vapi", "bare", "array"]),
  fingerprint: FingerprintSchema,
  observedKeyPaths: z.array(z.string().min(1)).optional(),
  requiredKeyPaths: z.array(z.string().min(1)),
  predicateId: z.string().min(1).optional(),
}).superRefine((contract, context) => {
  const observed = contract.observedKeyPaths ?? [];
  if (new Set(observed).size !== observed.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "observedKeyPaths must not contain duplicates", path: ["observedKeyPaths"] });
  }
  for (const keyPath of Object.keys(contract.fingerprint)) {
    if (observed.length > 0 && !observed.includes(keyPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "fingerprint paths must be observed", path: ["fingerprint", keyPath] });
    }
  }
});

export const RequestVariantSchema = z.object({
  variantKey: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  resultContract: ResultContractSchema,
});

const ProvenanceFields = {
  sourceUrl: z.string().url().nullable(),
  specHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  specFetchedAt: z.string().datetime({ offset: true }).nullable(),
};

const SpecProvenanceSchema = z.object({
  source: z.literal("spec"),
  ...ProvenanceFields,
  sourceUrl: z.string().url(),
  specFetchedAt: z.string().datetime({ offset: true }),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const BriefProvenanceSchema = z.object({
  source: z.literal("repository-brief"),
  ...ProvenanceFields,
  recordedAt: z.string().datetime({ offset: true }),
  sourceDescription: z.string().min(1),
});

const LiveProvenanceSchema = z.object({
  source: z.literal("live-observation"),
  ...ProvenanceFields,
  observedAt: z.string().datetime({ offset: true }),
});

export const ProvenanceSchema = z.discriminatedUnion("source", [
  SpecProvenanceSchema,
  BriefProvenanceSchema,
  LiveProvenanceSchema,
]);

export const DeclaredEvidenceSchema = z.object({
  authTier: AuthTierSchema.nullable(),
  pagination: PaginationSchema.nullable(),
});

export const MeasuredEvidenceSchema = z.object({
  authTier: AuthTierSchema.nullable(),
  pagination: PaginationSchema.nullable(),
  observedAt: z.string().datetime({ offset: true }),
});

export const CatalogueEntrySchema = z.object({
  entryId: z.string().min(1).regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9_-]+)+$/),
  host: CatalogueHostSchema,
  method: HttpMethodSchema,
  pathTemplate: z.string().min(1).startsWith("/").refine((value) => !value.includes("?") && !value.includes("#") && !value.includes(".."), {
    message: "pathTemplate must not contain a query, fragment, or parent traversal",
  }),
  pathParams: z.array(PathParameterSchema),
  queryParams: z.array(QueryParameterSchema),
  observedQueryParams: z.array(ObservedQueryParameterSchema).optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  declared: DeclaredEvidenceSchema,
  measured: MeasuredEvidenceSchema.nullable(),
  resultContract: ResultContractSchema,
  variants: z.array(RequestVariantSchema).optional(),
  owningTool: z.string().min(1).nullable(),
  notes: z.string().optional(),
  provenance: ProvenanceSchema.nullable(),
}).strict().superRefine((entry, context) => {
  const placeholders = [...entry.pathTemplate.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  const declared = entry.pathParams.map((parameter) => parameter.name);
  if (new Set(placeholders).size !== placeholders.length || placeholders.some((name) => name === undefined || !declared.includes(name))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "pathTemplate placeholders must match pathParams exactly", path: ["pathParams"] });
  }
  if (declared.some((name) => !placeholders.includes(name))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "pathParams must all appear in pathTemplate", path: ["pathParams"] });
  }
  const parameterNames = [...entry.pathParams, ...entry.queryParams].map((parameter) => parameter.name);
  if (new Set(parameterNames).size !== parameterNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "parameter names must be unique across path and query parameters", path: ["pathParams"] });
  }
  if (entry.queryParams.some((parameter) => parameter.measuredRequired !== null) && entry.measured === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "measured query parameters require measured evidence",
      path: ["queryParams"],
    });
  }
  const declaredParameterNames = new Set([...entry.pathParams, ...entry.queryParams].map((parameter) => parameter.name));
  if ((entry.observedQueryParams ?? []).some((parameter) => declaredParameterNames.has(parameter.name))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "observed query parameters must not be declared parameters",
      path: ["observedQueryParams"],
    });
  }
  const variants = entry.variants ?? [];
  const variantKeys = variants.map((variant) => variant.variantKey);
  if (new Set(variantKeys).size !== variantKeys.length || variantKeys.includes("default")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "variant keys must be unique and must not use default", path: ["variants"] });
  }
});

export const CatalogueDocumentSchema = z.array(CatalogueEntrySchema);

export type CatalogueHost = z.infer<typeof CatalogueHostSchema>;
export type AuthTier = z.infer<typeof AuthTierSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type ParameterType = z.infer<typeof ParameterTypeSchema>;
export type ObservedQueryParameter = z.infer<typeof ObservedQueryParameterSchema>;
export type Fingerprint = z.infer<typeof FingerprintSchema>;
export type ResultContract = z.infer<typeof ResultContractSchema>;
export type RequestVariant = z.infer<typeof RequestVariantSchema>;
export type CatalogueEntry = z.infer<typeof CatalogueEntrySchema>;
