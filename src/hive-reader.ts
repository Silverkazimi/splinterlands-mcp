import { registerLogicalRequest } from "./http/callscope.js";

export const HIVE_URL = "https://api.hive.blog";
export const HIVE_METHODS = ["condenser_api.get_account_history", "condenser_api.get_transaction"] as const;
export class HiveReadError extends Error {
  constructor(readonly kind: string, message: string) { super(message); }
}
export class HermesHiveReader {
  private active = 0;
  private nextStart = 0;
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch, private readonly timeoutMs = 20_000) {}
  async read(method: typeof HIVE_METHODS[number], params: unknown[]): Promise<unknown> {
    if (!(HIVE_METHODS as readonly string[]).includes(method)) throw new HiveReadError("refused_method", "Only the two supported history reads are allowed.");
    registerLogicalRequest(HIVE_URL + "#" + JSON.stringify([method, params]));
    if (this.active >= 2) throw new HiveReadError("busy", "Two Hive reads are already in flight; retry later.");
    this.active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const wait = Math.max(0, this.nextStart - Date.now());
      this.nextStart = Date.now() + wait + 500;
      if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      controller.signal.throwIfAborted();
      const response = await this.fetcher(HIVE_URL, {
        method: "POST", redirect: "error", credentials: "omit", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new HiveReadError("upstream_unavailable", "Hive returned HTTP " + response.status); }
      const reader = response.body?.getReader();
      if (!reader) throw new HiveReadError("malformed_response", "Hive returned no response body.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2 * 1024 * 1024) throw new HiveReadError("response_too_large", "Hive response exceeds 2 MiB; narrow the request.");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      let envelope: Record<string, unknown>;
      try { envelope = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; }
      catch { throw new HiveReadError("malformed_response", "Hive returned invalid JSON."); }
      if (!envelope || envelope.jsonrpc !== "2.0" || envelope.id !== 1 || ("error" in envelope && "result" in envelope))
        throw new HiveReadError("malformed_response", "Hive returned an invalid RPC envelope.");
      if ("error" in envelope) throw new HiveReadError("rpc_error", "Hive could not serve this read; it may be unavailable on this node or the requested record may be absent.");
      if (!("result" in envelope)) throw new HiveReadError("malformed_response", "Hive omitted the RPC result.");
      return envelope.result;
    } catch (error) {
      if (error instanceof HiveReadError) throw error;
      throw new HiveReadError("upstream_unavailable", controller.signal.aborted ? "Hive read timed out." : "Hive read failed.");
    } finally { clearTimeout(timer); this.active--; }
  }
}
