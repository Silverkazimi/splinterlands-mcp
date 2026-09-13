import { expect, it } from "vitest";
import { sweep } from "../scripts/drift/sweep.js";
import { planDriftIssues } from "../scripts/drift/plan.js";
import type { DriftBaseline, SweepEntry } from "../scripts/drift/types.js";

const entries: SweepEntry[] = [{ entryId: "api.sample.route", host: "api", pathTemplate: "/sample", authBaseline: "public" }];
const baseline: DriftBaseline = { capturedAt: "2026-09-13", unbaselined: [], entries: [{
  entryId: "api.sample.route", host: "api", pathTemplate: "/sample", authTier: "public",
  statusesObserved: [200], shape: null, shapeSources: [], truncatedAt: [], capturedAt: "2026-09-13",
}] };
it("discards response values from retained sweep observations", async () => {
  const run = await sweep(entries, async () => ({ status: 200, isJson: true, body: { value: "PRIVATE_SENTINEL" } }));
  expect(JSON.stringify(run)).not.toContain("PRIVATE_SENTINEL");
  expect(run.observations[0]).not.toHaveProperty("body");
  expect(run.observations[0]?.shape?.fields).toHaveProperty("value");
});
it("reports changed HTTP status even when shape comparison is unavailable", async () => {
  const run = await sweep(entries, async () => ({ status: 503, isJson: false, body: null }));
  const plan = planDriftIssues(baseline, run);
  expect(plan.issues).toHaveLength(1);
  expect(plan.issues[0]).toMatchObject({ labels: ["drift:status"], statusBaseline: 200, statusObserved: 503 });
});

it("reports unusable responses even when HTTP status remains unchanged", async () => {
  const run = await sweep(entries, async () => ({ status: 200, isJson: false, body: null }));
  expect(planDriftIssues(baseline, run).issues[0]?.labels).toEqual(["drift:response"]);
});
