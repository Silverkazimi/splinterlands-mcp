import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchPublishedSpecification, SPEC_SOURCES } from "./drift/spec-source.js";
import { fingerprintSpec, parseSpec, planSpecDiff } from "./drift/spec-diff.js";
import { deliverSpecificationReview, type SpecificationSet } from "./drift/spec-review.js";
import { reviewDeliveryPreflight } from "./drift/fixture-delivery.js";
import { publishMaintenanceIssue, runGithub } from "./drift/github.js";

const args = process.argv.slice(2);
if (args.some(arg => !["--publish", "--initialize-baseline"].includes(arg))
  || new Set(args).size !== args.length || args.length > 1) throw new Error("Use no flags, --publish, or --initialize-baseline.");
const publishing = args.includes("--publish");
const repository = process.env.GITHUB_REPOSITORY ?? "";
if (publishing && process.env.GITHUB_ACTIONS !== "true") throw new Error("Publishing requires a workflow checkout.");
if (publishing && !reviewDeliveryPreflight(repository, "spec-review")) {
  console.log(JSON.stringify({ kind: "held", reason: "existing-specification-review" }));
  process.exit(0);
}
const specifications: Partial<SpecificationSet> = {};
let anyChanged = false;
for (const source of ["vapi", "api"] as const) {
  const url = SPEC_SOURCES[source];
  const baselinePath = resolve(source === "vapi" ? "scripts/drift/spec-baseline.json" : "scripts/drift/spec-baseline-api.json");
  const fetched = await fetchPublishedSpecification(fetch, source);
  if (!fetched.ok) {
    const report = "The public specification could not be compared. Failure category: " + fetched.reason + ".";
    if (args.includes("--publish")) publishMaintenanceIssue(process.env.GITHUB_REPOSITORY ?? "", "spec-review-" + source, "API specification review", report, runGithub, ["drift:spec-unreachable"]);
    console.log(JSON.stringify({ source, kind: "unreachable", reason: fetched.reason }));
    process.exitCode = 1;
  } else {
    const parsed = parseSpec(fetched.body);
    if (!parsed || Object.keys(parsed.paths).length === 0
      || Object.keys(parsed.paths).some(path => path.length > 200 || !/^\/[A-Za-z0-9_{}./:*-]*$/.test(path))) throw new Error("Unsupported specification path structure.");
    specifications[source] = parsed;
    const current = fingerprintSpec(parsed);
    if (args.includes("--initialize-baseline")) {
      writeFileSync(baselinePath, JSON.stringify({ source: url, capturedAt: new Date().toISOString(), ...current }, null, 2) + "\n");
      console.log(JSON.stringify({ source, kind: "baseline-recorded", paths: Object.keys(current.paths).length }));
    } else {
      const baseline = parseSpec(readFileSync(baselinePath, "utf8"));
      if (!baseline) throw new Error("Invalid specification baseline.");
      const plan = planSpecDiff({ ok: true, url, body: JSON.stringify(current) }, baseline);
      if (plan.kind === "unreachable") {
        if (args.includes("--publish")) publishMaintenanceIssue(process.env.GITHUB_REPOSITORY ?? "", "spec-review-" + source, "API specification review", "Specification shrink guard prevented comparison. Review the upstream response before changing the baseline.", runGithub, ["drift:spec-unreachable"]);
        console.log(JSON.stringify({ source, kind: "held", reason: "specification-shrink" }));
        process.exitCode = 1;
      } else {
        const delta = plan.catalogueDelta;
        const changed = delta.added.length + delta.removed.length + delta.changed.length > 0;
        anyChanged ||= changed;
        console.log(JSON.stringify({ source, kind: "compared", ...delta }));
      }
    }
  }
}
if (publishing && anyChanged && !process.exitCode && specifications.api && specifications.vapi) {
  const delivery = await deliverSpecificationReview(process.cwd(), repository, process.env.GITHUB_RUN_ID ?? "",
    { api: specifications.api, vapi: specifications.vapi });
  console.log(JSON.stringify({ kind: delivery }));
}
