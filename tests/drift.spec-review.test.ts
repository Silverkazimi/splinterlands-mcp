import { expect, it } from "vitest";
import { specificationReviewFiles, deliverSpecificationReview, type SpecificationSet } from "../scripts/drift/spec-review.js";
import type { DeliveryCommand } from "../scripts/drift/fixture-delivery.js";

const specs: SpecificationSet = {
  api: { paths: { "/cards": { get: { description: "UNREVIEWED", example: "DO_NOT_PUBLISH", security: [{ jwt: [] }] }, post: {} } } },
  vapi: { paths: { "/land": { get: {} } } },
};

it("retains declaration methods and fingerprints without publishing examples or promoting access", () => {
  const files = specificationReviewFiles(specs);
  const text = [...files.values()].join("");
  expect(text).not.toContain("DO_NOT_PUBLISH");
  expect(text).not.toContain("UNREVIEWED");
  expect(text).not.toContain("jwt");
  const catalog = JSON.parse(files.get("scripts/drift/spec-declarations.json")!);
  expect(catalog.declarations.find((row: { source: string }) => row.source === "api").methods).toEqual(["get", "post"]);
  expect(files.has("src/catalogue/catalogue.json")).toBe(false);
  expect(specificationReviewFiles(specs)).toEqual(files);
});

it("refuses partial specifications and unsafe route names", () => {
  expect(() => specificationReviewFiles({ ...specs, api: { paths: {} } })).toThrow();
  expect(() => specificationReviewFiles({ ...specs, api: { paths: { "/account?secret=x": {} } } })).toThrow();
});

function mock(options: { review?: boolean; fail?: boolean; unrelated?: boolean; unchanged?: boolean } = {}) {
  const commands: string[][] = [];
  const run: DeliveryCommand = (command, args) => {
    commands.push([command, ...args]);
    if (args[0] === "status") return "";
    if (args[0] === "remote") return "https://github.com/example/server.git";
    if (command === "gh" && args[1] === "list") return options.review ? '[{"headRefName":"codex/spec-review-1"}]' : "[]";
    if (command === "npm" && args[0] === "test" && options.fail) throw new Error("Validation failed");
    if (args[0] === "diff") return options.unchanged ? "" : options.unrelated ? "src/index.ts" : "scripts/drift/spec-baseline.json";
    return "";
  };
  return { run, commands };
}

it("regenerates curated runtime input and validates before the specification PR push", async () => {
  const { run, commands } = mock();
  const writes: string[] = [];
  expect(await deliverSpecificationReview(".", "example/server", "42", specs, run, path => { writes.push(path); })).toBe("review-opened");
  expect(writes).toHaveLength(3);
  const regeneration = commands.findIndex(args => args.includes("scripts/gen-catalogue.ts"));
  const validation = commands.findIndex(args => args[0] === "npm" && args[1] === "test");
  const push = commands.findIndex(args => args[1] === "push");
  expect(regeneration).toBeGreaterThan(-1);
  expect(validation).toBeGreaterThan(regeneration);
  expect(push).toBeGreaterThan(validation);
  expect(commands[push]).toContain("HEAD:refs/heads/codex/spec-review-42");
});

it("holds existing reviews and never pushes after failed validation, unexpected edits or no changes", async () => {
  for (const options of [{ review: true }, { fail: true }, { unrelated: true }, { unchanged: true }]) {
    const { run, commands } = mock(options);
    let writes = 0;
    const result = deliverSpecificationReview(".", "example/server", "42", specs, run, () => { writes++; });
    if (options.fail || options.unrelated) await expect(result).rejects.toThrow();
    else expect(await result).toBe(options.review ? "held" : "unchanged");
    expect(commands.some(args => args[1] === "push")).toBe(false);
    if (options.review) expect(writes).toBe(0);
  }
});
