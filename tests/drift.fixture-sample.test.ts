import { expect, it } from "vitest";
import { sampleFixtureBody, MAX_SAMPLED_BODY_BYTES } from "../scripts/drift/fixture-sample.js";
import { readFileSync } from "node:fs";
const fixture = (name: string) => JSON.parse(readFileSync(new URL("./fixtures/" + name + ".fixture.json", import.meta.url), "utf8"));

it("retains the market fixture's explicit leading-row scope after full validation", () => {
  const prior = fixture("market-sale");
  const body = [...prior.body, ...prior.body];
  expect(sampleFixtureBody(prior, body, "api.market.for-sale-grouped")).toMatchObject({ body: prior.body });
  expect(() => sampleFixtureBody(prior, [...body, { card_detail_id: "invalid" }], "api.market.for-sale-grouped")).toThrow();
});
it("selects the exact catalogue scenario and holds missing or duplicate identifiers", () => {
  const prior = fixture("card-definition-null-subtype");
  const row = prior.body[0];
  expect(sampleFixtureBody(prior, [{ ...row, id: 1 }, row], "api.cards.get-details")).toMatchObject({ body: [row] });
  for (const body of [[{ ...row, id: 1 }], [row, row]]) {
    expect(() => sampleFixtureBody(prior, body, "api.cards.get-details")).toThrow("unavailable");
  }
});
it("rejects unsupported scopes and preserves unsampled bodies", () => {
  const body = [{ id: 1 }];
  expect(sampleFixtureBody({}, body, "api.cards.get-details").body).toBe(body);
  for (const fixtureSample of [
    { kind: "first", limit: 0 }, { kind: "first", limit: 101 },
    { kind: "ids", ids: [] }, { kind: "ids", ids: [1, 1] },
    { kind: "ids", ids: [1], extra: true }, { kind: "ids", ids: ["1"] },
  ]) expect(() => sampleFixtureBody({ provenance: { fixtureSample } }, body, "api.cards.get-details")).toThrow();
  expect(() => sampleFixtureBody({ provenance: { fixtureSample: { kind: "first", limit: 1 } } }, body, "api.players.balances")).toThrow();
});

it("bounds presale leaderboard rows while retaining totals and the current player", () => {
  const prior = fixture("ranking-presale");
  const body = { ...prior.body, players: [...prior.body.players, ...prior.body.players] };
  expect(sampleFixtureBody(prior, body, "api.players.rebellion-presale-leaders").body).toEqual(prior.body);
  expect(body.players).toHaveLength(6);
  expect(() => sampleFixtureBody(prior, { ...body, players: [...body.players, { player: 12 }] },
    "api.players.rebellion-presale-leaders")).toThrow("Invalid fixture response.");
});

it("bounds renewed nested leaderboard samples only after validating all rows", () => {
  const prior = fixture("ranking-burn-event");
  const body = { ...prior.body, leaderboard: [...prior.body.leaderboard, ...prior.body.leaderboard] };
  const result = sampleFixtureBody(prior, body, "api.players.burn-event-leaderboard");
  expect(result.body).toEqual(prior.body);
  expect(body.leaderboard.length).toBe(prior.body.leaderboard.length * 2);
  expect(() => sampleFixtureBody(prior, { ...body, leaderboard: [...body.leaderboard, { player: 123 }] },
    "api.players.burn-event-leaderboard")).toThrow("Invalid fixture response.");
});
it("preserves metadata selectors and wrapper fields while bounding details", () => {
  const prior = fixture("vapi-market-meta-skins");
  const body = { ...prior.body, data: { ...prior.body.data, details: [...prior.body.data.details, ...prior.body.data.details] } };
  expect(sampleFixtureBody(prior, body, "vapi.market.meta.asset").body).toEqual(prior.body);
  expect(() => sampleFixtureBody(prior, { ...body, data: { ...body.data, details: {} } },
    "vapi.market.meta.asset")).toThrow();
});

it("bounds sampled bytes with complete rows and refuses an oversized first record", () => {
  const prior = fixture("market-sale");
  const row = { ...prior.body[0], diagnostic_padding: "x".repeat(70_000) };
  const result = sampleFixtureBody(prior, [row, row, row], "api.market.for-sale-grouped");
  expect(result.body).toEqual([row]);
  expect(Buffer.byteLength(JSON.stringify(result.body))).toBeLessThanOrEqual(MAX_SAMPLED_BODY_BYTES);
  expect(() => sampleFixtureBody(prior, [{ ...row, diagnostic_padding: "x".repeat(MAX_SAMPLED_BODY_BYTES) }],
    "api.market.for-sale-grouped")).toThrow("byte budget");
});
