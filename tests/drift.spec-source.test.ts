import { expect, it } from "vitest";
import { extractSpecification, fetchPublishedSpecification, SPEC_MAX_BYTES, SPEC_URL } from "../scripts/drift/spec-source.js";

it("extracts embedded JSON without evaluating surrounding JavaScript", () => {
  const spec = JSON.stringify({ paths: { "/a": { get: { description: 'brace } and quote "' } } } });
  expect(extractSpecification(spec)).toBe(spec);
  expect(extractSpecification('throw new Error("never run"); const options = {"swaggerDoc":' + spec + '};')).toBe(spec);
  expect(extractSpecification('{"swaggerDoc": {paths: execute()}}')).toBeNull();
  expect(extractSpecification('{"swaggerDoc": {"paths": {')).toBeNull();
});
it("fetches only the pinned URL with timeout and no redirects", async () => {
  let calls = 0;
  const result = await fetchPublishedSpecification(async (url, options) => {
    calls++;
    expect(url).toBe(SPEC_URL);
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return new Response('{"paths":{"/a":{}}}');
  });
  expect(result.ok).toBe(true);
  expect(calls).toBe(1);
});
it("rejects oversized bodies and cancels the stream", async () => {
  let cancelled = false;
  const result = await fetchPublishedSpecification(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(SPEC_MAX_BYTES + 1)); },
    cancel() { cancelled = true; },
  })));
  expect(result).toMatchObject({ ok: false, reason: "unparseable" });
  expect(cancelled).toBe(true);
});
it("reports HTTP, malformed and network failures without response contents", async () => {
  expect(await fetchPublishedSpecification(async () => new Response("private body", { status: 403 })))
    .toEqual({ ok: false, url: SPEC_URL, reason: "http_status", status: 403 });
  expect(await fetchPublishedSpecification(async () => new Response("<html>error</html>")))
    .toMatchObject({ ok: false, reason: "unparseable" });
  expect(await fetchPublishedSpecification(async () => { throw new Error("private details"); }))
    .toEqual({ ok: false, url: SPEC_URL, reason: "network" });
});

it("reads the fixed main-API specification source without widening URL input", async () => {
  const result = await fetchPublishedSpecification(async url => {
    expect(String(url)).toBe("https://api2.splinterlands.com/doc/swagger-ui-init.js");
    return new Response(JSON.stringify({ paths: { "/sample": {} } }));
  }, "api");
  expect(result.ok).toBe(true);
});
