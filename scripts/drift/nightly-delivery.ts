import { createHash } from "node:crypto";
import { publishMaintenanceIssue, runGithub, type GithubCommand } from "./github.js";
import { summarizeNightly, type runNightly } from "./nightly.js";
import type { DriftBaseline } from "./types.js";

export function publishNightly(result: Awaited<ReturnType<typeof runNightly>>, baseline: DriftBaseline,
  repository: string, run: GithubCommand = runGithub) {
  const summary = summarizeNightly(result);
  for (const issue of result.plan.issues) {
    const known = new Set(Object.keys(baseline.entries.find(entry => entry.entryId === issue.entryId)?.shape?.fields ?? {}));
    const fields = issue.deltas.filter(delta => known.has(delta.keyPath));
    const body = JSON.stringify({
      observedOn: issue.observedOn, entryId: issue.entryId, labels: issue.labels,
      statusBaseline: issue.statusBaseline, statusObserved: issue.statusObserved,
      authBaseline: issue.authBaseline, authObserved: issue.authObserved,
      fields, unreviewedFields: issue.deltas.length - fields.length,
      counts: issue.counts,
      note: "Unreviewed field names are withheld because response map keys can contain account identifiers.",
    }, null, 2);
    const key = issue.scope === "run" ? "nightly-blocked"
      : "endpoint-" + createHash("sha256").update(issue.key).digest("hex").slice(0, 32);
    publishMaintenanceIssue(repository, key, issue.scope === "run" ? "Drift: runner blocked" : "Drift: " + issue.entryId,
      body, run, issue.labels);
  }
  if (!result.complete && !result.plan.run.blockedEndpoints && result.plan.run.status !== "aborted") {
    publishMaintenanceIssue(repository, "nightly-coverage", "Nightly maintenance coverage",
      "Sample coverage gaps are not proof of an API failure or a holdings change. Review sample selection and expected empty states.\n\n" + JSON.stringify(summary.coverage, null, 2), run);
  }
}
