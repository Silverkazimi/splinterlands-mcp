import { z } from "zod";
import type { HttpResult } from "./http/errors.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bindRequest, inputSchemaFor } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";

export type ReadToolDefinition = {
  toolName: string;
  entryId: string;
  description: string;
  required?: readonly string[];
  fixedStrings?: Readonly<Record<string, string>>;
  listField?: string;
  listEnvelope?: "data";
  cacheTtlMs?: number;
  requiredAny?: readonly string[];
  exclusive?: readonly (readonly string[])[];
  localContinuation?: { parameter: string };
  localSkinFilters?: boolean;
  enrichRows?: (rows: unknown[]) => Promise<unknown[]>;
};

const MAX_ROWS = 100;
const MAX_BYTES = 256 * 1024;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const accountSelectors = new Set(["players", "player", "username", "name", "delegate_to_player", "delegate_to_players", "owner", "renter", "address"]);

export function registerReadTools(server: McpServer, client: SplinterlandsHttpClient, definitions: readonly ReadToolDefinition[], now: () => number = Date.now): void {
  const cache = new Map<string, { result: HttpResult<unknown>; expiresAt: number }>();
  for (const definition of definitions) {
    const base = inputSchemaFor(definition.entryId);
    const literals = Object.fromEntries(Object.entries(definition.fixedStrings ?? {}).map(([key, value]) => {
      if (!(key in base.shape)) throw new Error("Unknown fixed selector " + key);
      return [key, z.literal(value).default(value)];
    }));
    const localShape = {
      ...(definition.localContinuation ? { [definition.localContinuation.parameter]: z.number().int().nonnegative().default(0) } : {}),
      ...(definition.localSkinFilters ? { skin: z.string().min(1).optional(), active: z.boolean().optional() } : {}),
    };
    if (Object.keys(localShape).some((key) => key in base.shape)) throw new Error("Local continuation parameter conflicts with upstream selector");
    const input = base.extend({ ...literals, ...localShape });
    const schema = input.required(Object.fromEntries((definition.required ?? []).map((key) => {
      if (!(key in input.shape)) throw new Error(`Unknown required selector ${key} on ${definition.entryId}`);
      return [key, true as const];
    })));
    const rowLimitDescription = definition.localContinuation
      ? `The ${definition.listField ?? "array response"} is limited to complete rows within 256 KiB. Local filters run before pagination. Use ${definition.localContinuation.parameter} from nextPosition in metadata to continue the same filtered query; each invocation fetches the current inventory.`
      : `${definition.listField ? `The ${definition.listField} list` : "Array responses"} are locally limited to 100 rows and 256 KiB, with truncation reported in text and metadata.`;
    const requestDescription = definition.enrichRows
      ? "Fetches the inventory and looks up public card names through the shared 24-hour definition cache (one additional GET on a cold cache)."
      : definition.cacheTtlMs ? "Uses a bounded success cache keyed by exact supplied query, otherwise makes one logical GET request" : "Makes one logical GET request";
    server.registerTool(definition.toolName, {
      description: `${definition.description} ${requestDescription} Does not auto-fetch continuation pages. Required inputs reflect tool policy as well as measured upstream requirements. Other declared filters are forwarded as supplied; their effectiveness is not implied by the schema. ${rowLimitDescription} Oversized records are refused without partial fields.`,
      inputSchema: schema,
    }, async (params) => {
      const parsed = schema.parse(params);
      const missingScope = definition.requiredAny !== undefined && !definition.requiredAny.some((key) => params[key] !== undefined);
      const conflict = definition.exclusive?.find((group) => group.filter((key) => params[key] !== undefined).length > 1);
      if (missingScope || conflict) return {
        isError: true,
        content: [{ type: "text" as const, text: missingScope
          ? `Supply at least one of: ${definition.requiredAny!.join(", ")}.`
          : `Supply only one of: ${conflict!.join(", ")}.` }],
        structuredContent: { kind: "invalid_input" },
      };

      const continuationPosition = definition.localContinuation
        ? parsed[definition.localContinuation.parameter] as number
        : 0;
      const upstreamParams = { ...parsed };
      if (definition.localContinuation) delete upstreamParams[definition.localContinuation.parameter];
      if (definition.localSkinFilters) { delete upstreamParams.skin; delete upstreamParams.active; }
      const bound = bindRequest(definition.entryId, upstreamParams);
      const key = JSON.stringify([definition.entryId, Object.entries(upstreamParams).sort(([a], [b]) => a.localeCompare(b))]);
      const cached = definition.cacheTtlMs ? cache.get(key) : undefined;
      let result: HttpResult<unknown>;
      if (cached && cached.expiresAt > now()) {
        result = { ...cached.result, freshness: { ...cached.result.freshness, ageMs: Math.max(0, now() - Date.parse(cached.result.freshness.retrievedAt)) } };
      } else {
        cache.delete(key);
        result = await bound.execute(client);
        if (definition.cacheTtlMs && result.ok) {
          while (cache.size >= 32) cache.delete(cache.keys().next().value!);
          cache.set(key, { result, expiresAt: now() + definition.cacheTtlMs });
        }
      }
      const provenance = {
        endpoint: bound.endpointTemplate, traceId: result.traceId, freshness: result.freshness,
        requestScope: Object.fromEntries(Object.entries(parsed).map(([key, value]) => [
          key, accountSelectors.has(key) ? { supplied: true } : value,
        ])),
      };
      if (!result.ok) return {
        isError: true, content: [{ type: "text" as const, text: result.message }],
        structuredContent: { kind: result.kind, endpoint: bound.endpointTemplate }, _meta: { provenance },
      };
      const array = Array.isArray(result.data);
      const body = result.data as Record<string, unknown>;
      const container = definition.listEnvelope ? body[definition.listEnvelope] as Record<string, unknown> : body;
      const sourceRows = array ? result.data as unknown[] : definition.listField ? container[definition.listField] : undefined;
      const oversized = () => ({
        isError: true,
        content: [{ type: "text" as const, text: "The upstream record exceeds this server's 256 KiB result limit. No partial record is returned." }],
        structuredContent: { kind: "response_too_large", endpoint: bound.endpointTemplate },
        _meta: { provenance },
      });
      if (!Array.isArray(sourceRows)) {
        if (bytes(body) > MAX_BYTES) return oversized();
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }], structuredContent: body, _meta: { provenance } };
      }
      const filteredRows = definition.localSkinFilters
        ? sourceRows.filter((value) => {
          const row = value as Record<string, unknown>;
          return (parsed.skin === undefined || row.skin === parsed.skin)
            && (parsed.active === undefined || row.active === parsed.active);
        }) : sourceRows;
      const sourcePosition = definition.localContinuation ? continuationPosition : 0;
      const selectedRows = filteredRows.slice(sourcePosition);
      const availableRows = definition.enrichRows ? await definition.enrichRows(selectedRows) : selectedRows;
      if (availableRows.length !== selectedRows.length) throw new Error("Row enrichment changed continuation positions.");
      const maxRows = definition.localContinuation ? availableRows.length : Math.min(availableRows.length, MAX_ROWS);
      const projected = (rows: unknown[]) => array ? { data: rows } : definition.listEnvelope
        ? { ...body, [definition.listEnvelope]: { ...container, [definition.listField!]: rows } }
        : { ...body, [definition.listField!]: rows };
      const fits = (count: number) => bytes(projected(availableRows.slice(0, count))) <= MAX_BYTES;
      if (!fits(0)) return oversized();
      let fittingRows = 0;
      let nextOutsideBound = maxRows + 1;
      while (nextOutsideBound - fittingRows > 1) {
        const candidate = Math.floor((fittingRows + nextOutsideBound) / 2);
        if (fits(candidate)) fittingRows = candidate;
        else nextOutsideBound = candidate;
      }
      const rows = availableRows.slice(0, fittingRows);
      if (rows.length === 0 && availableRows.length > 0) return oversized();
      const nextPosition = sourcePosition + rows.length;
      const truncated = definition.localContinuation
        ? nextPosition < filteredRows.length
        : rows.length < sourceRows.length;
      const projectedText = JSON.stringify(array ? rows : projected(rows));
      const resultLimit = definition.localContinuation
        ? { truncated, returnedRows: rows.length, upstreamRows: sourceRows.length, filteredRows: filteredRows.length, startPosition: sourcePosition, nextPosition: truncated ? nextPosition : null }
        : { truncated, returnedRows: rows.length, upstreamRows: sourceRows.length };
      return {
        content: truncated
          ? [
            { type: "text" as const, text: definition.localContinuation
              ? `This response contains rows ${sourcePosition} through ${nextPosition - 1} of ${filteredRows.length} matching rows (${sourceRows.length} upstream). Continue with ${definition.localContinuation.parameter}=${nextPosition}; no continuation page was auto-fetched.`
              : `This response was locally truncated to ${rows.length} of ${sourceRows.length} upstream rows. No continuation was fetched; this is not a complete result. Other upstream fields are retained unchanged.` },
            { type: "text" as const, text: projectedText },
          ]
          : [{ type: "text" as const, text: projectedText }],
        structuredContent: projected(rows),
        _meta: { provenance, resultLimit },
      };
    });
  }
}
