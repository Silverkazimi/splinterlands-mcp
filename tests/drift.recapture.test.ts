import { expect, it } from "vitest";
import { recaptureFixtures, type RecaptureInput } from "../scripts/drift/recapture.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";

const entryId = (TOOL_ENTRY_IDS as Record<string, string>).game_last_block!;
const input = (suffix: string): RecaptureInput => ({
  fixturePath: "tests/fixtures/capture-" + suffix + ".fixture.json", entryId, params: {},
  existing: { valueClasses: { "body.height": { valueClass: "numeric" } }, body: { height: 1 } },
});
it("prepares a sanitized renewal without retaining raw response content", async () => {
  const result = await recaptureFixtures([input("with_underscore")],
    async () => ({ status: 200, isJson: true, body: { height: 2 } }));
  expect(result.plan.writes).toHaveLength(1);
  expect(result.plan.writes[0]!.path).toBe("tests/fixtures/capture-with_underscore.fixture.json");
  expect(JSON.parse(result.plan.writes[0]!.contents).body).toEqual({ height: 2 });
  expect(result.failed).toEqual([]);
});
it("counts unreadable captures in the hold floor and suppresses all writes", async () => {
  let calls = 0;
  const result = await recaptureFixtures([input("a"), input("b")], async () =>
    ++calls === 1 ? { status: 200, isJson: true, body: { height: 2 } }
      : { status: 500, isJson: false, body: "private failure" });
  expect(result.plan.holdFraction).toBe(0.5);
  expect(result.plan.blockedByHoldFloor).toBe(true);
  expect(result.plan.writes).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("private failure");
});
it("rejects unsafe targets before any request", async () => {
  let calls = 0;
  await expect(recaptureFixtures([{ ...input("a"), fixturePath: "../outside.json" }],
    async () => { calls++; return { status: 200, isJson: true, body: {} }; })).rejects.toThrow("target");
  expect(calls).toBe(0);
});

it("aborts after two distinct blocked endpoints and writes nothing", async () => {
  let calls = 0;
  const second = { ...input("b"), entryId: TOOL_ENTRY_IDS.player_profile, params: { name: "sample-account-a" } };
  const result = await recaptureFixtures([input("a"), second, input("c")], async () => {
    calls++;
    return { status: 403, isJson: true, body: { error: "blocked" } };
  });
  expect(calls).toBe(2);
  expect(result.aborted).toBe(true);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
});

it("supports a batch larger than the old 200-fixture ceiling while keeping a hard limit", async () => {
  let calls = 0;
  const inputs = Array.from({ length: 226 }, (_, index) => input(String(index)));
  const result = await recaptureFixtures(inputs, async () => {
    calls++;
    return { status: 503, isJson: false, body: null };
  });
  expect(calls).toBe(226);
  expect(result.total).toBe(226);
  expect(result.plan.blockedByHoldFloor).toBe(true);
  await expect(recaptureFixtures(Array.from({ length: 513 }, (_, index) => input(String(index))),
    async () => { throw new Error("Must not request"); })).rejects.toThrow("count");
});
