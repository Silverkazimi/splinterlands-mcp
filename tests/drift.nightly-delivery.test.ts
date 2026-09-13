import { expect, it } from "vitest";
import { runNightly } from "../scripts/drift/nightly.js";
import { publishNightly } from "../scripts/drift/nightly-delivery.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import { getCatalogueEntry } from "../src/catalogue/index.js";
import type { DriftBaseline } from "../scripts/drift/types.js";

const ids = [(TOOL_ENTRY_IDS as Record<string, string>).game_last_block!, TOOL_ENTRY_IDS.player_profile];
const baseline: DriftBaseline = { capturedAt: "2026-09-13", unbaselined: [], entries: ids.map(entryId => {
  const entry = getCatalogueEntry(entryId);
  return { entryId, host: entry.host, pathTemplate: entry.pathTemplate, authTier: "public",
    statusesObserved: [200], shape: null, shapeSources: [], truncatedAt: [], capturedAt: "2026-09-13" };
}) };
const inputs = ids.map((entryId, index) => ({ entryId, params: index ? { name: "sample-account-a" } : {} }));
it("opens one labeled issue per changed endpoint, rather than combining endpoints", async () => {
  const result = await runNightly(inputs, baseline, async () => ({ status: 401, isJson: true, body: {} }));
  const calls: string[][] = [];
  publishNightly(result, baseline, "sample/project", args => {
    calls.push(args);
    return args[1] === "list" ? "[]" : "";
  });
  const issues = calls.filter(args => args[0] === "issue" && args[1] === "create");
  expect(issues.filter(args => args.includes("drift:auth"))).toHaveLength(2);
});
it("opens exactly one blocked issue after two distinct 403 responses", async () => {
  const result = await runNightly(inputs, baseline, async () => ({ status: 403, isJson: false, body: null }));
  const calls: string[][] = [];
  publishNightly(result, baseline, "sample/project", args => {
    calls.push(args);
    return args[1] === "list" ? "[]" : "";
  });
  const issues = calls.filter(args => args[0] === "issue" && args[1] === "create");
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain("drift:blocked");
  expect(issues[0]).not.toContain("drift:auth");
});
