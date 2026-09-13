import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflows = [
  { file: "drift-check.yml", job: "drift-check", cron: "17 2 * * *", contents: "read", command: "npx tsx scripts/drift-check.ts --publish" },
  { file: "spec-diff.yml", job: "spec-diff", cron: "23 3 * * 1", contents: "write", command: "npx tsx scripts/spec-diff.ts --publish" },
  { file: "fixture-refresh.yml", job: "fixture-refresh", cron: "41 4 1 * *", contents: "write", command: "npx tsx scripts/fixture-refresh.ts --publish" },
];

describe("maintenance workflow artifacts", () => {
  for (const workflow of workflows) {
    it(`parses ${workflow.file} with its scheduled job and command`, () => {
      const text = readFileSync(new URL(`../.github/workflows/${workflow.file}`, import.meta.url), "utf8");
      expect(text).toContain(`cron: "${workflow.cron}"`);
      expect(text).toContain(`  ${workflow.job}:`);
      expect(text).toContain(`  contents: ${workflow.contents}`);
      if (workflow.contents === "write") expect(text).toContain("  pull-requests: write");
      else expect(text).not.toContain("pull-requests: write");
      expect(text).toContain(workflow.command);
      expect(text).toContain("npm ci");
      expect(text).toContain("timeout-minutes: 15");
      expect(text).toContain("cancel-in-progress: false");
      for (const match of text.matchAll(/uses: ([^\n]+)/g)) {
        expect(match[1]).toMatch(/@[a-f0-9]{40}(?: |$)/);
      }
    });
  }
});

it("keeps pull-request CI read-only and enables full privacy checks", () => {
  const text = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  expect(text).toContain("contents: read");
  expect(text).not.toContain(": write");
  expect(text).not.toContain("pull_request_target");
  expect(text).toContain("npm run leak-check:full");
  expect(text).toContain("timeout-minutes: 15");
});
