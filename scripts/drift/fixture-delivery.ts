import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeFixtureRenewal, type RenewalPlan } from "./renewal.js";
import { writeRenewedFixture } from "./fixture-files.js";

export type DeliveryCommand = (command: string, args: string[]) => string;
export const deliveryCommand: DeliveryCommand = (command, args) => execFileSync(command, args, {
  encoding: "utf8", timeout: command === "npm" ? 600_000 : 30_000,
  maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
});

export function reviewDeliveryPreflight(repository: string, prefix: "fixture-renewal" | "spec-review", run: DeliveryCommand = deliveryCommand): boolean {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.includes("..")) throw new Error("Invalid repository.");
  if (run("git", ["status", "--porcelain"]).trim()) throw new Error("Review delivery requires a clean checkout.");
  const remote = run("git", ["remote", "get-url", "origin"]).trim();
  if (remote !== "https://github.com/" + repository + ".git" && remote !== "https://github.com/" + repository) throw new Error("Unexpected publishing remote.");
  const raw: unknown = JSON.parse(run("gh", ["pr", "list", "--repo", repository, "--state", "open", "--limit", "100", "--json", "headRefName"]));
  if (!Array.isArray(raw) || raw.length >= 100 || raw.some(row => !row || typeof row.headRefName !== "string")) throw new Error("Cannot verify existing review branches.");
  return !raw.some(row => row.headRefName.startsWith("codex/" + prefix + "-"));
}

export function fixtureDeliveryPreflight(repository: string, run: DeliveryCommand = deliveryCommand): boolean {
  return reviewDeliveryPreflight(repository, "fixture-renewal", run);
}

export async function deliverFixtures(root: string, repository: string, runId: string, plan: RenewalPlan,
  run: DeliveryCommand = deliveryCommand,
  writer: (path: string, contents: string) => void = (path, contents) => writeRenewedFixture(root, path, contents),
): Promise<"held" | "unchanged" | "review-opened"> {
  if (plan.blockedByHoldFloor) return "held";
  return deliverReview(repository, runId, "fixture-renewal",
    [...plan.writes, ...plan.pendingWrites].map(item => item.path),
    () => executeFixtureRenewal(plan, writer),
    "Refresh reviewed API fixtures",
    "Refresh bounded API captures after sanitization and local validation. Review fixture changes and any pending shape changes before merging. No release or merge is automatic.",
    run);
}

export async function deliverReview(repository: string, runId: string, prefix: "fixture-renewal" | "spec-review",
  allowedPaths: string[], prepare: () => void | Promise<unknown>, title: string, body: string,
  run: DeliveryCommand = deliveryCommand,
): Promise<"held" | "unchanged" | "review-opened"> {
  if (!/^[0-9]{1,24}$/.test(runId)) throw new Error("Invalid workflow run identifier.");
  if (!reviewDeliveryPreflight(repository, prefix, run)) return "held";
  const allowed = new Set(allowedPaths);
  if (allowed.size === 0) return "unchanged";
  await prepare();
  run("npm", ["run", "leak-check:full"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["run", "lint"]);
  run("npm", ["test"]);
  const changed = run("git", ["diff", "--name-only", "-z"]).split("\0").filter(Boolean);
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  const paths = [...new Set([...changed, ...untracked])];
  if (paths.some(path => !allowed.has(path))) throw new Error("Unexpected file change during review validation.");
  if (paths.length === 0) return "unchanged";
  const branch = "codex/" + prefix + "-" + runId;
  run("git", ["switch", "-c", branch]);
  run("git", ["add", "--", ...paths]);
  run("git", ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit", "-m", title]);
  run("git", ["push", "origin", "HEAD:refs/heads/" + branch]);
  const temp = mkdtempSync(join(tmpdir(), "fixture-review-"));
  try {
    const bodyFile = join(temp, "body.md");
    writeFileSync(bodyFile, body + "\n");
    run("gh", ["pr", "create", "--repo", repository, "--head", branch, "--title", title, "--body-file", bodyFile]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
  return "review-opened";
}
