import { expect, it } from "vitest";
import { runNightly, summarizeNightly } from "../scripts/drift/nightly.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import type { DriftBaseline } from "../scripts/drift/types.js";

const entryId = (TOOL_ENTRY_IDS as Record<string, string>).game_last_block!;
const entry = getCatalogueEntry(entryId);
const baseline: DriftBaseline = { capturedAt: "2026-09-13", unbaselined: [], entries: [{
  entryId, host: entry.host, pathTemplate: entry.pathTemplate, authTier: "public",
  statusesObserved: [200], shape: { fields: { last_block: { types: ["number"] } }, truncatedAt: [] },
  shapeSources: [], truncatedAt: [], capturedAt: "2026-09-13",
}] };
it("reports partial coverage and excludes response values and dynamic keys", async () => {
  const result = await runNightly([{ entryId, params: {} }], baseline,
    async () => ({ status: 200, body: { last_block: 1, sensitive_map_key: "private value" }, isJson: true }));
  expect(result.complete).toBe(false);
  expect(result.coverage.swept).toBe(1);
  expect(result.coverage.unconfigured.length).toBe(result.coverage.callable - 1);
  const summary = JSON.stringify(summarizeNightly(result));
  expect(summary).not.toContain("sensitive_map_key");
  expect(summary).not.toContain("private value");
  expect(summarizeNightly(result).issues[0]?.changes.added).toBe(1);
});
it("validates the entire request configuration before making any read", async () => {
  let calls = 0;
  await expect(runNightly([{ entryId, params: {} }, { entryId: "invalid.route", params: {} }],
    baseline, async () => { calls++; return { status: 200, body: {}, isJson: true }; })).rejects.toThrow();
  expect(calls).toBe(0);
});
it("reports missing baselines instead of treating unchecked shape as passing", async () => {
  const result = await runNightly([{ entryId, params: {} }], { ...baseline, entries: [] },
    async () => ({ status: 200, body: {}, isJson: true }));
  expect(result.coverage.unbaselined).toEqual([entryId]);
  expect(result.complete).toBe(false);
});

it("reports fixed transport categories without failed response contents", async () => {
  const result = await runNightly([{ entryId, params: {} }], baseline,
    async () => ({ status: 0, isJson: false, body: "PRIVATE_TRANSPORT_SENTINEL", transportFailure: "timeout" }));
  const summary = summarizeNightly(result);
  expect(summary.coverage.transportFailures).toEqual([{ entryId, reason: "timeout" }]);
  expect(JSON.stringify(summary)).not.toContain("PRIVATE_TRANSPORT_SENTINEL");
});
