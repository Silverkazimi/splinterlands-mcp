import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("ships linked public documentation and only the intended package surfaces", () => {
 const root = fileURLToPath(new URL("../", import.meta.url));
 const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: root, encoding: "utf8", timeout: 15000, env: { ...process.env, npm_config_offline: "true" },
 })) as Array<{ files: Array<{ path: string }> }>;
 const paths = new Set(packed[0]!.files.map(file => file.path));
 for (const expected of ["dist/index.js", "package.json", "LICENSE", "README.md", "CHANGELOG.md", "library/index.md"]) {
  expect(paths.has(expected), expected).toBe(true);
 }
 for (const path of paths) {
  expect(path === "package.json" || path === "README.md" || path === "LICENSE" || path === "CHANGELOG.md"
   || path.startsWith("dist/") || path.startsWith("library/"), path).toBe(true);
  if (!path.endsWith(".md")) continue;
  const text = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
   const target = match[1]!;
   if (target.includes("://") || target.startsWith("#")) continue;
   const resolved = posix.normalize(posix.join(dirname(path), target.split("#")[0]!));
   expect(paths.has(resolved), path + " links to unpackaged " + resolved).toBe(true);
  }
 }
 const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
 for (const match of readme.matchAll(/library\/[A-Za-z0-9_./-]+/g)) {
  const target = match[0].replace(/\.+$/, "");
  expect(paths.has(target), "README references unpackaged " + target).toBe(true);
 }
}, 20000);
