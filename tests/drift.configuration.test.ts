import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { ACCOUNT_ROLES, accountParameterNames, configuredAccountRoles, resolveMaintenanceInputs } from "../scripts/drift/configuration.js";
import { bindSweepInputs } from "../scripts/drift/request.js";

const entryId = "api.battle.battle-queue";
const config = [{ entryId, params: { username: { accountRole: "ACCOUNT_SMALL" } } }];
const environment = Object.fromEntries(ACCOUNT_ROLES.map(role => [role, "sample-account"]));

it("resolves explicit account selectors without mutating the recipe", () => {
  const resolved = resolveMaintenanceInputs(config, environment);
  expect(resolved[0]!.params.username).toBe("sample-account");
  expect(config[0]!.params.username).toEqual({ accountRole: "ACCOUNT_SMALL" });
  expect(bindSweepInputs(resolved)).toHaveLength(1);
  expect(configuredAccountRoles(environment)).toEqual(ACCOUNT_ROLES);
});

it("rejects missing roles, non-account substitutions and unresolved template objects", () => {
  expect(() => resolveMaintenanceInputs(config, {})).toThrow("Account role is missing or invalid");
  expect(() => resolveMaintenanceInputs([{ entryId, params: { limit: { accountRole: "ACCOUNT_SMALL" } } }], environment)).toThrow("account selector");
  expect(() => resolveMaintenanceInputs([{ entryId, params: { username: { required: "username" } } }], environment)).toThrow();
  expect(() => resolveMaintenanceInputs(config, { ACCOUNT_SMALL: "https://example.test" })).toThrow();
});

it("validates a partial nightly recipe offline without printing account names", () => {
  const code = 'globalThis.fetch = async () => { console.log("NETWORK_ATTEMPT"); throw new Error("network forbidden"); }; process.argv = ["node", "scripts/drift-check.ts", "--validate-only"]; await import("./scripts/drift-check.ts");';
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    env: { ...process.env, ...environment, MCP_DRIFT_INPUTS: JSON.stringify(config) },
  });
  expect(child.status).toBe(1);
  expect(child.stdout).not.toContain("NETWORK_ATTEMPT");
  expect(child.stdout).not.toContain("sample-account");
  const report = JSON.parse(child.stdout.trim());
  expect(report.mode).toBe("validation");
  expect(report.networkRequests).toBe(0);
  expect(report.complete).toBe(false);
  expect(report.configuredRoles).toEqual(ACCOUNT_ROLES);
  expect(report.missingRoles).toEqual([]);
  expect(report.unconfigured.length).toBeGreaterThan(100);
}, 25_000);

it("generates full templates with unresolved inputs that cannot accidentally be executed", () => {
  for (const [mode, expected] of [["nightly", 169], ["fixtures", 239]] as const) {
    const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/maintenance-template.ts", mode], {
      cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    });
    expect(child.status).toBe(0);
    const rows = JSON.parse(child.stdout);
    expect(rows).toHaveLength(expected);
    expect(() => resolveMaintenanceInputs(rows, environment)).toThrow();
    expect(child.stdout).not.toContain("sample-account");
  }
}, 45_000);


it("validates monthly fixture bindings offline and refuses missing role secrets before publication", () => {
  const fixtureConfig = [{ fixturePath: "tests/fixtures/land-deeds-owned-none.fixture.json",
    entryId: "vapi.land.deeds.owned", params: { player: { accountRole: "ACCOUNT_NONE" } } }];
  const env = { ...process.env, ...environment, MCP_FIXTURE_INPUTS: JSON.stringify(fixtureConfig) };
  const code = 'globalThis.fetch = async () => { console.log("NETWORK_ATTEMPT"); throw new Error("network forbidden"); }; process.argv = ["node", "scripts/fixture-refresh.ts", "--validate-only"]; await import("./scripts/fixture-refresh.ts");';
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000, env,
  });
  expect(child.status).toBe(1);
  expect(child.stdout).not.toContain("NETWORK_ATTEMPT");
  expect(child.stdout).not.toContain("sample-account");
  expect(JSON.parse(child.stdout.trim())).toMatchObject({ mode: "validation", networkRequests: 0, complete: false });
  const publish = spawnSync(process.execPath, ["--import", "tsx", "scripts/drift-check.ts", "--publish"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    env: { ...process.env, ...Object.fromEntries(ACCOUNT_ROLES.map(role => [role, ""])), MCP_DRIFT_INPUTS: JSON.stringify(config) },
  });
  expect(publish.status).toBe(1);
  expect(JSON.parse(publish.stdout.trim())).toMatchObject({ status: "configuration-required", missingRoles: ACCOUNT_ROLES });
}, 45_000);

it("does not require an inert account selector for a card-ID-scoped route", () => {
  expect(accountParameterNames("api.cards.history").has("username")).toBe(false);
  expect(bindSweepInputs([{ entryId: "api.cards.history", params: { id: "sample-card" } }])).toHaveLength(1);
  expect(() => resolveMaintenanceInputs([{ entryId: "api.cards.history",
    params: { id: "sample-card", username: { accountRole: "ACCOUNT_SMALL" } } }], environment)).toThrow("account selector");
});

it("distinguishes an item name filter from the profile account name", () => {
  expect(accountParameterNames("vapi.land.stake.items-grouped").has("name")).toBe(false);
  expect(accountParameterNames("vapi.land.stake.items-grouped").has("player")).toBe(true);
  expect(accountParameterNames("api.players.details").has("name")).toBe(true);
});
