import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { isEmptyResult } from "../../src/http/errors.js";
import type { CatalogueHost } from "../../src/catalogue/schema.js";
import { diffShapes, observeShape, type ShapeDelta } from "./shape.js";
import type { DriftIssue } from "./types.js";

export const RENEWAL_HOLD_FLOOR = 0.2;

export type RenewalOutcome = "refresh" | "noop" | "hold";

export type FixtureRenewalPair = {
  fixturePath: string;
  entryId: string;
  existing: unknown;
  recaptured: unknown;
  host?: CatalogueHost;
  pathTemplate?: string;
  pseudonymise?: (value: unknown) => unknown;
  regenerateValueClasses?: (value: unknown) => unknown;
};

export type FixtureRenewalOptions = {
  pendingRoot?: string;
  observedOn?: string;
  pseudonymise?: (value: unknown, pair: FixtureRenewalPair) => unknown;
  regenerateValueClasses?: (value: unknown, pair: FixtureRenewalPair) => unknown;
  prepare?: (value: unknown, pair: FixtureRenewalPair) => unknown;
};

export type RenewalDecision = {
  fixturePath: string;
  entryId: string;
  outcome: RenewalOutcome;
  pendingPath?: string;
  existing: unknown;
  recaptured: unknown;
  deltas: ShapeDelta[];
};

export type RenewalWrite = { path: string; contents: string };

export type RenewalPlan = {
  outcomes: RenewalOutcome[];
  decisions: RenewalDecision[];
  issues: DriftIssue[];
  writes: RenewalWrite[];
  pendingWrites: RenewalWrite[];
  holdFraction: number;
  blockedByHoldFloor: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fixtureData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "provenance" && key !== "valueClasses"));
}

export function fixtureShapeId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(observeShape(fixtureData(value), 64))).digest("hex");
}

function reviewedAlternate(existing: unknown, recaptured: unknown): boolean {
  if (!isRecord(existing) || !isRecord(existing.provenance)) return false;
  const reviews = existing.provenance.reviewedAlternateShapes;
  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 32) return false;
  const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (!reviews.every(review => isRecord(review) && validId(review.baselineShape) && validId(review.alternateShape))) return false;
  const baselineShape = fixtureShapeId(existing);
  const alternateShape = fixtureShapeId(recaptured);
  return reviews.some(review => review.baselineShape === baselineShape && review.alternateShape === alternateShape);
}

function prepare(value: unknown, pair: FixtureRenewalPair, options: FixtureRenewalOptions): unknown {
  let prepared = value;
  const pseudonymise = pair.pseudonymise ?? (options.pseudonymise === undefined ? undefined : (candidate: unknown) => options.pseudonymise?.(candidate, pair));
  if (pseudonymise !== undefined) prepared = pseudonymise(prepared);
  const regenerate = pair.regenerateValueClasses ?? (options.regenerateValueClasses === undefined ? undefined : (candidate: unknown) => options.regenerateValueClasses?.(candidate, pair));
  if (regenerate !== undefined) {
    const regenerated = regenerate(prepared);
    if (regenerated !== undefined) prepared = regenerated;
  }
  if (options.prepare !== undefined) prepared = options.prepare(prepared, pair);
  return prepared;
}

function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pendingPath(pair: FixtureRenewalPair, options: FixtureRenewalOptions): string {
  return join(options.pendingRoot ?? "tests/fixtures/pending", basename(pair.fixturePath));
}

function issueFor(pair: FixtureRenewalPair, deltas: ShapeDelta[], observedOn: string): DriftIssue {
  const issue: DriftIssue = {
    key: `drift/${pair.entryId}`,
    scope: "endpoint",
    labels: ["drift:shape"],
    host: pair.host ?? "vapi",
    entryId: pair.entryId,
    observedOn,
    deltas,
  };
  if (pair.pathTemplate !== undefined) issue.pathTemplate = pair.pathTemplate;
  return issue;
}

export function planFixtureRenewal(
  pairs: FixtureRenewalPair[],
  options: FixtureRenewalOptions = {},
): RenewalPlan {
  const observedOn = options.observedOn ?? new Date().toISOString().slice(0, 10);
  const decisions: RenewalDecision[] = pairs.map((pair) => {
    const existing = prepare(pair.existing, pair, options);
    const recaptured = prepare(pair.recaptured, pair, options);
    const deltas = diffShapes(observeShape(fixtureData(existing)), observeShape(fixtureData(recaptured)));
    const emptyRegression = isEmptyResult(recaptured) && !isEmptyResult(existing);
    const changedShape = emptyRegression || deltas.length > 0;
    // Reviewed alternate states retain the richer existing fixture instead of replacing it.
    const outcome: RenewalOutcome = changedShape
      ? reviewedAlternate(existing, recaptured) ? "noop" : "hold"
      : JSON.stringify(existing) === JSON.stringify(recaptured) ? "noop" : "refresh";
    const decision: RenewalDecision = {
      fixturePath: pair.fixturePath,
      entryId: pair.entryId,
      outcome,
      existing,
      recaptured,
      deltas,
    };
    if (outcome === "hold") decision.pendingPath = pendingPath(pair, options);
    return decision;
  });

  const holdCount = decisions.filter((decision) => decision.outcome === "hold").length;
  const holdFraction = pairs.length === 0 ? 0 : holdCount / pairs.length;
  const blockedByHoldFloor = holdFraction > RENEWAL_HOLD_FLOOR;
  const writes = blockedByHoldFloor
    ? []
    : decisions.filter((decision) => decision.outcome === "refresh").map((decision) => ({ path: decision.fixturePath, contents: serialise(decision.recaptured) }));
  const pendingWrites = decisions.filter((decision) => decision.outcome === "hold" && decision.pendingPath !== undefined).map((decision) => ({ path: decision.pendingPath as string, contents: serialise(decision.recaptured) }));
  let issues: DriftIssue[];
  if (blockedByHoldFloor) {
    issues = [{
      key: "drift/run/fixture-renewal",
      scope: "run",
      labels: ["drift:shape"],
      host: "vapi",
      observedOn,
      deltas: [],
      counts: { entriesSwept: pairs.length, blockedEndpoints: holdCount, entriesTotal: pairs.length },
    }];
  } else {
    issues = decisions.filter((decision) => decision.outcome === "hold").map((decision) => {
      const pair = pairs.find((candidate) => candidate.fixturePath === decision.fixturePath && candidate.entryId === decision.entryId);
      if (pair === undefined) throw new Error(`Missing renewal pair for '${decision.fixturePath}'`);
      return issueFor(pair, decision.deltas, observedOn);
    });
  }
  return {
    outcomes: decisions.map((decision) => decision.outcome),
    decisions,
    issues,
    writes,
    pendingWrites,
    holdFraction,
    blockedByHoldFloor,
  };
}

export type RenewalWriter = (path: string, contents: string) => void | Promise<void>;

export async function executeFixtureRenewal(plan: RenewalPlan, writer: RenewalWriter = async (path, contents) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}): Promise<void> {
  if (plan.blockedByHoldFloor) return;
  for (const write of [...plan.writes, ...plan.pendingWrites]) {
    await writer(write.path, write.contents);
  }
}

export const applyFixtureRenewal = executeFixtureRenewal;
