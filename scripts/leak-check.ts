import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

type Pattern = {
  label: string;
  expression: RegExp;
  appliesTo?: (repositoryPath: string) => boolean;
};

const excludedDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
]);

const binaryExtensions = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".doc",
  ".docx",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".so",
  ".tar",
  ".tiff",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
]);

export const fixedPatterns: Pattern[] = [
  { label: "internal-identifier", expression: /\bFR-\d+\b/ },
  { label: "internal-identifier", expression: /\bIR-\d+\b/ },
  { label: "internal-identifier", expression: /\bS-\d+\b/ },
  {
    label: "internal-identifier",
    expression: /(?<![A-Za-z0-9_-])M\d{2,}(?:-M\d{2,})?(?![A-Za-z0-9_-])/,
    appliesTo: isUserVisiblePath,
  },
  { label: "internal-identifier", expression: /\bHK-\d{8}-[0-9a-fA-F]{4}\b/ },
  { label: "internal-identifier", expression: /Ticket:/ },
  { label: "internal-identifier", expression: /Co-Authored-By/ },
  { label: "internal-identifier", expression: /claude\.ai\/code/ },
  // The generic address shape stays broad, but RFC 2606 and RFC 6761 reserve .invalid, .test, .example, and .localhost as non-routable. This repository deliberately documents a placeholder identity in one of those domains, so exclude the reserved suffix set rather than one literal; removing this lookahead restores the false positive.
  { label: "personal", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(?!invalid\b|test\b|example\b|localhost\b)[A-Z]{2,}\b/i },
  { label: "home-path", expression: /\/home\/[a-z]+/ },
  { label: "home-path", expression: /\/mnt\/c\// },
  { label: "credential", expression: /Authorization/ },
  { label: "credential", expression: /\bBearer\b/ },
  { label: "credential", expression: /posting_key/i },
  { label: "credential", expression: /active_key/i },
  { label: "credential", expression: /PRIVATE_KEY/ },
  { label: "credential", expression: /keychain/i },
  { label: "credential", expression: /hive-tx/i },
  { label: "credential", expression: /\bdhive\b/i },
  { label: "credential", expression: /@hiveio/i },
  {
    label: "credential",
    expression: /process\.env\.[A-Z0-9_]*(KEY|SECRET|TOKEN)[A-Z0-9_]*/,
  },
];

const allowedRuntimeDependencies = new Set([
  "@modelcontextprotocol/sdk",
  "zod",
]);

const allowedDevelopmentDependencies = new Set([
  "@eslint/js",
  "@types/node",
  "eslint",
  "tsup",
  "tsx",
  "typescript",
  "typescript-eslint",
  "vitest",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dependencyNames(packageJson: unknown, field: string): string[] {
  if (!isRecord(packageJson)) {
    return [];
  }

  const dependencies = packageJson[field];
  return isRecord(dependencies) ? Object.keys(dependencies) : [];
}

function normalizedPath(filePath: string, root: string): string {
  return relative(root, filePath).split(sep).join("/");
}

function isUserVisiblePath(repositoryPath: string): boolean {
  return repositoryPath === "README.md" || repositoryPath === "CHANGELOG.md" || repositoryPath.startsWith("src/");
}

function maskAllowedFixtureValues(filePath: string, contents: string, root: string): string {
  if (!fixtureJsonPath.test(normalizedPath(filePath, root))) {
    return contents;
  }
  try {
    JSON.parse(contents);
  } catch {
    return contents;
  }

  // This is the owner's narrow ruling: the public game-region word is allowed only in fixture JSON values, never in keys, paths, prose, or source.
  const masked = contents.split("");
  let stringStart = -1;
  let escaped = false;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (stringStart === -1) {
      if (character === '"') {
        stringStart = index;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== '"') {
      continue;
    }

    let next = index + 1;
    while (/\s/.test(contents[next] ?? "")) next += 1;
    if (contents[next] !== ":") {
      const value = contents.slice(stringStart + 1, index);
      const maskedValue = value.replace(publicGameRegionPattern, (match) => " ".repeat(match.length));
      for (let offset = 0; offset < maskedValue.length; offset += 1) {
        masked[stringStart + 1 + offset] = maskedValue[offset] ?? masked[stringStart + 1 + offset] ?? "";
      }
    }
    stringStart = -1;
  }
  return masked.join("");
}

function isBinaryPath(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex >= 0 && binaryExtensions.has(filePath.slice(dotIndex).toLowerCase());
}

function collectFiles(directory: string, root: string, files: string[]): void {
  const entries: Dirent[] = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
      continue;
    }

    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(filePath, root, files);
    } else if (
      entry.isFile() &&
      !isBinaryPath(filePath) &&
      normalizedPath(filePath, root) !== "scripts/leak-check.ts"
    ) {
      files.push(filePath);
    }
  }
}

function globalExpression(expression: RegExp): RegExp {
  return new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`);
}

type Reporter = (message: string) => void;

function reportPatternMatches(
  value: string,
  patterns: Pattern[],
  report: (pattern: Pattern, matchedText: string) => void,
): number {
  let hits = 0;
  for (const pattern of patterns) {
    for (const match of value.matchAll(globalExpression(pattern.expression))) {
      report(pattern, match[0] ?? value);
      hits += 1;
    }
  }
  return hits;
}

function reportMatches(
  filePath: string,
  contents: string,
  patterns: Pattern[],
  root: string,
  report: Reporter,
): number {
  let hits = 0;
  const repositoryPath = normalizedPath(filePath, root);
  const applicablePatterns = patterns.filter((pattern) => pattern.appliesTo?.(repositoryPath) ?? true);
  hits += reportPatternMatches(repositoryPath, applicablePatterns, (pattern, matchedText) => {
    report(`${repositoryPath}: [${pattern.label}] path match ${matchedText}`);
  });
  const lines = maskAllowedFixtureValues(filePath, contents, root).split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of applicablePatterns) {
      for (const match of line.matchAll(globalExpression(pattern.expression))) {
        const matchedText = match[0] ?? line.trim();
        report(`${repositoryPath}:${index + 1}: [${pattern.label}] ${matchedText}`);
        hits += 1;
      }
    }
  });

  return hits;
}

function checkDependencies(root: string, report: Reporter): number {
  const packagePath = join(root, "package.json");
  const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
  const runtimeNames = dependencyNames(packageJson, "dependencies");
  const developmentNames = dependencyNames(packageJson, "devDependencies");
  const unexpectedRuntime = runtimeNames.filter((name) => !allowedRuntimeDependencies.has(name));
  const unexpectedDevelopment = developmentNames.filter(
    (name) => !allowedDevelopmentDependencies.has(name),
  );

  if (unexpectedRuntime.length === 0 && unexpectedDevelopment.length === 0) {
    return 0;
  }

  if (unexpectedRuntime.length > 0) {
    report(`package.json dependencies not allowlisted: ${unexpectedRuntime.join(", ")}`);
  }
  if (unexpectedDevelopment.length > 0) {
    report(
      `package.json devDependencies not allowlisted: ${unexpectedDevelopment.join(", ")}`,
    );
  }
  return unexpectedRuntime.length + unexpectedDevelopment.length;
}

const playerParameterMarkers = new Set(["isPlayerName"]);
const defaultPropertyNames = new Set(["default", "defaultValue"]);
const suppliedValuePropertyNames = new Set(["value", "example", "literal"]);
const valueClasses = new Set(["name", "enum", "id", "numeric", "timestamp", "freetext", "opaque"]);
const sourceCodeExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const fixtureJsonPath = /^tests\/fixtures\/.+\.json$/;
const publicGameRegionPattern = /\bPraetoria\b/gi;

function propertyName(property: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(property) || ts.isStringLiteral(property) || ts.isNumericLiteral(property)) {
    return property.text;
  }
  return undefined;
}

function stringLiteral(node: ts.Expression | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function isTrueLiteral(node: ts.Expression | undefined): boolean {
  return node?.kind === ts.SyntaxKind.TrueKeyword;
}

function isSourcePath(filePath: string, root: string): boolean {
  const path = normalizedPath(filePath, root);
  return path.startsWith("src/") || path.startsWith("scripts/");
}

function isSourceCodePath(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex >= 0 && sourceCodeExtensions.has(filePath.slice(dotIndex).toLowerCase());
}

function inspectMarkedParameter(
  filePath: string,
  parameter: Record<string, unknown>,
  root: string,
  playerParameterNames: Set<string>,
  report: Reporter,
): number {
  if (parameter.isPlayerName !== true) {
    return 0;
  }

  const sourcePath = normalizedPath(filePath, root);
  if (typeof parameter.name === "string") {
    playerParameterNames.add(parameter.name);
  }
  let hits = 0;
  for (const property of defaultPropertyNames) {
    if (property in parameter) {
      report(`${sourcePath}: [structural-default] marked path parameter carries '${property}'`);
      hits += 1;
    }
  }
  for (const property of suppliedValuePropertyNames) {
    if (typeof parameter[property] === "string") {
      report(`${sourcePath}: [structural-default] marked path parameter supplies a string '${property}'`);
      hits += 1;
    }
  }
  return hits;
}

function isParameterDeclaration(value: Record<string, unknown>): boolean {
  return typeof value.name === "string"
    && typeof value.type === "string"
    && ["string", "integer", "number", "boolean"].includes(value.type)
    && (typeof value.isPlayerName === "boolean" || typeof value.declaredRequired === "boolean"
      || typeof value.inertUpstream === "boolean");
}

function walkJsonSource(
  filePath: string,
  value: unknown,
  root: string,
  playerParameterNames: Set<string>,
  report: Reporter,
  collectOnly: boolean,
): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (hits, child) => hits + walkJsonSource(filePath, child, root, playerParameterNames, report, collectOnly),
      0,
    );
  }
  if (!isRecord(value)) {
    return 0;
  }

  let hits = 0;
  if (collectOnly) {
    if (value.isPlayerName === true && typeof value.name === "string") {
      playerParameterNames.add(value.name);
    }
  } else {
    hits += inspectMarkedParameter(filePath, value, root, playerParameterNames, report);
    for (const [key, child] of Object.entries(value)) {
      if (playerParameterNames.has(key) && typeof child === "string"
        && !(key === "name" && isParameterDeclaration(value))) {
        report(`${normalizedPath(filePath, root)}: [structural-default] string supplied for marked path parameter '${key}'`);
        hits += 1;
      }
    }
  }
  for (const child of Object.values(value)) {
    hits += walkJsonSource(filePath, child, root, playerParameterNames, report, collectOnly);
  }
  return hits;
}

function inspectTypeScriptSource(
  filePath: string,
  contents: string,
  root: string,
  playerParameterNames: Set<string>,
  report: Reporter,
  collectOnly: boolean,
): number {
  const sourcePath = normalizedPath(filePath, root);
  const sourceFile = ts.createSourceFile(sourcePath, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let hits = 0;
  const diagnostics = ts.transpileModule(contents, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    fileName: sourcePath,
    reportDiagnostics: true,
  }).diagnostics ?? [];
  if (diagnostics.length > 0) {
    report(`${sourcePath}: [structural-source] source could not be parsed for structural checks`);
    hits += 1;
  }

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = node.properties.filter(ts.isPropertyAssignment);
      const marked = properties.some((property) => {
        const name = propertyName(property.name);
        return name !== undefined && playerParameterMarkers.has(name) && isTrueLiteral(property.initializer);
      });
      if (marked) {
        const nameProperty = properties.find((property) => propertyName(property.name) === "name");
        const parameterName = stringLiteral(nameProperty?.initializer);
        if (parameterName !== undefined) {
          playerParameterNames.add(parameterName);
        }
        if (!collectOnly) {
          for (const property of properties) {
            const name = propertyName(property.name);
            if (name !== undefined && defaultPropertyNames.has(name)) {
              report(`${sourcePath}: [structural-default] marked path parameter carries '${name}'`);
              hits += 1;
            } else if (
              name !== undefined &&
              suppliedValuePropertyNames.has(name) &&
              stringLiteral(property.initializer) !== undefined
            ) {
              report(`${sourcePath}: [structural-default] marked path parameter supplies a string '${name}'`);
              hits += 1;
            }
          }
        }
      }
      if (!collectOnly) {
        const parameterDeclaration = properties.some((property) => {
          const key = propertyName(property.name);
          return key === "isPlayerName" || key === "declaredRequired" || key === "inertUpstream";
        }) && properties.some((property) => propertyName(property.name) === "type"
          && ["string", "integer", "number", "boolean"].includes(stringLiteral(property.initializer) ?? ""));
        const metadataConstructor = ts.isNewExpression(node.parent)
          && ts.isIdentifier(node.parent.expression)
          && ["McpServer", "ScopedMcpServer", "Client"].includes(node.parent.expression.text)
          && node.parent.arguments?.[0] === node;
        for (const property of properties) {
          const name = propertyName(property.name);
          if (name !== undefined && playerParameterNames.has(name) && stringLiteral(property.initializer) !== undefined
            && !(name === "name" && (parameterDeclaration || metadataConstructor))) {
            report(`${sourcePath}: [structural-default] string supplied for marked path parameter '${name}'`);
            hits += 1;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hits;
}

function checkSourceStructure(
  files: string[],
  root: string,
  report: Reporter,
): number {
  const checkerPath = join(root, "scripts", "leak-check.ts");
  const sourceFiles = files
    .filter((filePath) => isSourcePath(filePath, root))
    .concat(existsSync(checkerPath) ? [checkerPath] : []);
  const playerParameterNames = new Set<string>();
  let hits = 0;

  for (const filePath of sourceFiles) {
    if (!filePath.endsWith(".json")) {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch {
      report(`${normalizedPath(filePath, root)}: [structural-source] JSON could not be parsed for structural checks`);
      hits += 1;
      continue;
    }
    hits += walkJsonSource(filePath, value, root, playerParameterNames, report, true);
  }

  for (const filePath of sourceFiles) {
    if (filePath.endsWith(".json")) {
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      } catch {
        continue;
      }
      hits += walkJsonSource(filePath, value, root, playerParameterNames, report, false);
    } else if (isSourceCodePath(filePath)) {
      hits += inspectTypeScriptSource(filePath, readFileSync(filePath, "utf8"), root, playerParameterNames, report, true);
    }
  }

  for (const filePath of sourceFiles) {
    if (isSourceCodePath(filePath)) {
      hits += inspectTypeScriptSource(filePath, readFileSync(filePath, "utf8"), root, playerParameterNames, report, false);
    }
  }
  return hits;
}

function isFixturePath(filePath: string, root: string): boolean {
  const path = normalizedPath(filePath, root);
  const segments = path.split("/");
  return segments.includes("fixture") || segments.includes("fixtures") || /(^|\/)[^/]+\.fixture\.[^/]+$/i.test(path);
}

function fixtureValueClass(value: unknown): string | undefined {
  return isRecord(value) && typeof value.valueClass === "string" ? value.valueClass : undefined;
}

function fixtureLeaves(value: unknown, path: string, leaves: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => fixtureLeaves(child, `${path}[${index}]`, leaves));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      fixtureLeaves(child, path === "" ? key : `${path}.${key}`, leaves);
    }
    return;
  }
  if (path !== "") {
    leaves.set(path, value);
  }
}

function checkFixtures(files: string[], root: string, report: Reporter): number {
  let hits = 0;
  for (const filePath of files.filter((candidate) => isFixturePath(candidate, root))) {
    const sourcePath = normalizedPath(filePath, root);
    if (!filePath.endsWith(".json")) {
      report(`${sourcePath}: [fixture-provenance] fixture must be a JSON provenance envelope`);
      hits += 1;
      continue;
    }

    let fixture: unknown;
    try {
      fixture = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch {
      report(`${sourcePath}: [fixture-provenance] fixture JSON could not be parsed`);
      hits += 1;
      continue;
    }
    if (!isRecord(fixture)) {
      report(`${sourcePath}: [fixture-provenance] fixture must be an object envelope`);
      hits += 1;
      continue;
    }

    const provenance = fixture.provenance;
    if (
      !isRecord(provenance) ||
      typeof provenance.source !== "string" ||
      !["capturedAt", "recordedAt", "observedAt", "specFetchedAt"].some((key) => typeof provenance[key] === "string")
    ) {
      report(`${sourcePath}: [fixture-provenance] fixture needs provenance.source and a capture timestamp`);
      hits += 1;
    }

    const declarations = fixture.valueClasses;
    if (!isRecord(declarations)) {
      report(`${sourcePath}: [fixture-value-class] fixture needs a valueClasses declaration map`);
      hits += 1;
      continue;
    }

    const data = Object.fromEntries(Object.entries(fixture).filter(([key]) => key !== "provenance" && key !== "valueClasses"));
    const leaves = new Map<string, unknown>();
    fixtureLeaves(data, "", leaves);
    for (const path of leaves.keys()) {
      const valueClass = fixtureValueClass(declarations[path]);
      if (valueClass === undefined) {
        report(`${sourcePath}: [fixture-value-class] key path '${path}' has no declared valueClass`);
        hits += 1;
        continue;
      }
      if (!valueClasses.has(valueClass)) {
        report(`${sourcePath}: [fixture-value-class] key path '${path}' has unknown valueClass '${valueClass}'`);
        hits += 1;
      }
      // A name-classed fixture field is NOT required to be a synthetic placeholder. That check was
      // removed on 2026-09-07 by the project owner's ruling: names may appear in tests and fixtures,
      // because an API keyed on people cannot be exercised without them and the values are public.
      // What remains forbidden is a name in CODE, which checkSourceStructure covers. See CONTRIBUTING.md.
    }
  }
  return hits;
}

export type LeakCheckMode = "--ci" | "--full";

export function runLeakCheck(root: string, mode: LeakCheckMode, emit = true): number {
  const report: Reporter = (message) => {
    if (emit) {
      console.error(message);
    }
  };
  const files: string[] = [];
  collectFiles(root, root, files);
  const patterns = fixedPatterns;
  let hits = checkDependencies(root, report);

  for (const filePath of files) {
    hits += reportMatches(filePath, readFileSync(filePath, "utf8"), patterns, root, report);
  }

  if (mode === "--full") {
    report("Leak-check full mode: fixed patterns plus structural checks; no name list is configured or consulted.");
    hits += checkSourceStructure(files, root, report);
    hits += checkFixtures(files, root, report);
  }

  if (emit) {
    console.log(`Leak-check summary: ${files.length} files scanned, ${hits} hits, mode ${mode}.`);
    if (hits === 0) {
      console.log("Leak-check passed with zero hits.");
    }
  }
  return hits > 0 ? 1 : 0;
}

function main(): number {
  const args = process.argv.slice(2);
  const mode = args.length === 1 && (args[0] === "--ci" || args[0] === "--full") ? args[0] : undefined;
  if (mode === undefined) {
    console.error("Usage: tsx scripts/leak-check.ts --ci|--full");
    return 2;
  }
  return runLeakCheck(process.cwd(), mode);
}

if (process.argv[1]?.endsWith("scripts/leak-check.ts")) {
  process.exitCode = main();
}
