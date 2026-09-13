import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DriftLabelSchema } from "./types.js";

type Issue = { number: number; body: string | null; labels?: Array<{ name: string }> };
export const ISSUE_SCAN_LIMIT = 500;
export type GithubCommand = (args: string[]) => string;
export const runGithub: GithubCommand = args => execFileSync("gh", args, {
  encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
});

export function publishMaintenanceIssue(repository: string, key: string, title: string, body: string, run: GithubCommand = runGithub, labels: string[] = []): "created" | "updated" | "unchanged" {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.includes("..")) throw new Error("Invalid repository.");
  if (!/^[a-z][a-z0-9-]{0,60}$/.test(key)) throw new Error("Invalid maintenance key.");
  if (body.length > 40_000 || title.length > 200) throw new Error("Maintenance report exceeds limits.");
  for (const label of labels) DriftLabelSchema.parse(label);
  const marker = "<!-- maintenance:" + key + " -->";
  const content = marker + "\n" + body;
  const raw: unknown = JSON.parse(run(["issue", "list", "--repo", repository, "--state", "open", "--limit", String(ISSUE_SCAN_LIMIT), "--json", "number,body,labels"]));
  if (!Array.isArray(raw) || raw.length >= ISSUE_SCAN_LIMIT || raw.some(row => !row || !Number.isInteger(row.number) || row.number <= 0 || (row.body !== null && typeof row.body !== "string"))) {
    throw new Error("Cannot safely deduplicate maintenance issues.");
  }
  const matches = (raw as Issue[]).filter(row => row.body?.startsWith(marker + "\n"));
  if (matches.length > 1) throw new Error("Ambiguous maintenance issue.");
  const existing = matches[0];
  if (labels.length && existing && (!Array.isArray(existing.labels) || existing.labels.some(label => typeof label.name !== "string"))) throw new Error("Invalid issue labels.");
  const currentLabels = existing?.labels?.map(label => label.name) ?? [];
  const remove = labels.length ? currentLabels.filter(label => DriftLabelSchema.safeParse(label).success && !labels.includes(label)) : [];
  const add = labels.filter(label => !currentLabels.includes(label));
  if (existing?.body === content && add.length === 0 && remove.length === 0) return "unchanged";
  if (labels.length) {
    const listed: unknown = JSON.parse(run(["label", "list", "--repo", repository, "--limit", "100", "--json", "name"]));
    if (!Array.isArray(listed) || listed.length >= 100 || listed.some(label => !label || typeof label.name !== "string")) throw new Error("Cannot verify maintenance labels.");
    for (const label of labels) {
      if (!listed.some(row => row.name === label)) run(["label", "create", label, "--repo", repository, "--color", label === "drift:auth" ? "D73A4A" : "FBCA04", "--description", "Dated upstream maintenance observation"]);
    }
  }
  const temp = mkdtempSync(join(tmpdir(), "maintenance-issue-"));
  try {
    const path = join(temp, "body.md");
    writeFileSync(path, content);
    if (existing) {
      run(["issue", "edit", String(existing.number), "--repo", repository, "--body-file", path,
        ...add.flatMap(label => ["--add-label", label]), ...remove.flatMap(label => ["--remove-label", label])]);
      return "updated";
    }
    run(["issue", "create", "--repo", repository, "--title", title, "--body-file", path,
      ...labels.flatMap(label => ["--label", label])]);
    return "created";
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
