import { createHash } from "node:crypto";
import type { DriftIssue } from "./types.js";

export const SPEC_SHRINK_FLOOR = 0.5;

type Promisable<Value> = Value | PromiseLike<Value>;

export type SpecFetch =
  | { ok: true; url: string; body: string }
  | { ok: false; url: string; reason: "network" | "http_status" | "not_found" | "unparseable"; status?: number };

export type ParsedSpec = { paths: Record<string, unknown>; components?: unknown; definitions?: unknown; shared?: unknown };

export type SpecDelta = {
  added: string[];
  removed: string[];
  changed: string[];
  pathCount: number;
  baselinePathCount: number;
};

export type SpecDiffPlan =
  | { kind: "unreachable"; issues: [DriftIssue]; catalogueDelta: null }
  | { kind: "compared"; issues: DriftIssue[]; catalogueDelta: SpecDelta };

export type SpecFetcher = () => Promisable<SpecFetch>;

export type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  url?: string;
  sleep?: (delayMs: number) => Promisable<void>;
};

export function parseSpec(body: string): ParsedSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const paths = (parsed as Record<string, unknown>).paths;
  if (typeof paths !== "object" || paths === null || Array.isArray(paths)) {
    return null;
  }
  const document = parsed as Record<string, unknown>;
  return { paths: paths as Record<string, unknown>, components: document.components ?? {}, definitions: document.definitions ?? {},
    shared: document.shared ?? Object.fromEntries(["security", "securityDefinitions", "parameters", "responses", "host", "basePath", "servers", "consumes", "produces"].filter(key => Object.hasOwn(document, key)).map(key => [key, document[key]])) };
}

function hostForUrl(url: string): "api" | "vapi" {
  try {
    return new URL(url).hostname.startsWith("vapi.") ? "vapi" : "api";
  } catch {
    return url.includes("vapi") ? "vapi" : "api";
  }
}

function observedOn(): string {
  return new Date().toISOString().slice(0, 10);
}

function unreachableIssue(fetched: SpecFetch, status?: number): DriftIssue {
  const issue: DriftIssue = {
    key: "drift/run/spec-unreachable",
    scope: "run",
    labels: ["drift:spec-unreachable"],
    host: hostForUrl(fetched.url),
    observedOn: observedOn(),
    deltas: [],
  };
  if (status !== undefined) issue.statusObserved = status;
  return issue;
}

function unreachable(fetched: SpecFetch, status?: number): SpecDiffPlan {
  return {
    kind: "unreachable",
    issues: [unreachableIssue(fetched, status)],
    catalogueDelta: null,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

export function planSpecDiff(fetched: SpecFetch, baseline: number | ParsedSpec): SpecDiffPlan {
  const baselinePathCount = typeof baseline === "number" ? baseline : Object.keys(baseline.paths).length;
  if (!fetched.ok) {
    return unreachable(fetched, fetched.status);
  }

  const parsed = parseSpec(fetched.body);
  if (parsed === null) {
    return unreachable(fetched);
  }

  const pathNames = Object.keys(parsed.paths).sort((left, right) => left.localeCompare(right));
  if (pathNames.length === 0 || pathNames.length < baselinePathCount * SPEC_SHRINK_FLOOR) {
    return unreachable({ ok: true, url: fetched.url, body: fetched.body });
  }

  return {
    kind: "compared",
    issues: [],
    catalogueDelta: {
      added: typeof baseline === "number" ? [] : pathNames.filter(path => !Object.hasOwn(baseline.paths, path)),
      removed: typeof baseline === "number" ? [] : Object.keys(baseline.paths).filter(path => !Object.hasOwn(parsed.paths, path)).sort(),
      changed: typeof baseline === "number" ? [] : pathNames.filter(path => Object.hasOwn(baseline.paths, path)
        && (canonical(parsed.paths[path]) !== canonical(baseline.paths[path])
          || canonical(parsed.components ?? {}) !== canonical(baseline.components ?? {})
          || canonical(parsed.definitions ?? {}) !== canonical(baseline.definitions ?? {})
          || canonical(parsed.shared ?? {}) !== canonical(baseline.shared ?? {}))),
      pathCount: pathNames.length,
      baselinePathCount,
    },
  };
}

export async function fetchSpecWithRetry(fetcher: SpecFetcher, options: RetryOptions = {}): Promise<SpecFetch> {
  const attempts = Math.max(1, Math.trunc(options.attempts ?? 2));
  const delayMs = options.delayMs ?? 5_000;
  const sleep = options.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)));
  let lastNetworkFailure: SpecFetch = { ok: false, url: options.url ?? "", reason: "network" };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await fetcher();
      if (result.ok || result.reason !== "network" || attempt === attempts - 1) {
        return result;
      }
      lastNetworkFailure = result;
    } catch {
      if (attempt === attempts - 1) {
        return lastNetworkFailure;
      }
    }
    await sleep(delayMs);
  }
  return lastNetworkFailure;
}

export function specDiffExitCode(plan: SpecDiffPlan): 0 | 1 {
  if (plan.kind === "unreachable") return 0;
  return plan.catalogueDelta.added.length > 0
    || plan.catalogueDelta.removed.length > 0
    || plan.catalogueDelta.changed.length > 0
    ? 1
    : 0;
}

export const fetchSpec = fetchSpecWithRetry;
export const exitCodeForSpecDiff = specDiffExitCode;

export function fingerprintSpec(spec: ParsedSpec): ParsedSpec {
  const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
  return { paths: Object.fromEntries(Object.entries(spec.paths).map(([path, value]) => [path, hash(value)])),
    components: hash(spec.components ?? {}), definitions: hash(spec.definitions ?? {}), shared: hash(spec.shared ?? {}) };
}
