import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runNightly, summarizeNightly } from "./drift/nightly.js";
import { publishNightly } from "./drift/nightly-delivery.js";
import { resolveMaintenanceInputs, configuredAccountRoles, missingAccountRoles } from "./drift/configuration.js";
import { bindSweepInputs } from "./drift/request.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";
import type { DriftBaseline } from "./drift/types.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--publish", "--validate-only"].includes(arg)) || args.length > 1) throw new Error("Invalid flags.");
  const publish = args.includes("--publish");
  const missingRoles = missingAccountRoles(process.env);
  if (publish && missingRoles.length) {
    console.log(JSON.stringify({ status: "configuration-required", missingRoles, complete: false }));
    process.exitCode = 1;
    return;
  }
  const config = process.env.MCP_DRIFT_INPUTS;
  if (!config || Buffer.byteLength(config) > 256 * 1024) {
    console.log(JSON.stringify({ status: "configuration-required", complete: false }));
    process.exitCode = 1;
    return;
  }
  const inputs = resolveMaintenanceInputs(JSON.parse(config), process.env);
  if (args.includes("--validate-only")) {
    const bound = bindSweepInputs(inputs);
    const ids = new Set(bound.map(item => item.entryId));
    const missing = [...new Set<string>(Object.values(TOOL_ENTRY_IDS))].filter(id => !ids.has(id));
    console.log(JSON.stringify({ mode: "validation", networkRequests: 0, configured: ids.size,
      unconfigured: missing, configuredRoles: configuredAccountRoles(process.env), missingRoles, complete: missing.length === 0 && missingRoles.length === 0 }));
    if (missing.length || missingRoles.length) process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(resolve("scripts/drift/baseline.json"), "utf8")) as DriftBaseline;
  if (publish) await delay(Math.floor(Math.random() * 30_000));
  const result = await runNightly(inputs, baseline);
  const report = summarizeNightly(result);
  if (publish) publishNightly(result, baseline, process.env.GITHUB_REPOSITORY ?? "");
  console.log(JSON.stringify(report));
  if (!report.complete || report.issues.length > 0) process.exitCode = 1;
}

main().catch(() => {
  console.error("Nightly drift check failed; configuration and response details are withheld.");
  process.exitCode = 1;
});
