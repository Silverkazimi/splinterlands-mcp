import { expect, it } from "vitest";
import { fixtureShapeId, planFixtureRenewal } from "../scripts/drift/renewal.js";

const baseline = { body: { value: 1, nested: { label: "example" } } };
const alternate = { body: { value: null, nested: null } };

function reviewed() {
  return { ...structuredClone(baseline), provenance: { reviewedAlternateShapes: [
    { baselineShape: fixtureShapeId(baseline), alternateShape: fixtureShapeId(alternate) },
  ] } };
}
function plan(existing: unknown, recaptured: unknown) {
  return planFixtureRenewal([{ fixturePath: "tests/fixtures/example.fixture.json",
    entryId: "example", existing, recaptured }]);
}

it("retains the existing fixture for an explicitly reviewed alternate shape", () => {
  const existing = reviewed();
  const result = plan(existing, alternate);
  expect(result.outcomes).toEqual(["noop"]);
  expect(result.writes).toEqual([]);
  expect(result.pendingWrites).toEqual([]);
  expect(result.issues).toEqual([]);
  expect(result.decisions[0]!.existing).toEqual(existing);
  expect(result.decisions[0]!.deltas.length).toBeGreaterThan(0);
});
it("holds the same alternate without explicit review", () => {
  expect(plan(baseline, alternate).outcomes).toEqual(["hold"]);
});
it("holds new types, new fields, and additional removals after review", () => {
  for (const body of [{ value: "1", nested: null }, { value: null }, { ...alternate.body, added: 1 }]) {
    expect(plan(reviewed(), { body }).outcomes).toEqual(["hold"]);
  }
});
it("invalidates a review when the baseline shape changes", () => {
  const existing = reviewed();
  expect(plan({ ...existing, body: { ...existing.body, extra: true } }, alternate).outcomes).toEqual(["hold"]);
});
it("fails closed for malformed review metadata", () => {
  for (const reviewedAlternateShapes of ["all", [{}], [{ baselineShape: "*", alternateShape: "*" }], Array(33).fill({})]) {
    expect(plan({ ...baseline, provenance: { reviewedAlternateShapes } }, alternate).outcomes).toEqual(["hold"]);
  }
});
it("includes deeper fields in reviewed shape identities", () => {
  let left: unknown = { value: null };
  let right: unknown = { value: "changed" };
  for (let i = 0; i < 12; i++) { left = { nested: left }; right = { nested: right }; }
  expect(fixtureShapeId(left)).not.toBe(fixtureShapeId(right));
});
