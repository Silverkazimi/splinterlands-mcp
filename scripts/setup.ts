import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookPath = join(root, ".githooks", "pre-push");

if (!existsSync(join(root, ".git"))) {
  console.log("Git hook setup skipped: no .git directory was found.");
  console.log("This only takes effect in a git working tree that has .githooks/pre-push.");
} else {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit",
  });

  if (existsSync(hookPath)) {
    chmodSync(hookPath, 0o755);
    console.log("Configured git core.hooksPath=.githooks and made .githooks/pre-push executable.");
  } else {
    console.log("Configured git core.hooksPath=.githooks, but .githooks/pre-push is missing.");
  }
  console.log("This only takes effect in a git working tree that has .githooks/pre-push.");
}
