import { isEmptyResult, classifyResponse } from "../../src/http/errors.js";
import { observeShape } from "./shape.js";
import type { RawOutcome, RunRecord, SweepEntry, SweepObservation } from "./types.js";

const hostnames = {
  api: "api.splinterlands.com",
  vapi: "vapi.splinterlands.com",
} as const;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function authTier(kind: string): "public" | "requires_auth" | "blocked" {
  if (kind === "endpoint_requires_auth") {
    return "requires_auth";
  }
  if (kind === "upstream_blocked") {
    return "blocked";
  }
  return "public";
}

export async function sweep(
  entries: readonly SweepEntry[],
  request: (entry: SweepEntry) => Promise<RawOutcome>,
  options: { observedOn?: string; now?: Date } = {},
): Promise<RunRecord> {
  const observations: SweepObservation[] = [];
  const blocked = new Set<string>();
  const observedOn = options.observedOn ?? dateOnly(options.now ?? new Date());

  for (const entry of entries) {
    const outcome = await request(entry);
    const classified = classifyResponse({
      host: hostnames[entry.host],
      endpoint: entry.pathTemplate,
      status: outcome.status,
      body: outcome.body,
      isJson: outcome.isJson,
    });
    const kind = classified.ok ? "success" : classified.kind;
    const statusIsSuccess = classified.ok && outcome.isJson
      && (!isEmptyResult(outcome.body) || !entry.validateEmpty || entry.validateEmpty(outcome.body));
    const empty = statusIsSuccess && isEmptyResult(outcome.body);
    const observation: SweepObservation = {
      entryId: entry.entryId,
      host: entry.host,
      pathTemplate: entry.pathTemplate,
      statusObserved: outcome.status,
      authBaseline: entry.authBaseline,
      authObserved: authTier(kind),
      shape: statusIsSuccess && !empty ? observeShape(outcome.body) : null,
      shapeCompared: statusIsSuccess && !empty,
      ...(empty ? { reason: "empty_result" as const } : statusIsSuccess ? {} : { reason: "non_success" as const }),
    };
    observations.push(observation);
    if (outcome.status === 403) {
      blocked.add(`${entry.host}:${entry.entryId}`);
      if (blocked.size >= 2) {
        return {
          observedOn,
          status: "aborted",
          entriesSwept: observations.length,
          entriesTotal: entries.length,
          blockedEndpoints: blocked.size,
          observations,
        };
      }
    }
  }

  return {
    observedOn,
    status: "completed",
    entriesSwept: observations.length,
    entriesTotal: entries.length,
    blockedEndpoints: blocked.size,
    observations,
  };
}
