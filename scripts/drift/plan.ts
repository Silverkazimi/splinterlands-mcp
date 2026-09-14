import { diffShapes } from "./shape.js";
import type { BaselineEntry, DriftBaseline, DriftIssue, DriftLabel, DriftPlan, RunRecord, SweepObservation } from "./types.js";

function baselineByEntry(baseline: DriftBaseline): Map<string, BaselineEntry> {
  return new Map(baseline.entries.map((entry) => [entry.entryId, entry]));
}

function labelsForDeltas(deltas: ReturnType<typeof diffShapes>): DriftLabel[] {
  const labels = new Set<DriftLabel>();
  for (const delta of deltas) {
    if (delta.change === "added") labels.add("drift:added");
    if (delta.change === "removed") labels.add("drift:removed");
    if (delta.change === "retyped") labels.add("drift:shape");
  }
  return [...labels].sort((left, right) => left.localeCompare(right));
}

function endpointIssue(observation: SweepObservation, baseline: BaselineEntry, deltas: ReturnType<typeof diffShapes>, extraLabels: DriftLabel[] = []): DriftIssue | null {
  const labels = new Set<DriftLabel>([...extraLabels, ...labelsForDeltas(deltas)]);
  if (labels.size === 0) return null;
  const sortedLabels = [...labels].sort((left, right) => left.localeCompare(right));
  return {
    key: `drift/${observation.entryId}`,
    scope: "endpoint",
    labels: sortedLabels,
    host: observation.host,
    entryId: observation.entryId,
    pathTemplate: observation.pathTemplate,
    observedOn: "",
    ...(baseline.statusesObserved[0] === undefined ? {} : { statusBaseline: baseline.statusesObserved[0] }),
    statusObserved: observation.statusObserved,
    authBaseline: observation.authBaseline,
    authObserved: observation.authObserved,
    deltas,
  };
}

export function planDriftIssues(baseline: DriftBaseline, run: RunRecord): DriftPlan {
  if (run.status === "aborted") {
    return {
      run,
      issues: [{
        key: "drift/run/blocked",
        scope: "run",
        labels: ["drift:blocked"],
        host: "api",
        observedOn: run.observedOn,
        deltas: [],
        counts: {
          entriesSwept: run.entriesSwept,
          blockedEndpoints: run.blockedEndpoints,
          entriesTotal: run.entriesTotal,
        },
      }],
    };
  }

  const byEntry = baselineByEntry(baseline);
  const blockedObservations = run.observations.filter((observation) => observation.statusObserved === 403);
  const endpointIssues: DriftIssue[] = [];
  for (const observation of run.observations) {
    const entry = byEntry.get(observation.entryId);
    if (entry === undefined) continue;
    const authChanged = observation.statusObserved === 401 && observation.authBaseline === "public";
    const blocked = observation.statusObserved === 403;
    const reviewed = observation.validatedShapeId !== undefined && entry.reviewedShapes?.some(
      review => review.variantKey === (observation.variantKey ?? "default")
        && review.shapeIds.includes(observation.validatedShapeId!),
    );
    const deltas = !reviewed && entry.shape !== null && observation.shape !== null && observation.shapeCompared
      ? diffShapes(entry.shape, observation.shape)
      : [];
    const issue = endpointIssue(observation, entry, deltas, authChanged ? ["drift:auth"] : blocked ? ["drift:blocked"] : !entry.statusesObserved.includes(observation.statusObserved) ? ["drift:status"] : observation.reason === "non_success" ? ["drift:response"] : []);
    if (issue !== null) {
      endpointIssues.push({ ...issue, observedOn: run.observedOn });
    }
  }
  if (blockedObservations.length >= 2) {
    return {
      run,
      issues: [{
        key: "drift/run/blocked",
        scope: "run",
        labels: ["drift:blocked"],
        host: blockedObservations[0]?.host ?? "api",
        observedOn: run.observedOn,
        deltas: [],
        counts: {
          entriesSwept: run.entriesSwept,
          blockedEndpoints: run.blockedEndpoints,
          entriesTotal: run.entriesTotal,
        },
      }],
    };
  }
  endpointIssues.sort((left, right) => {
    const leftAuth = left.labels.includes("drift:auth") ? 0 : 1;
    const rightAuth = right.labels.includes("drift:auth") ? 0 : 1;
    return leftAuth - rightAuth || (left.entryId ?? "").localeCompare(right.entryId ?? "");
  });
  return { run, issues: endpointIssues };
}
