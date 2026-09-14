import { parseCardsCollection, COLLECTION_TIMEOUT_MS } from "../../src/cards-collection.js";
import { avatarRedirectData, isAvatarRequest } from "../../src/http/avatar-redirect.js";
import { z } from "zod";
import { bindRequest, type BoundCatalogueRequest } from "../../src/catalogue/index.js";
import { HostRateLimiter } from "../../src/http/ratelimit.js";
import { TOOL_ENTRY_IDS } from "../../src/server.js";
import { accountParameterNames } from "./configuration.js";
import type { RawOutcome } from "./types.js";

const inputSchema = z.array(z.object({
  entryId: z.string().min(1),
  params: z.record(z.union([z.string().max(1000), z.number().finite(), z.boolean()])),
  variantKey: z.string().optional(),
  expectEmpty: z.boolean().optional(),
}).strict()).min(1).max(200);
const callable = new Set<string>(Object.values(TOOL_ENTRY_IDS));
export const SWEEP_RESPONSE_CAP = 2 * 1024 * 1024;

function hasResourceScope(entryId: string, params: Record<string, unknown>): boolean {
  const present = (key: string) => typeof params[key] === "string" && String(params[key]).trim().length > 0;
  if (entryId === "vapi.delegation-rental.v3.bids" || entryId === "vapi.delegation-rental.v3.offers") {
    return typeof params.limit === "number" && Number.isInteger(params.limit) && params.limit >= 1 && params.limit <= 100;
  }
  if (entryId === "api.guilds.list") return present("name");
  if (entryId === "api.guilds.find" || entryId === "api.tournaments.find") return present("id");
  if (entryId === "api.tournaments.find-brawl") return present("id") && present("guild_id");
  if (entryId === "api.tournaments.battles") return present("id") && present("round") && present("swiss_group");
  return false;
}

export function bindSweepInputs(value: unknown): BoundCatalogueRequest[] {
  const rows = inputSchema.parse(value);
  if (new Set(rows.map(row => row.entryId)).size !== rows.length) throw new Error("Duplicate sweep endpoint.");
  return rows.map(row => {
    if (!callable.has(row.entryId)) throw new Error("Sweep endpoint is not callable.");
    const accountFields = accountParameterNames(row.entryId);
    if (accountFields.size > 0 && !hasResourceScope(row.entryId, row.params) && ![...accountFields].some(name => typeof row.params[name] === "string" && String(row.params[name]).trim().length > 0)) {
      throw new Error("Account-aware sweep endpoints require explicit account scope.");
    }
    return bindRequest(row.entryId, row.params, row.variantKey);
  });
}

export function createSweepRequester(fetcher: typeof fetch = fetch, limiter = new HostRateLimiter()) {
  return async (bound: BoundCatalogueRequest): Promise<RawOutcome> => {
    await limiter.acquire(bound.hostname);
    const url = new URL(bound.path.value, "https://" + bound.hostname);
    for (const [key, value] of Object.entries(bound.queryParams)) url.searchParams.set(key, String(value));
    try {
      const response = await fetcher(url, { method: "GET", redirect: isAvatarRequest(bound.hostname, url.pathname) ? "manual" : "error", signal: AbortSignal.timeout(bound.entryId === "api.cards.collection" ? COLLECTION_TIMEOUT_MS : 20_000) });
      if (bound.entryId === "api.cards.collection" && response.ok) {
        try {
          const sample = await parseCardsCollection(response, { limit: 3 });
          return { status: response.status, body: { player: sample.player, cards: sample.cards }, isJson: true };
        } catch {
          return { status: response.status, body: null, isJson: false };
        }
      }
      if (!response.body) return { status: response.status, body: null, isJson: false };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > SWEEP_RESPONSE_CAP) {
            await reader.cancel();
            return { status: response.status, body: null, isJson: false };
          }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      if (isAvatarRequest(bound.hostname, url.pathname)) {
        const body = avatarRedirectData(response, url);
        // Drift compares the same JSON projection that the MCP exposes; redirect_status preserves HTTP 302.
        if (body) return { status: 200, body, isJson: true };
      }
      try {
        return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown, isJson: true };
      } catch {
        return { status: response.status, body: null, isJson: false };
      }
    } catch {
      return { status: 0, body: null, isJson: false };
    }
  };
}
