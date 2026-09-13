import { expect, it } from "vitest";
import { bindSweepInputs, createSweepRequester, SWEEP_RESPONSE_CAP } from "../scripts/drift/request.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import { HostRateLimiter } from "../src/http/ratelimit.js";

const lastBlockEntry = (TOOL_ENTRY_IDS as Record<string, string>).game_last_block!;
const inputs = () => bindSweepInputs([{ entryId: lastBlockEntry, params: {} }]);
it("rejects unknown, duplicate and unscoped inputs before requests", () => {
  expect(() => bindSweepInputs([{ entryId: "unknown.route", params: {} }])).toThrow();
  expect(() => bindSweepInputs([{ entryId: TOOL_ENTRY_IDS.player_profile, params: {} }])).toThrow();
  expect(() => bindSweepInputs(Array.from({ length: 2 }, () => ({ entryId: lastBlockEntry, params: {} })))).toThrow("Duplicate");
});
it("uses one paced GET on the bound host with no redirect following", async () => {
  let calls = 0;
  const request = createSweepRequester(async (url, options) => {
    calls++;
    expect(new URL(String(url)).hostname).toBe("api.splinterlands.com");
    expect(new URL(String(url)).pathname).toBe(inputs()[0]!.path.value);
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return new Response('{"value":1}');
  }, new HostRateLimiter());
  expect(await request(inputs()[0]!)).toEqual({ status: 200, body: { value: 1 }, isJson: true });
  expect(calls).toBe(1);
});
it("cancels oversized responses and suppresses malformed/network response contents", async () => {
  let cancelled = false;
  const oversized = createSweepRequester(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(SWEEP_RESPONSE_CAP + 1)); },
    cancel() { cancelled = true; },
  })));
  expect(await oversized(inputs()[0]!)).toEqual({ status: 200, body: null, isJson: false });
  expect(cancelled).toBe(true);
  const failure = createSweepRequester(async () => { throw new Error("private network detail"); });
  expect(await failure(inputs()[0]!)).toEqual({ status: 0, body: null, isJson: false });
});
