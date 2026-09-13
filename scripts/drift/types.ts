import { z } from "zod";
import { AuthTierSchema, CatalogueHostSchema } from "../../src/catalogue/schema.js";
import type { JsonTypeName, ShapeFingerprint } from "./shape.js";

export const DriftLabelSchema = z.enum([
  "drift:auth",
  "drift:blocked",
  "drift:removed",
  "drift:added",
  "drift:shape",
  "drift:status",
  "drift:response",
  "drift:spec-unreachable",
]);

export const ShapeDeltaSchema = z.object({
  keyPath: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\[\]|\.[A-Za-z0-9_]+)*$/),
  change: z.enum(["added", "removed", "retyped"]),
  baselineTypes: z.array(z.enum(["string", "number", "boolean", "object", "array", "null"])).optional(),
  observedTypes: z.array(z.enum(["string", "number", "boolean", "object", "array", "null"])).optional(),
}).strict();

const CountsSchema = z.object({
  entriesSwept: z.number().int().nonnegative(),
  blockedEndpoints: z.number().int().nonnegative(),
  entriesTotal: z.number().int().nonnegative(),
}).strict();

export const DriftIssueSchema = z.object({
  key: z.string().regex(/^drift\/(?:[a-z][a-z0-9]*(?:\.[a-z0-9_-]+)+|run\/[a-z0-9-]+)$/),
  scope: z.enum(["endpoint", "run"]),
  labels: z.array(DriftLabelSchema).min(1),
  host: CatalogueHostSchema,
  entryId: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9_-]+)+$/).optional(),
  pathTemplate: z.string().startsWith("/").regex(/^[^?#]*$/).optional(),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statusBaseline: z.number().int().optional(),
  statusObserved: z.number().int().optional(),
  authBaseline: AuthTierSchema.optional(),
  authObserved: AuthTierSchema.optional(),
  deltas: z.array(ShapeDeltaSchema),
  counts: CountsSchema.optional(),
}).strict();

export type DriftLabel = z.infer<typeof DriftLabelSchema>;
export type ShapeDelta = z.infer<typeof ShapeDeltaSchema>;
export type DriftIssue = z.infer<typeof DriftIssueSchema>;

export type BaselineEntry = {
  entryId: string;
  host: "api" | "vapi";
  pathTemplate: string;
  authTier: "public" | "requires_auth" | "blocked";
  statusesObserved: number[];
  shape: ShapeFingerprint | null;
  shapeSources: string[];
  truncatedAt: string[];
  capturedAt: string;
};

export type DriftBaseline = {
  entries: BaselineEntry[];
  unbaselined: Array<{ entryId: string; reason: string }>;
  capturedAt: string;
};

export type SweepEntry = {
  entryId: string;
  host: "api" | "vapi";
  pathTemplate: string;
  authBaseline: "public" | "requires_auth" | "blocked";
  variantKey?: string;
};

export type RawOutcome = {
  status: number;
  body: unknown;
  isJson: boolean;
};

export type SweepObservation = {
  entryId: string;
  host: "api" | "vapi";
  pathTemplate: string;
  statusObserved: number;
  authBaseline: "public" | "requires_auth" | "blocked";
  authObserved: "public" | "requires_auth" | "blocked";
  shape: ShapeFingerprint | null;
  shapeCompared: boolean;
  reason?: "empty_result" | "non_success";
};

export type RunRecord = {
  observedOn: string;
  status: "completed" | "aborted";
  entriesSwept: number;
  entriesTotal: number;
  blockedEndpoints: number;
  observations: SweepObservation[];
};

export type DriftPlan = {
  issues: DriftIssue[];
  run: RunRecord;
};

export type JsonShapeType = JsonTypeName;
