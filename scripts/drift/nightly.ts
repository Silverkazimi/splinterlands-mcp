import { sampleIsEmpty, verifiedSample, isTransientQueue } from "./sample-state.js";
import { accountParameterNames } from "./configuration.js";
import { getCatalogueEntry } from "../../src/catalogue/index.js";
import { TOOL_ENTRY_IDS } from "../../src/server.js";
import { bindSweepInputs, createSweepRequester } from "./request.js";
import { sweep } from "./sweep.js";
import { planDriftIssues } from "./plan.js";
import type { DriftBaseline, RawOutcome } from "./types.js";
import type { BoundCatalogueRequest } from "../../src/catalogue/index.js";

export async function runNightly(
  inputs: unknown,
  baseline: DriftBaseline,
  request: (bound: BoundCatalogueRequest) => Promise<RawOutcome> = createSweepRequester(),
) {
  const bound = bindSweepInputs(inputs);
  const expectedEmpty = new Set((inputs as Array<{ entryId: string; expectEmpty?: boolean }>).filter(row => row.expectEmpty).map(row => row.entryId));
  const requests = new Map(bound.map(item => [item.entryId, item]));
  const expected = [...new Set<string>(Object.values(TOOL_ENTRY_IDS))].sort();
  const baselined = new Set(baseline.entries.map(entry => entry.entryId));
  const run = await sweep(bound.map(item => ({
    entryId: item.entryId, host: item.host, pathTemplate: item.endpointTemplate,
    authBaseline: baseline.entries.find(entry => entry.entryId === item.entryId)?.authTier
      ?? getCatalogueEntry(item.entryId).measured?.authTier
      ?? getCatalogueEntry(item.entryId).declared.authTier ?? "public",
    variantKey: item.variantKey,
    isEmpty: (body: unknown) => sampleIsEmpty(item.entryId, body, item.variantKey),
    validateResponse: (body: unknown) => verifiedSample(item.entryId, body, item.variantKey),
  })), entry => request(requests.get(entry.entryId)!));
  const plan = planDriftIssues(baseline, run);
  const observed = new Set(run.observations.map(item => item.entryId));
  const coverage = {
    transientSamples: run.observations.filter(item => isTransientQueue(item.entryId) && item.reason === "empty_result")
      .map(item => ({ entryId: item.entryId, reason: "idle_queue" as const })),
    sampleCoverage: run.observations.filter(item => accountParameterNames(item.entryId).size > 0
      && ((item.reason === "empty_result" && !expectedEmpty.has(item.entryId) && !isTransientQueue(item.entryId))
        || (item.shapeCompared && expectedEmpty.has(item.entryId))))
      .map(item => ({ entryId: item.entryId, reason: item.reason === "empty_result" ? "empty_sample" : "populated_sample" })),
    callable: expected.length,
    configured: bound.length,
    swept: run.entriesSwept,
    unconfigured: expected.filter(id => !requests.has(id)),
    unswept: bound.filter(item => !observed.has(item.entryId)).map(item => item.entryId),
    unbaselined: bound.filter(item => !baselined.has(item.entryId)).map(item => item.entryId),
  };
  return {
    plan,
    coverage,
    complete: run.status === "completed" && coverage.unconfigured.length === 0
      && coverage.unbaselined.length === 0 && coverage.sampleCoverage.length === 0,
  };
}

/** Public reports omit response keys as well as values: map keys may be account identifiers. */
export function summarizeNightly(result: Awaited<ReturnType<typeof runNightly>>) {
  return {
    status: result.plan.run.status,
    complete: result.complete,
    coverage: result.coverage,
    issues: result.plan.issues.map(issue => ({
      entryId: issue.entryId, labels: issue.labels,
      statusObserved: issue.statusObserved,
      changes: {
        added: issue.deltas.filter(delta => delta.change === "added").length,
        removed: issue.deltas.filter(delta => delta.change === "removed").length,
        retyped: issue.deltas.filter(delta => delta.change === "retyped").length,
      },
    })),
  };
}
