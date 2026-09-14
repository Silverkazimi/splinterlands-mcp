import { expect, it } from "vitest";
import { sampleFixtureBody } from "../scripts/drift/fixture-sample.js";
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
