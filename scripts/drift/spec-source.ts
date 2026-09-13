import { parseSpec, type SpecFetch } from "./spec-diff.js";

export const SPEC_SOURCES = {
  vapi: "https://vapi.splinterlands.com/swagger/swagger-ui-init.js",
  api: "https://api2.splinterlands.com/doc/swagger-ui-init.js",
} as const;
export const SPEC_URL = SPEC_SOURCES.vapi;
export const SPEC_MAX_BYTES = 4 * 1024 * 1024;

export function extractSpecification(text: string): string | null {
  if (parseSpec(text)) return text;
  const marker = /"swaggerDoc"\s*:\s*\{/.exec(text);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index + marker[0].lastIndexOf("{");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      const candidate = text.slice(start, i + 1);
      return parseSpec(candidate) ? candidate : null;
    }
  }
  return null;
}

export async function fetchPublishedSpecification(fetcher: typeof fetch = fetch, source: keyof typeof SPEC_SOURCES = "vapi"): Promise<SpecFetch> {
  const url = SPEC_SOURCES[source];
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, url, reason: "http_status", status: response.status };
    }
    if (!response.body) return { ok: false, url, reason: "unparseable" };
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > SPEC_MAX_BYTES) {
          await reader.cancel();
          return { ok: false, url, reason: "unparseable" };
        }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const body = extractSpecification(Buffer.concat(chunks).toString("utf8"));
    return body === null
      ? { ok: false, url, reason: "unparseable" }
      : { ok: true, url, body };
  } catch {
    return { ok: false, url, reason: "network" };
  }
}
