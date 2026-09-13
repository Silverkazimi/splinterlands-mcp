import type { DriftIssue } from "./types.js";

export type RenderedIssue = { title: string; body: string; labels: DriftIssue["labels"] };

function changeText(issue: DriftIssue): string {
  if (issue.labels.includes("drift:auth")) return "Access changed for this endpoint.";
  if (issue.labels.includes("drift:blocked")) return "The runner was blocked by the upstream service.";
  if (issue.labels.includes("drift:spec-unreachable")) return "The public API specification could not be reached or parsed.";
  if (issue.labels.includes("drift:status")) return "The observed HTTP status differs from the recorded baseline.";
  if (issue.labels.includes("drift:response")) return "The endpoint did not return a usable JSON response within the read limits.";
  return "The observed response shape differs from the recorded baseline.";
}

export function renderIssue(issue: DriftIssue): RenderedIssue {
  const title = issue.scope === "run"
    ? `Drift run: ${issue.labels.join(", ")}`
    : `Drift: ${issue.entryId ?? "endpoint"}`;
  const lines = [
    `<!-- drift-key: ${issue.key} -->`,
    changeText(issue),
    `Observed on: ${issue.observedOn}`,
    ...(issue.entryId === undefined ? [] : [`Entry: ${issue.entryId}`]),
    ...(issue.pathTemplate === undefined ? [] : [`Path template: ${issue.pathTemplate}`]),
    ...(issue.statusBaseline === undefined ? [] : [`Baseline status: ${issue.statusBaseline}`]),
    ...(issue.statusObserved === undefined ? [] : [`Observed status: ${issue.statusObserved}`]),
    ...(issue.authBaseline === undefined ? [] : [`Baseline auth tier: ${issue.authBaseline}`]),
    ...(issue.authObserved === undefined ? [] : [`Observed auth tier: ${issue.authObserved}`]),
    ...issue.deltas.map((delta) => `${delta.change}: ${delta.keyPath}${delta.baselineTypes === undefined ? "" : ` (${delta.baselineTypes.join("|")} → ${delta.observedTypes?.join("|") ?? "∅"})`}`),
    ...(issue.counts === undefined ? [] : [
      `Entries swept: ${issue.counts.entriesSwept}`,
      `Blocked endpoints: ${issue.counts.blockedEndpoints}`,
      `Entries total: ${issue.counts.entriesTotal}`,
      "No endpoint issue was opened for this run.",
    ]),
    ...(issue.labels.includes("drift:spec-unreachable") ? ["Specification: https://vapi.splinterlands.com/swagger.json"] : []),
  ];
  return { title, body: lines.join("\n"), labels: issue.labels };
}
