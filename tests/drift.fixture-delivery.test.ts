import { expect, it } from "vitest";
import { deliverFixtures, fixtureDeliveryPreflight, DeliveryValidationError, type DeliveryCommand } from "../scripts/drift/fixture-delivery.js";
import { planFixtureRenewal } from "../scripts/drift/renewal.js";

const path = "tests/fixtures/sample.fixture.json";
const plan = () => planFixtureRenewal([{ fixturePath: path, entryId: "api.test.sample", existing: { n: 1 }, recaptured: { n: 2 } }]);
function mock(options: { failTests?: boolean; review?: boolean; unexpected?: boolean } = {}) {
  const commands: string[][] = [];
  const run: DeliveryCommand = (command, args) => {
    commands.push([command, ...args]);
    if (args[0] === "status") return "";
    if (args[0] === "remote") return "https://github.com/example/server.git";
    if (command === "gh" && args[0] === "pr" && args[1] === "list") return options.review ? '[{"headRefName":"codex/fixture-renewal-1"}]' : "[]";
    if (command === "npm" && args[0] === "test" && options.failTests) throw new Error("Test failed");
    if (args[0] === "diff") return options.unexpected ? "src/index.ts" : path;
    return "";
  };
  return { commands, run };
}
it("validates prepared files before creating a branch or pushing", async () => {
  const { commands, run } = mock();
  const writes: string[] = [];
  expect(await deliverFixtures(".", "example/server", "123", plan(), run, path => { writes.push(path); })).toBe("review-opened");
  expect(writes).toEqual([path]);
  const test = commands.findIndex(args => args[0] === "npm" && args[1] === "test");
  const push = commands.findIndex(args => args[0] === "git" && args[1] === "push");
  expect(test).toBeGreaterThan(-1);
  expect(push).toBeGreaterThan(test);
  expect(commands.find(args => args[0] === "gh" && args[2] === "create")).toContain("--body-file");
});
it("does not push when tests fail or unrelated files change", async () => {
  for (const options of [{ failTests: true }, { unexpected: true }]) {
    const { commands, run } = mock(options);
    await expect(deliverFixtures(".", "example/server", "123", plan(), run, () => {})).rejects.toThrow();
    expect(commands.some(args => args[1] === "push")).toBe(false);
  }
});
it("does not overwrite an existing review branch or write held captures", async () => {
  const { run } = mock({ review: true });
  expect(fixtureDeliveryPreflight("example/server", run)).toBe(false);
  let writes = 0;
  expect(await deliverFixtures(".", "example/server", "123", plan(), run, () => { writes++; })).toBe("held");
  expect(writes).toBe(0);
});

it("reports a fixed validation stage without propagating captured command output", async () => {
  const { run, commands } = mock();
  const failing: DeliveryCommand = (command, args) => {
    if (command === "npm" && args[0] === "test") {
      throw Object.assign(new Error("private-response-marker"), { stdout: "private-response-marker", stderr: "private-response-marker" });
    }
    return run(command, args);
  };
  const error = await deliverFixtures(".", "example/server", "123", plan(), failing, () => {}).catch(error => error);
  expect(error).toBeInstanceOf(DeliveryValidationError);
  expect(error.stage).toBe("tests");
  expect(String(error)).not.toContain("private-response-marker");
  expect(JSON.stringify(error)).not.toContain("private-response-marker");
  expect(commands.some(args => args[1] === "push")).toBe(false);
});
