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


it.each([
  ["api.conflicts.players", "governance-conflict-players", "players"],
  ["api.conflicts.airdrop-distribution", "governance-conflict-airdrop", "distribution"],
  ["api.conflicts.wagon-eligible-cards", "governance-eligible", "groups"],
])("reports named empty lists as coverage gaps for %s", async (id, name, key) => {
  const existing = fixture(name);
  const response = { ...(body(existing) as Record<string, unknown>), [key]: [] };
  const params: Record<string, string> = key === "groups" ? { username: "sample-account" } : { player: "sample-account", id: "21" };
  const result = await recaptureFixtures([{ entryId: id, fixturePath: "tests/fixtures/" + name + ".fixture.json",
    params, existing }], async () => ({ status: 200, isJson: true, body: response }));
  expect(result.failed).toEqual([]);
  expect(result.coverageGaps).toEqual([{ entryId: id, fixturePath: "tests/fixtures/" + name + ".fixture.json", reason: "empty_sample" }]);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
  const baseline = JSON.parse(readFileSync("scripts/drift/baseline.json", "utf8")) as DriftBaseline;
  const request = async () => ({ status: 200, isJson: true, body: response });
  const nightly = await runNightly([{ entryId: id, params }], baseline, request);
  expect(nightly.coverage.sampleCoverage).toEqual([{ entryId: id, reason: "empty_sample" }]);
  expect(nightly.plan.issues).toEqual([]);
  const expectedEmpty = await runNightly([{ entryId: id, params, expectEmpty: true }], baseline, request);
  expect(expectedEmpty.coverage.sampleCoverage).toEqual([]);
  const malformed = await recaptureFixtures([{ entryId: id, fixturePath: "tests/fixtures/" + name + ".fixture.json",
    params, existing }], async () => ({ status: 200, isJson: true, body: { ...response, [key]: {} } }));
  expect(malformed.coverageGaps).toEqual([]);
  expect(malformed.failed[0]?.reason).toBe("review");
});

it("records idle queues without replacing populated evidence or flagging holdings loss", async () => {
  const queueId = "api.battle.battle-queue";
  const existing = fixture("battle-queue");
  const original = JSON.stringify(existing);
  const queueInput = { entryId: queueId, fixturePath: "tests/fixtures/battle-queue.fixture.json",
    params: { username: "sample-account" }, existing };
  const request = async () => ({ status: 200, isJson: true, body: [] });
  const monthly = await recaptureFixtures([queueInput], request);
  expect(monthly.coverageGaps).toEqual([]);
  expect(monthly.failed).toEqual([]);
  expect(monthly.transientSamples).toEqual([{ entryId: queueId, fixturePath: queueInput.fixturePath, reason: "idle_queue" }]);
  expect(monthly.plan.writes).toEqual([]);
  expect(monthly.plan.pendingWrites).toEqual([]);
  expect(monthly.plan.blockedByHoldFloor).toBe(false);
  expect(JSON.stringify(existing)).toBe(original);
  const baseline = JSON.parse(readFileSync("scripts/drift/baseline.json", "utf8")) as DriftBaseline;
  const nightly = await runNightly([{ entryId: queueId, params: queueInput.params }], baseline, request);
  expect(nightly.coverage.sampleCoverage).toEqual([]);
  expect(nightly.coverage.transientSamples).toEqual([{ entryId: queueId, reason: "idle_queue" }]);
  expect(nightly.plan.issues).toEqual([]);
});

it("still rejects malformed queues and detects changes in populated queue responses", async () => {
  const queueId = "api.battle.battle-queue";
  const existing = fixture("battle-queue");
  const queueInput = { entryId: queueId, fixturePath: "tests/fixtures/battle-queue.fixture.json",
    params: { username: "sample-account" }, existing };
  const invalid = await recaptureFixtures([queueInput], async () => ({ status: 200, isJson: true, body: [{}] }));
  expect(invalid.transientSamples).toEqual([]);
  expect(invalid.failed).toHaveLength(1);
  const baseline = JSON.parse(readFileSync("scripts/drift/baseline.json", "utf8")) as DriftBaseline;
  const rows = (body(existing) as Array<Record<string, unknown>>).map(row => ({ ...row, status: "invalid" }));
  const nightly = await runNightly([{ entryId: queueId, params: queueInput.params }], baseline,
    async () => ({ status: 200, isJson: true, body: rows }));
  expect(nightly.coverage.transientSamples).toEqual([]);
  expect(nightly.plan.issues.length).toBeGreaterThan(0);
});
