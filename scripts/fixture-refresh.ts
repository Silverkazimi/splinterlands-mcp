import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRecaptureInputs, fixtureCoverage } from "./drift/fixture-files.js";
import { recaptureFixtures } from "./drift/recapture.js";
import { deliverFixtures, fixtureDeliveryPreflight } from "./drift/fixture-delivery.js";
import { resolveMaintenanceInputs, configuredAccountRoles, missingAccountRoles } from "./drift/configuration.js";
import { publishMaintenanceIssue } from "./drift/github.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--publish", "--validate-only"].includes(arg))) throw new Error("Invalid flags.");
  const publish = args.includes("--publish");
  const missingRoles = missingAccountRoles(process.env);
  if (publish && missingRoles.length) {
    console.log(JSON.stringify({ status: "configuration-required", missingRoles, complete: false }));
    process.exitCode = 1;
    return;
  }
  const raw = process.env.MCP_FIXTURE_INPUTS;
  if (!raw || Buffer.byteLength(raw) > 256 * 1024) {
    console.log(JSON.stringify({ status: "configuration-required", complete: false }));
    process.exitCode = 1;
    return;
  }
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  if (publish) {
    if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Automatic fixture publication requires an Actions checkout.");
    if (!fixtureDeliveryPreflight(repository)) {
      console.log(JSON.stringify({ status: "existing-review", complete: false }));
      return;
    }
  }
  const inputs = loadRecaptureInputs(process.cwd(), resolveMaintenanceInputs(JSON.parse(raw), process.env));
  const bindings = JSON.parse(readFileSync(resolve("scripts/drift/baseline-input.json"), "utf8")) as Record<string, { entryId: string }>;
  if (args.includes("--validate-only")) {
    const coverage = fixtureCoverage(bindings, new Set(inputs.map(input => input.fixturePath.replace("tests/fixtures/", ""))));
    console.log(JSON.stringify({ mode: "validation", networkRequests: 0, ...coverage,
      configuredRoles: configuredAccountRoles(process.env), missingRoles, complete: coverage.unconfigured.length === 0 && missingRoles.length === 0 }));
    if (coverage.unconfigured.length || missingRoles.length) process.exitCode = 1;
    return;
  }
  const result = await recaptureFixtures(inputs);
  const configured = new Set(inputs.map(input => input.fixturePath.replace("tests/fixtures/", "")));
  const coverage = fixtureCoverage(bindings, configured);
  const unconfigured = coverage.unconfigured;
  const report = {
    reads: result.reads, configured: result.total, ...coverage,
    aborted: result.aborted, holdFraction: result.plan.holdFraction,
    held: result.plan.blockedByHoldFloor, failed: result.failed, sampleCoverage: result.coverageGaps,
    refreshes: result.plan.writes.length, pending: result.plan.pendingWrites.length,
  };
  console.log(JSON.stringify(report));
  if (publish) {
    if (result.coverageGaps.length > 0) {
      publishMaintenanceIssue(repository, "fixture-sample-coverage", "Fixture sample coverage needs review",
        "Successful responses no longer match the fixture's empty/populated sample state. Original fixtures are preserved. Review the sample account or query; this is not evidence of an API failure or proof of a sale.\n\n" + JSON.stringify(result.coverageGaps, null, 2));
    }
    if (result.failed.length > 0 || (result.plan.blockedByHoldFloor && result.coverageGaps.length === 0) || unconfigured.length > 0) {
      publishMaintenanceIssue(repository, "fixture-review", "Fixture renewal review", JSON.stringify(report, null, 2));
    }
    await deliverFixtures(process.cwd(), repository, process.env.GITHUB_RUN_ID ?? "", result.plan);
  }
  if (result.failed.length > 0 || result.plan.blockedByHoldFloor || result.coverageGaps.length > 0 || unconfigured.length > 0) process.exitCode = 1;
}
main().catch(() => {
  console.error("Fixture renewal failed; configuration and response details are withheld.");
  process.exitCode = 1;
});
