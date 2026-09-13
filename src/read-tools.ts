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
    const input = base.extend(literals);
    const schema = input.required(Object.fromEntries((definition.required ?? []).map((key) => {
      if (!(key in input.shape)) throw new Error(`Unknown required selector ${key} on ${definition.entryId}`);
      return [key, true as const];
    })));
    server.registerTool(definition.toolName, {
      description: `${definition.description} ${definition.cacheTtlMs ? "Uses a bounded success cache keyed by exact supplied query, otherwise makes one logical GET request" : "Makes one logical GET request"} and does not auto-fetch continuation pages. Required inputs reflect tool policy as well as measured upstream requirements. Other declared filters are forwarded as supplied; their effectiveness is not implied by the schema. ${definition.listField ? `The ${definition.listField} list` : "Array responses"} are locally limited to 100 rows and 256 KiB, with truncation reported in text and metadata. Oversized records are refused without partial fields.`,
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

      const bound = bindRequest(definition.entryId, parsed);
      const key = JSON.stringify([definition.entryId, Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))]);
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
      const rows = sourceRows.slice(0, MAX_ROWS);
      const projected = () => array ? { data: rows } : definition.listEnvelope
        ? { ...body, [definition.listEnvelope]: { ...container, [definition.listField!]: rows } }
        : { ...body, [definition.listField!]: rows };
      while (rows.length > 0 && bytes(projected()) > MAX_BYTES) rows.pop();
      if (bytes(projected()) > MAX_BYTES || (rows.length === 0 && sourceRows.length > 0)) return oversized();
      const truncated = rows.length < sourceRows.length;
      return {
        content: [{ type: "text" as const, text: truncated
          ? `This response was locally truncated to ${rows.length} of ${sourceRows.length} upstream rows. No continuation was fetched; this is not a complete result. Other upstream fields are retained unchanged.`
          : JSON.stringify(array ? rows : projected()) }],
        structuredContent: projected(),
        _meta: { provenance, resultLimit: { truncated, returnedRows: rows.length, upstreamRows: sourceRows.length } },
      };
    });
  }
}
