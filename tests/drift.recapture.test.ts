import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { recaptureFixtures, type RecaptureInput } from "../scripts/drift/recapture.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";

const entryId = (TOOL_ENTRY_IDS as Record<string, string>).game_last_block!;
const input = (suffix: string): RecaptureInput => ({
  fixturePath: "tests/fixtures/capture-" + suffix + ".fixture.json", entryId, params: {},
  existing: { valueClasses: { "body.last_block": { valueClass: "numeric" } }, body: { last_block: 1 } },
});
it("prepares a sanitized renewal without retaining raw response content", async () => {
  const result = await recaptureFixtures([input("with_underscore")],
    async () => ({ status: 200, isJson: true, body: { last_block: 2 } }));
  expect(result.plan.writes).toHaveLength(1);
  expect(result.plan.writes[0]!.path).toBe("tests/fixtures/capture-with_underscore.fixture.json");
  expect(JSON.parse(result.plan.writes[0]!.contents).body).toEqual({ last_block: 2 });
  expect(result.failed).toEqual([]);
});
it("counts unreadable captures in the hold floor and suppresses all writes", async () => {
  let calls = 0;
  const result = await recaptureFixtures([input("a"), input("b")], async () =>
    ++calls === 1 ? { status: 200, isJson: true, body: { last_block: 2 } }
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

it("keeps avatar fixture URLs synthetic while validating the captured redirect", async () => {
  const existing = JSON.parse(readFileSync(new URL("./fixtures/player-avatar.fixture.json", import.meta.url), "utf8"));
  const input = { fixturePath: "tests/fixtures/player-avatar.fixture.json", entryId: "api.players.avatar", params: { name: "private-owner" }, existing };
  const body = { avatar_url: "https://api.splinterlands.com/players/avatar/private-owner", image_url: "https://runi.splinterlands.com/avatars/1234.png?account=private-owner", redirect_status: 302 };
  const result = await recaptureFixtures([input], async () => ({ status: 200, isJson: true, body }));
  expect(result.failed).toEqual([]);
  expect(result.plan.writes).toHaveLength(1);
  const fixture = JSON.parse(result.plan.writes[0]!.contents);
  expect(fixture.body).toEqual(existing.body);
  expect(fixture.provenance.redaction).toContain("Avatar URLs");
  expect(result.plan.writes[0]!.contents).not.toContain("private-owner");
  expect(body.avatar_url).toContain("private-owner");
  for (const changed of [
    { ...body, avatar_url: "https://api.splinterlands.com/players/avatar/someone-else" },
    { ...body, image_url: "https://untrusted.example/avatar.png" },
    { ...body, private_extra: "secret" },
  ]) {
    const held = await recaptureFixtures([input], async () => ({ status: 200, isJson: true, body: changed }));
    expect(held.failed).toHaveLength(1);
    expect(held.plan.writes).toEqual([]);
  }
});

it("rejects a mismatched asset scenario before any batch request", async () => {
  const existing = JSON.parse(readFileSync(new URL("./fixtures/vapi-market-meta-avatars.fixture.json", import.meta.url), "utf8"));
  let reads = 0;
  const request = async () => { reads++; return { status: 200, isJson: true, body: existing.body }; };
  const input = { fixturePath: "tests/fixtures/vapi-market-meta-avatars.fixture.json", entryId: "vapi.market.meta.asset", params: { assetName: "PACKS" }, existing };
  await expect(recaptureFixtures([input], request)).rejects.toThrow("Fixture asset selector mismatch.");
  expect(reads).toBe(0);
  const correct = await recaptureFixtures([{ ...input, params: { assetName: "AVATARS" } }], request);
  expect(correct.failed).toEqual([]);
  expect(reads).toBe(1);
});

it("holds a small response whose expanded fixture exceeds the loader limit", async () => {
  const existing = JSON.parse(readFileSync(new URL("./fixtures/api-cards-get-details.fixture.json", import.meta.url), "utf8"));
  delete existing.provenance.fixtureSample;
  const result = await recaptureFixtures([{
    fixturePath: "tests/fixtures/sample.fixture.json", entryId: "api.cards.get-details", params: {},
    existing,
  }], async () => ({ status: 200, isJson: true, body: Array.from({ length: 1000 }, (_, id) => ({ ...existing.body[0], id: id + 1 })) }));
  expect(result.failed).toEqual([{ fixturePath: "tests/fixtures/sample.fixture.json", reason: "review" }]);
  expect(result.plan.blockedByHoldFloor).toBe(true);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
});

it("holds contract-invalid responses even when their reviewed scalar class accepts them", async () => {
  const candidate = input("invalid_contract");
  candidate.existing = { body: { last_block: 1 }, valueClasses: { "body.last_block": { valueClass: "numeric" } } };
  const result = await recaptureFixtures([candidate], async () => ({
    status: 200, isJson: true, body: { last_block: "2" },
  }));
  expect(result.failed).toEqual([{ fixturePath: candidate.fixturePath, reason: "review" }]);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
});

it("holds fixtures when redaction corrupts a valid response envelope", async () => {
  const existing = JSON.parse(readFileSync(new URL("./fixtures/vapi-market-meta-avatars.fixture.json", import.meta.url), "utf8"));
  existing.valueClasses["body.status"] = { valueClass: "opaque" };
  const result = await recaptureFixtures([{
    fixturePath: "tests/fixtures/vapi-market-meta-avatars.fixture.json",
    entryId: "vapi.market.meta.asset", params: { assetName: "AVATARS" }, existing,
  }], async () => ({ status: 200, isJson: true, body: existing.body }));
  expect(result.failed).toHaveLength(1);
  expect(result.plan.writes).toEqual([]);
  expect(result.plan.pendingWrites).toEqual([]);
});

it("reports fixed review stages without rejected response values", async () => {
  const result = await recaptureFixtures([input("diagnostic")],
    async () => ({ status: 200, isJson: true, body: { last_block: "PRIVATE_REVIEW_SENTINEL" } }));
  expect(result.failed).toEqual([{ fixturePath: input("diagnostic").fixturePath, reason: "review" }]);
  expect(result.reviewDiagnostics).toEqual([{ fixturePath: input("diagnostic").fixturePath, stage: "upstream_contract" }]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_REVIEW_SENTINEL");
});
