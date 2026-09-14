import { reviewedFixtureShapeIds } from "../scripts/gen-drift-baseline.js";
import { expect, it } from "vitest";
import { sweep } from "../scripts/drift/sweep.js";
import { planDriftIssues } from "../scripts/drift/plan.js";
import { fixtureShapeId } from "../scripts/drift/renewal.js";
import { observeShape } from "../scripts/drift/shape.js";
import type { DriftBaseline, RawOutcome } from "../scripts/drift/types.js";

const body = { id: 1, optional: null };
const baseline: DriftBaseline = {
  capturedAt: "2026-09-14", unbaselined: [],
  entries: [{
    entryId: "api.players.details", host: "api", pathTemplate: "/players/details",
    authTier: "public", statusesObserved: [200], capturedAt: "2026-09-14",
    shape: observeShape({ id: 1, optional: "present", other: true }),
    shapeSources: ["reviewed.fixture.json"], truncatedAt: [],
    reviewedShapes: [{ variantKey: "default", shapeIds: [fixtureShapeId({ body })] }],
  }],
};
async function check(outcome: RawOutcome, variantKey = "default", valid = true) {
  const run = await sweep([{
    entryId: "api.players.details", host: "api", pathTemplate: "/players/details",
    authBaseline: "public", variantKey, validateResponse: () => valid,
  }], async () => outcome);
  return planDriftIssues(baseline, run);
}
it("accepts an exact reviewed shape after runtime validation", async () => {
  expect((await check({ status: 200, body, isJson: true })).issues).toEqual([]);
});
it("does not accept the same shape for a different variant", async () => {
  expect((await check({ status: 200, body, isJson: true }, "other")).issues).toHaveLength(1);
});
it.each([
  { ...body, added: true }, { id: "wrong", optional: null }, { id: 1 },
])("reports previously unreviewed additions, types and removals", async candidate => {
  expect((await check({ status: 200, body: candidate, isJson: true })).issues).toHaveLength(1);
});
it("does not hide failed runtime validation behind a known shape", async () => {
  const result = await check({ status: 200, body, isJson: true }, "default", false);
  expect(result.issues[0]?.labels).toContain("drift:response");
});
it.each([401, 403, 500])("preserves HTTP failure %s despite a known body shape", async status => {
  expect((await check({ status, body, isJson: true })).issues).toHaveLength(1);
});
it("keeps empty results out of reviewed-shape acceptance", async () => {
  const result = await check({ status: 200, body: [], isJson: true });
  expect(result.run.observations[0]?.reason).toBe("empty_result");
  expect(result.run.observations[0]?.validatedShapeId).toBeUndefined();
});

it("accepts a reviewed full-response shape only while its source fixture shape matches", () => {
  const fixture = { body: { id: 1 }, provenance: {} };
  const responseShape = fixtureShapeId({ body: { id: 1, optional: null } });
  const reviewed = { ...fixture, provenance: { reviewedResponseShapes: [
    { baselineShape: fixtureShapeId(fixture), responseShape },
  ] } };
  expect(reviewedFixtureShapeIds(reviewed, reviewed.body).has(responseShape)).toBe(true);
  const changed = { ...reviewed, body: { id: "changed" } };
  expect(reviewedFixtureShapeIds(changed, changed.body).has(responseShape)).toBe(false);
});
it.each(["bad", null, { responseShape: "bad" }])("ignores malformed full-response review metadata", review => {
  const fixture = { body: { id: 1 }, provenance: { reviewedResponseShapes: [review] } };
  expect([...reviewedFixtureShapeIds(fixture, fixture.body)]).toEqual([fixtureShapeId({ body: fixture.body })]);
});
it("supports reviewed full responses for unwrapped fixtures without trusting legacy wrapper hashes", () => {
  const fixture = { id: 1 };
  const responseShape = fixtureShapeId({ body: { id: 1, optional: null } });
  const record = { baselineShape: fixtureShapeId(fixture), responseShape, alternateShape: "a".repeat(64) };
  const reviewed = { ...fixture, provenance: { reviewedResponseShapes: [record], reviewedAlternateShapes: [record] } };
  const ids = reviewedFixtureShapeIds(reviewed, fixture);
  expect(ids.has(responseShape)).toBe(true);
  expect(ids.has(record.alternateShape)).toBe(false);
});
