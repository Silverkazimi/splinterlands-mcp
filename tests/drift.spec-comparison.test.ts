import { expect, it } from "vitest";
import { parseSpec, planSpecDiff, specDiffExitCode } from "../scripts/drift/spec-diff.js";

const fetched = (paths: Record<string, unknown>, components: unknown = {}) => ({
  ok: true as const, url: "https://vapi.splinterlands.com/swagger.json",
  body: JSON.stringify({ paths, components }),
});
it("detects additions, removals and changed operations against the retained spec", () => {
  const baseline = parseSpec(JSON.stringify({ paths: { "/a": { get: { summary: "old" } }, "/b": {} } }))!;
  const plan = planSpecDiff(fetched({ "/a": { get: { summary: "new" } }, "/c": {} }), baseline);
  expect(plan.kind).toBe("compared");
  if (plan.kind !== "compared") return;
  expect(plan.catalogueDelta).toMatchObject({ added: ["/c"], removed: ["/b"], changed: ["/a"] });
  expect(specDiffExitCode(plan)).toBe(1);
});
it("ignores object key order and notices shared schema changes", () => {
  const baseline = parseSpec(JSON.stringify({ paths: { "/a": { get: { x: 1, y: 2 } } }, components: { schemas: { A: { type: "string" } } } }))!;
  const same = planSpecDiff(fetched({ "/a": { get: { y: 2, x: 1 } } }, baseline.components), baseline);
  expect(specDiffExitCode(same)).toBe(0);
  const changed = planSpecDiff(fetched({ "/a": { get: { y: 2, x: 1 } } }, { schemas: { A: { type: "number" } } }), baseline);
  expect(changed.kind === "compared" && changed.catalogueDelta.changed).toEqual(["/a"]);
});

it("detects shared global security changes with unchanged paths", () => {
  const before = parseSpec(JSON.stringify({ paths: { "/sample": {} }, security: [{ jwt: [] }] }))!;
  const after = JSON.stringify({ paths: { "/sample": {} }, security: [] });
  const plan = planSpecDiff({ ok: true, url: "https://api2.splinterlands.com/doc/swagger-ui-init.js", body: after }, before);
  expect(plan.kind === "compared" && plan.catalogueDelta.changed).toEqual(["/sample"]);
});
