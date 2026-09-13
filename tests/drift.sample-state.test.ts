import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { recaptureFixtures } from "../scripts/drift/recapture.js";
import { runNightly } from "../scripts/drift/nightly.js";
import type { DriftBaseline } from "../scripts/drift/types.js";

const entryId = "vapi.land.deeds.owned";
const fixture = (name: string) => JSON.parse(readFileSync("tests/fixtures/" + name + ".fixture.json", "utf8"));
const populated = fixture("land-deeds-owned-hit");
const empty = fixture("land-deeds-owned-none");
const body = (value: Record<string, unknown>) => {
  const plain = Object.fromEntries(Object.entries(value).filter(([key]) => !["provenance", "valueClasses"].includes(key)));
  return Object.keys(plain).length === 1 && "body" in plain ? plain.body : plain;
};
const input = (existing = populated) => ({
  entryId, fixturePath: "tests/fixtures/land-deeds-owned-hit.fixture.json",
  params: { player: "sample-account" }, existing,
});

it("preserves populated fixtures when a valid account sample becomes empty", async () => {
  const result = await recaptureFixtures([input()], async () => ({ status: 200, isJson: true, body: body(empty) }));
  expect(result.failed).toEqual([]);
  expect(result.coverageGaps).toEqual([{ entryId, fixturePath: input().fixturePath, reason: "empty_sample" }]);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
  expect(result.plan.issues).toEqual([]);
});

it("preserves an empty fixture when its account starts holding assets", async () => {
  const result = await recaptureFixtures([input(empty)], async () => ({ status: 200, isJson: true, body: body(populated) }));
  expect(result.failed).toEqual([]);
  expect(result.coverageGaps[0]?.reason).toBe("populated_sample");
  expect(result.plan.writes).toEqual([]);
});

it("does not mislabel wrapped upstream errors as changed account holdings", async () => {
  const result = await recaptureFixtures([input()], async () => ({
    status: 200, isJson: true, body: { status: "success", data: { name: "AppException", status: 500 } },
  }));
  expect(result.coverageGaps).toEqual([]);
  expect(result.failed[0]?.reason).toBe("response");
  expect(result.plan.writes).toEqual([]);
});

it("nightly reports missing populated coverage separately and supports explicitly expected empty samples", async () => {
  const baseline = JSON.parse(readFileSync("scripts/drift/baseline.json", "utf8")) as DriftBaseline;
  const request = async () => ({ status: 200, isJson: true, body: body(empty) });
  const missing = await runNightly([{ entryId, params: input().params }], baseline, request);
  expect(missing.plan.issues).toEqual([]);
  expect(missing.coverage.sampleCoverage).toEqual([{ entryId, reason: "empty_sample" }]);
  const expected = await runNightly([{ entryId, params: input().params, expectEmpty: true }], baseline, request);
  expect(expected.plan.issues).toEqual([]);
  expect(expected.coverage.sampleCoverage).toEqual([]);
});

it("does not hide malformed empty envelopes and reports an empty sample becoming populated", async () => {
  const baseline = JSON.parse(readFileSync("scripts/drift/baseline.json", "utf8")) as DriftBaseline;
  const invalid = await runNightly([{ entryId, params: input().params }], baseline,
    async () => ({ status: 200, isJson: true, body: { status: "success" } }));
  expect(invalid.coverage.sampleCoverage).toEqual([]);
  expect(invalid.plan.issues.some(issue => issue.labels.includes("drift:response"))).toBe(true);
  const filled = await runNightly([{ entryId, params: input().params, expectEmpty: true }], baseline,
    async () => ({ status: 200, isJson: true, body: body(populated) }));
  expect(filled.coverage.sampleCoverage).toEqual([{ entryId, reason: "populated_sample" }]);
});
