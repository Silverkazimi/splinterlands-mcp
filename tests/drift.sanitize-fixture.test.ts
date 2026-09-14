import { expect, it } from "vitest";
import { sanitizeFixture } from "../scripts/drift/sanitize-fixture.js";

const observedAt = "2026-09-13T00:00:00Z";
const existing = {
  valueClasses: {
    "data[0].owner": { valueClass: "name" },
    "data[0].memo": { valueClass: "freetext" },
    "data[0].amount": { valueClass: "numeric" },
    "data[0].kind": { valueClass: "enum" },
  },
  data: [{ owner: "sample-account-a", memo: "", amount: 1, kind: "grain" }],
};
it("sanitizes names consistently and regenerates concrete array classifications", () => {
  const result = sanitizeFixture(existing, { data: [
    { owner: "private-name", memo: "private memo", amount: 2, kind: "grain" },
    { owner: "private-name", memo: "another memo", amount: 3, kind: "grain" },
  ] }, observedAt);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(result.valueClasses["data[1].owner"]).toEqual({ valueClass: "name" });
  expect(((result as Record<string, unknown>).data as Array<{ owner: string }>).map(row => row.owner)).toEqual(["sample-account-1", "sample-account-1"]);
});
it("holds unknown keys and enum values without echoing them", () => {
  for (const row of [
    { ...existing.data[0], sensitive_new_key: "secret" },
    { ...existing.data[0], kind: "private enum" },
  ]) {
    expect(() => sanitizeFixture(existing, { data: [row] }, observedAt)).toThrow();
    try {
      sanitizeFixture(existing, { data: [row] }, observedAt);
    } catch (error) {
      expect(String(error)).not.toContain("sensitive_new_key");
      expect(String(error)).not.toContain("private enum");
    }
  }
});
it("rejects unreviewed and conflicting classifications", () => {
  expect(() => sanitizeFixture({ data: { value: 1 }, valueClasses: {} }, { data: { value: 2 } }, observedAt)).toThrow("classification");
  const conflict = { ...existing, valueClasses: { ...existing.valueClasses, "data[1].owner": { valueClass: "id" } }, data: [...existing.data, { owner: "id" }] };
  expect(() => sanitizeFixture(conflict, { data: [] }, observedAt)).toThrow("Conflicting");
});
it("rejects account strings misclassified as public identifiers", () => {
  const fixture = { valueClasses: { id: { valueClass: "id" } }, id: "public-id" };
  expect(() => sanitizeFixture(fixture, { id: "private-name" }, observedAt, ["private-name"])).toThrow("outside");
});

it.each([false, true])("uses the reviewed non-null class regardless of null row order: %s", reverse => {
  const rows = [
    { owner: null, amount: null },
    { owner: "sample-account-a", amount: 1 },
  ];
  if (reverse) rows.reverse();
  const valueClasses = Object.fromEntries(rows.flatMap((row, index) => [
    ["data[" + index + "].owner", { valueClass: row.owner === null ? "opaque" : "name" }],
    ["data[" + index + "].amount", { valueClass: row.amount === null ? "id" : "numeric" }],
  ]));
  const result = sanitizeFixture({ data: rows, valueClasses }, {
    data: [{ owner: "private-owner", amount: 2 }, { owner: null, amount: null }],
  }, observedAt);
  expect(result).toMatchObject({
    data: [{ owner: "sample-account-1", amount: 2 }, { owner: null, amount: null }],
    valueClasses: { "data[0].owner": { valueClass: "name" }, "data[1].amount": { valueClass: "numeric" } },
  });
  expect(JSON.stringify(result)).not.toContain("private-owner");
});
it("does not infer a numeric class from a null-only opaque field", () => {
  const fixture = { data: [null], valueClasses: { "data[0]": { valueClass: "opaque" } } };
  expect(() => sanitizeFixture(fixture, { data: [42] }, observedAt)).toThrow("Invalid text type");
});
it("keeps rejecting non-null class conflicts even when a null occurs first", () => {
  const fixture = {
    data: [null, "sample-account-a", "public-id"],
    valueClasses: {
      "data[0]": { valueClass: "opaque" }, "data[1]": { valueClass: "name" }, "data[2]": { valueClass: "id" },
    },
  };
  expect(() => sanitizeFixture(fixture, { data: [] }, observedAt)).toThrow("Conflicting");
});

it.each([true, false, 42])("preserves only an already-reviewed opaque scalar: %s", value => {
  const fixture = { data: { value }, valueClasses: { "data.value": { valueClass: "opaque" } } };
  expect(sanitizeFixture(fixture, { data: { value } }, observedAt)).toMatchObject({ data: { value } });
  const changed = typeof value === "boolean" ? !value : 43;
  expect(() => sanitizeFixture(fixture, { data: { value: changed } }, observedAt)).toThrow();
  expect(() => sanitizeFixture(fixture, { data: { value: {} } }, observedAt)).toThrow();
});
it("continues redacting opaque strings even when their original value was reviewed", () => {
  const fixture = { data: { value: "private text" }, valueClasses: { "data.value": { valueClass: "opaque" } } };
  expect(sanitizeFixture(fixture, { data: { value: "private text" } }, observedAt)).toMatchObject({ data: { value: "[redacted]" } });
});
