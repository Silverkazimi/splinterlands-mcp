import limits from "./data/hive-transaction-limits.json" with { type: "json" };
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bindRequest } from "./catalogue/index.js";
import type { SplinterlandsHttpClient } from "./http/client.js";
import { HermesHiveReader, HiveReadError, HIVE_URL } from "./hive-reader.js";

export const HIVE_TOOL_ROUTES: Record<string, string> = {
  hive_account_history: "Read-only RPC: condenser_api.get_account_history",
  hive_transaction: "Read-only RPC: condenser_api.get_transaction",
  transaction_inspect: "Read-only Hive transaction RPC + GET /transactions/lookup",
};
const account = z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]+[a-z0-9]$/);
const trxId = z.string().regex(/^[a-fA-F0-9]{40}$/).transform((v) => v.toLowerCase());
const object = z.record(z.unknown());
const operation = z.tuple([z.string(), object]);
const historyRow = z.tuple([z.number().int().nonnegative(), z.object({
  op: operation, trx_id: trxId, block: z.number().int().nonnegative(),
  op_in_trx: z.number().int().nonnegative(), timestamp: z.string(),
}).passthrough()]);
const transactionSchema = z.object({
  operations: z.array(operation), signatures: z.array(z.string()),
  block_num: z.number().int().positive(), transaction_id: trxId.optional(),
}).passthrough();
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
function decoded(value: unknown): { value: unknown; warning?: string } {
  if (typeof value !== "string") return { value, warning: "Expected a JSON-encoded string." };
  try { return { value: JSON.parse(value) as unknown }; }
  catch { return { value: null, warning: "Malformed embedded JSON; raw value is preserved." }; }
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function summarizeOperation(op: [string, Record<string, unknown>], index: number) {
  const [type, payload] = op;
  const parsed = type === "custom_json" ? decoded(payload.json) : undefined;
  const cards = record(parsed?.value)?.cards;
  const recognized = type === "custom_json" && payload.id === "sm_gift_cards";
  const validCards = recognized && Array.isArray(cards) && cards.every((c) => typeof c === "string");
  return {
    index, type, custom_json_id: type === "custom_json" ? payload.id ?? null : null,
    required_auths: payload.required_auths ?? null, required_posting_auths: payload.required_posting_auths ?? null,
    decoded_json: parsed?.value ?? null, parse_warning: parsed?.warning ?? null,
    item_schema: recognized ? "sm_gift_cards.cards" : null,
    item_count: validCards ? cards.length : null,
    unique_item_count: validCards ? new Set(cards).size : null,
    item_ids: validCards ? cards : null,
  };
}
function output(body: Record<string, unknown>, isError = false) {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > 256 * 1024) throw new HiveReadError("response_too_large", "Result exceeds 256 KiB; it is refused whole. Narrow the history window.");
  return { ...(isError ? { isError: true } : {}), content: [{ type: "text" as const, text }], structuredContent: body };
}
async function guarded(action: () => Promise<Record<string, unknown>>) {
  try { return output(await action()); }
  catch (error) {
    if (!(error instanceof HiveReadError) && !(error instanceof z.ZodError)) throw error;
    return output({ kind: error instanceof HiveReadError ? error.kind : "malformed_response",
      message: error instanceof HiveReadError ? error.message : "Upstream result did not match the required shape." }, true);
  }
}
async function transaction(reader: HermesHiveReader, id: string) {
  const raw = transactionSchema.parse(await reader.read("condenser_api.get_transaction", [id]));
  if (raw.transaction_id && raw.transaction_id !== id) throw new HiveReadError("malformed_response", "Hive returned a different transaction ID.");
  return {
    trx_id: id, raw, operation_count: raw.operations.length, signature_count: raw.signatures.length,
    operations: raw.operations.map(summarizeOperation), block_num: raw.block_num,
    evidence_url: "https://hivexplorer.com/tx/" + id,
    inclusion: "Returned in a block by this node; irreversibility was not queried.",
    source: HIVE_URL, retrieved_at: new Date().toISOString(),
  };
}
async function settledRead(action: () => Promise<unknown>) {
  try { return { ok: true as const, data: await action() }; }
  catch (error) {
    if (!(error instanceof HiveReadError) && !(error instanceof z.ZodError)) throw error;
    return { ok: false as const, kind: error instanceof HiveReadError ? error.kind : "malformed_response" };
  }
}
export function registerHiveTools(server: McpServer, client: SplinterlandsHttpClient, reader: HermesHiveReader): void {
  server.registerResource("hermes-transaction-limits", "splinterlands://hive/transaction-limits", { title: "Hive transaction terms and limits", mimeType: "application/json" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(limits) }] }));
  server.registerTool("hive_account_history", {
    description: "Search one bounded window of an explicit Hive account's authority-indexed history. Default: newest 100 records. Optional custom_json_id filter is applied locally. Returns next_start for an explicit later call, even when no matches occur. No automatic pagination; this is not complete incoming-recipient history. Oversized results are refused whole.",
    inputSchema: { account, start: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).default(-1),
      limit: z.number().int().min(1).max(100).default(100), custom_json_id: z.string().min(1).max(64).optional(), operation_type: z.string().min(1).max(64).optional() }, annotations,
  }, async (args) => guarded(async () => {
    const limit = args.start >= 0 ? Math.min(args.limit, args.start + 1) : args.limit;
    const rows = z.array(historyRow).max(100).parse(await reader.read("condenser_api.get_account_history", [args.account, args.start, limit]));
    const indexes = rows.map((r) => r[0]);
    if (new Set(indexes).size !== indexes.length || rows.length > limit || indexes.some((v) => args.start >= 0 && v > args.start))
      throw new HiveReadError("malformed_response", "History window contains duplicate or out-of-range indices.");
    const examined = rows.map(([index, raw]) => {
      const op = operation.parse(raw.op);
      return { index, raw, summary: summarizeOperation(op, Number(raw.op_in_trx ?? 0)) };
    }).sort((a, b) => b.index - a.index);
    const oldest = indexes.length ? Math.min(...indexes) : null;
    return { account: args.account, requested_start: args.start, requested_limit: limit,
      scanned_count: examined.length, oldest_index: oldest, newest_index: indexes.length ? Math.max(...indexes) : null,
      next_start: oldest !== null && oldest > 0 ? oldest - 1 : null,
      coverage: "One node's bounded authority-indexed window; no claim of complete history or incoming transfers.",
      records: examined.filter((r) => (!args.custom_json_id || r.summary.custom_json_id === args.custom_json_id) && (!args.operation_type || r.summary.type === args.operation_type)),
      source: HIVE_URL, retrieved_at: new Date().toISOString(),
    };
  }));
  server.registerTool("hive_transaction", {
    description: "Read a full signed Hive transaction by transaction ID. Preserve every operation and signature; decode custom JSON and count recognized gift-card items separately. Does not establish game processing or irreversibility. One read-only RPC.",
    inputSchema: { trx_id: trxId }, annotations,
  }, async ({ trx_id }) => guarded(() => transaction(reader, trx_id)));
  server.registerTool("transaction_inspect", {
    description: "Inspect one transaction using a full Hive read and the existing Splinterlands game-result lookup. Returns independent chain/game outcomes, decoded game JSON, and gift-card agreement where provable. A game record does not prove processing of every operation in a multi-operation transaction. At most two logical reads.",
    inputSchema: { trx_id: trxId }, annotations,
  }, async ({ trx_id }) => guarded(async () => {
    const chain = await settledRead(() => transaction(reader, trx_id));
    const game = await bindRequest("api.transactions.lookup", { trx_id }).execute(client);
    const info = game.ok ? record(record(game.data)?.trx_info) : undefined;
    const data = info ? decoded(info.data) : undefined;
    const result = info ? decoded(info.result) : undefined;
    const gameIdMatches = info?.id === trx_id;
    const success = gameIdMatches && info?.success === true ? "success" : gameIdMatches && info?.success === false ? "failed" : "unverified";
    const chainData = chain.ok ? chain.data as Awaited<ReturnType<typeof transaction>> : undefined;
    const one = chainData?.operations.length === 1 ? chainData.operations[0] : undefined;
    const resultCards = record(result?.value)?.cards;
    const reportedCards = Array.isArray(resultCards) && resultCards.every((c) => typeof c === "string") ? resultCards : undefined;
    const auths = one?.required_auths;
    const sameContext = gameIdMatches && info?.block_num === chainData?.block_num && info?.type === "gift_cards" && Array.isArray(auths) && auths.includes(info?.player);
    const comparable = sameContext && one?.item_ids && reportedCards;
    const agreement = comparable ? JSON.stringify([...one.item_ids!].sort()) === JSON.stringify([...reportedCards!].sort()) : null;
    return { trx_id, chain, game, game_decoded: info ? { data, result } : null,
      summary: { game_status: success, operation_count: chainData?.operation_count ?? null,
        signature_count: chainData?.signature_count ?? null,
        gift_item_count: one?.item_count ?? null, gift_result_agrees: agreement,
        game_transaction_id_agrees: info ? gameIdMatches : null,
        block_agrees: info && chainData ? info.block_num === chainData.block_num : null,
        verification: success === "success" && agreement === true ? "Single gift operation agrees with the successful game record." : "Evidence is partial or not comparable; inspect the independent outcomes.",
        game_coverage: "One lookup record; completeness across multiple operations is not established." },
      retrieved_at: new Date().toISOString(),
    };
  }));
}
