import { AsyncLocalStorage } from "node:async_hooks";
import { freshness, newTraceId, type UpstreamOutcome } from "./errors.js";

type CallState = {
  tool: string;
  maxRequests: 1 | 2 | 3 | 10;
  urls: Set<string>;
};

const storage = new AsyncLocalStorage<CallState>();

export class RefusalWouldFanOutError extends Error implements UpstreamOutcome {
  readonly ok = false as const;
  readonly kind = "refusal_would_fan_out" as const;
  readonly endpoint: string;
  readonly traceId: string;
  readonly freshness = freshness(Date.now());
  readonly status = 400;

  constructor(tool: string, count: number, alternativeTool = "the relevant search tool", endpoint = "call scope", maxRequests = 1) {
    super(`refusal_would_fan_out: ${tool} attempted ${count} distinct upstream requests in one call. This call permits at most ${maxRequests} distinct requests. Use ${alternativeTool} for the broader question in one request, then call ${tool} for the specific item.`);
    this.name = "RefusalWouldFanOutError";
    this.endpoint = endpoint;
    this.traceId = newTraceId();
  }
}

export async function withCallScope<Value>(tool: string, operation: () => Promise<Value>, maxRequests: 1 | 2 | 3 | 10 = 1): Promise<Value> {
  if (storage.getStore()) return operation();
  return storage.run({ tool, maxRequests, urls: new Set<string>() }, operation);
}

export function registerLogicalRequest(
  url: string,
  options: { alternativeTool?: string } = {},
): void {
  const state = storage.getStore();
  if (state === undefined) {
    return;
  }
  if (state.urls.has(url)) {
    return;
  }
  const nextCount = state.urls.size + 1;
  if (nextCount > state.maxRequests) {
    throw new RefusalWouldFanOutError(state.tool, nextCount, options.alternativeTool, "call scope", state.maxRequests);
  }
  state.urls.add(url);
}

export function currentCallRequestCount(): number {
  return storage.getStore()?.urls.size ?? 0;
}
