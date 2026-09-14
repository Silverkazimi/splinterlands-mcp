import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedPatterns, runLeakCheck } from "../scripts/leak-check.js";

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "leak-guard-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {}, devDependencies: {} }));
  return root;
}

function internalToken(): string {
  const pattern = fixedPatterns.find(({ label }) => label === "internal-identifier");
  if (pattern === undefined || !pattern.expression.source.includes("\\d+")) {
    throw new Error("The synthetic fixed-pattern plant no longer has a numeric shape");
  }
  return `${String.fromCharCode(70, 82)}-${String(1001)}`;
}

function writeFixture(root: string, fixture: unknown): string {
  const directory = join(root, "fixtures");
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, "captured.json");
  writeFileSync(filePath, `${JSON.stringify(fixture)}\n`);
  return filePath;
}

function writeRepositoryFile(root: string, repositoryPath: string, contents: string): string {
  const filePath = join(root, repositoryPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return filePath;
}

describe("leak-check red/green guards", () => {
  it("rejects single-letter ticket identifiers in content and paths", () => {
    const root = temporaryRoot();
    const token = [String.fromCharCode(83), String(987654)].join("-");
    try {
      for (const mode of ["--ci", "--full"] as const) {
        expect(runLeakCheck(root, mode, false)).toBe(0);
        const content = writeRepositoryFile(root, "README.md", token);
        expect(runLeakCheck(root, mode, false)).toBe(1);
        rmSync(content);
        expect(runLeakCheck(root, mode, false)).toBe(0);
        const path = writeRepositoryFile(root, token + "/probe.txt", "sample");
        expect(runLeakCheck(root, mode, false)).toBe(1);
        rmSync(path);
        expect(runLeakCheck(root, mode, false)).toBe(0);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("distinguishes a name selector's schema metadata from a supplied account value", () => {
    const root = temporaryRoot();
    try {
      writeRepositoryFile(root, "scripts/catalogue-input.json", JSON.stringify([
        { pathParams: [{ name: "name", type: "string", required: true, isPlayerName: true }] },
        { queryParams: [{ name: "limit", type: "integer", declaredRequired: false }] },
        { observedQueryParams: [{ name: "name", type: "string", inertUpstream: false }] },
      ]));
      writeRepositoryFile(root, "src/server.ts", 'const server = new McpServer({ name: "public-server", version: "0.0.0" });');
      expect(runLeakCheck(root, "--full", false)).toBe(0);
      writeRepositoryFile(root, "src/server.ts", 'const server = new ScopedMcpServer({ name: "public-server", version: "0.0.0" });');
      expect(runLeakCheck(root, "--full", false)).toBe(0);
      const planted = writeRepositoryFile(root, "src/request.ts", 'bindRequest("route", { name: "synthetic-account" });');
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      rmSync(planted);
      writeRepositoryFile(root, "src/request.json", JSON.stringify({ name: "synthetic-account" }));
      expect(runLeakCheck(root, "--full", false)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("stays green for every reserved email domain", () => {
    const root = temporaryRoot();
    const filePath = join(root, "reserved-addresses.txt");
    const reservedDomains = ["synthetic-only.invalid", "synthetic-only.test", "synthetic-only.example", "synthetic-only.localhost"];
    try {
      writeFileSync(filePath, reservedDomains.map((domain) => ["synthetic.guard", domain].join("@")).join("\n"));
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("stays red for a synthetic ordinary-domain address", () => {
    const root = temporaryRoot();
    const filePath = join(root, "ordinary-address.txt");
    try {
      writeFileSync(filePath, ["synthetic.guard", "synthetic-only.zzz"].join("@"));
      expect(runLeakCheck(root, "--ci", false)).toBe(1);
      rmSync(filePath);
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails and recovers for a planted content token", () => {
    const root = temporaryRoot();
    const filePath = join(root, "probe.txt");
    try {
      writeFileSync(filePath, `synthetic ${internalToken()}\n`);
      expect(runLeakCheck(root, "--ci", false)).toBe(1);
      rmSync(filePath);
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches queue-row ids in ordinary user-visible prose, including deferred to M75", () => {
    const root = temporaryRoot();
    try {
      writeRepositoryFile(root, "README.md", "The next review is deferred to M75; the queue also records M32 and M24.");
      expect(runLeakCheck(root, "--ci", false)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches queue-row range ids on a user-visible surface", () => {
    const root = temporaryRoot();
    try {
      writeRepositoryFile(root, "src/queue-contract.txt", "The affected range is M30-M35.");
      expect(runLeakCheck(root, "--ci", false)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exempts queue-row ids in library, tests, and scripts", () => {
    const root = temporaryRoot();
    try {
      for (const repositoryPath of ["library/notes.md", "tests/notes.md", "scripts/notes.md"]) {
        writeRepositoryFile(root, repositoryPath, "The next review is deferred to M75.");
      }
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not flag a real fixture card identifier", () => {
    const root = temporaryRoot();
    try {
      writeRepositoryFile(root, "README.md", "The captured card identifier is C21-1031-JKN7P0VYMO.");
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails and recovers for a planted path token", () => {
    const root = temporaryRoot();
    const directory = join(root, internalToken());
    const filePath = join(directory, "probe.txt");
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(filePath, "synthetic\n");
      expect(runLeakCheck(root, "--ci", false)).toBe(1);
      rmSync(filePath);
      expect(runLeakCheck(root, "--ci", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails and recovers for a marked-parameter default", () => {
    const root = temporaryRoot();
    const filePath = join(root, "scripts", "catalogue-input.json");
    mkdirSync(join(root, "scripts"), { recursive: true });
    const parameter = { name: "player", type: "string", required: true, isPlayerName: true };
    try {
      writeFileSync(filePath, JSON.stringify([{ pathParams: [{ ...parameter, default: "__synthetic_player__" }] }]));
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      writeFileSync(filePath, JSON.stringify([{ pathParams: [parameter] }]));
      expect(runLeakCheck(root, "--full", false)).toBe(0);
      writeFileSync(filePath, JSON.stringify([{ pathParams: [{ ...parameter, value: "__synthetic_player__" }] }]));
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      writeFileSync(filePath, JSON.stringify([{ pathParams: [parameter] }]));
      expect(runLeakCheck(root, "--full", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails and recovers for missing fixture provenance", () => {
    const root = temporaryRoot();
    try {
      writeFixture(root, {
        data: { rarity: "sample" },
        valueClasses: { "data.rarity": { valueClass: "enum" } },
      });
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      writeFixture(root, {
        provenance: { source: "synthetic", capturedAt: "2026-09-04T00:00:00Z" },
        data: { rarity: "sample" },
        valueClasses: { "data.rarity": { valueClass: "enum" } },
      });
      expect(runLeakCheck(root, "--full", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails and recovers for an undeclared fixture key path", () => {
    const root = temporaryRoot();
    const base = {
      provenance: { source: "synthetic", capturedAt: "2026-09-04T00:00:00Z" },
      data: { rarity: "sample", quantity: 1 },
    };
    try {
      writeFixture(root, { ...base, valueClasses: { "data.rarity": { valueClass: "enum" } } });
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      writeFixture(root, {
        ...base,
        valueClasses: {
          "data.rarity": { valueClass: "enum" },
          "data.quantity": { valueClass: "numeric" },
        },
      });
      expect(runLeakCheck(root, "--full", false)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires synthetic placeholders for name-classed fields and retains leaf coverage", () => {
    const root = temporaryRoot();
    const fixture = {
      provenance: { source: "synthetic", capturedAt: "2026-09-04T00:00:00Z" },
      data: { player: "sample" },
      valueClasses: { "data.player": { valueClass: "name" } },
    };
    try {
      writeFixture(root, { ...fixture, data: { player: "ordinary-account" } });
      expect(runLeakCheck(root, "--full", false)).toBe(1);
      writeFixture(root, fixture);
      expect(runLeakCheck(root, "--full", false)).toBe(0);
      // The leaf-coverage rule is untouched: drop the declaration and the guard still goes red.
      writeFixture(root, { ...fixture, valueClasses: {} });
      expect(runLeakCheck(root, "--full", false)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it("rejects account references hidden by opaque classification or encoded JSON", () => {
  const root = temporaryRoot();
  const base = { provenance: { source: "synthetic", capturedAt: "2026-09-14" },
    valueClasses: { "data.seller": { valueClass: "opaque" }, "data.details": { valueClass: "opaque" } } };
  try {
    for (const data of [
      { seller: "ordinary-account", details: "{}" },
      { seller: "sample-acct-001", details: JSON.stringify({ player_1: "ordinary-account" }) },
      { seller: "sample-acct-001", details: JSON.stringify({ uid: "C1-1-FIXTURE-ordinary-account" }) },
    ]) {
      writeFixture(root, { ...base, data });
      expect(runLeakCheck(root, "--full", false)).toBe(1);
    }
    writeFixture(root, { ...base, data: { seller: "sample-acct-001",
      details: JSON.stringify({ player_1: "sample-acct-001", uid: "C1-1-FIXTURE-sample-acct-001", winner: "DRAW" }) } });
    expect(runLeakCheck(root, "--full", false)).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("checks account fields and nested account lists independently of leaf classifications", () => {
  const root = temporaryRoot();
  function fixture(data: unknown) {
    const valueClasses: Record<string, {valueClass: string}> = {};
    function leaves(value: unknown, path: string) {
      if (Array.isArray(value)) value.forEach((item, index) => leaves(item, path + "[" + index + "]"));
      else if (value !== null && typeof value === "object")
        Object.entries(value).forEach(([key, item]) => leaves(item, path + "." + key));
      else valueClasses[path] = {valueClass: "opaque"};
    }
    leaves(data, "data");
    return {provenance: {source: "synthetic", capturedAt: "2026-09-14"}, data, valueClasses};
  }
  try {
    for (const key of ["loser", "opponent_player", "voter", "market_account", "last_used_player",
      "event_creation_whitelist", "ghost_creation_whitelist", "no_entryfee_list", "proposal_accounts", "authorities"]) {
      for (const encoded of [false, true]) {
        for (const [account, expected] of [["ordinary-account", 1], ["sample-acct-001", 0]] as const) {
          const data = {[key]: key === "authorities" ? {purchase: [account]} : [account]};
          writeFixture(root, fixture(encoded ? {details: JSON.stringify(data)} : data));
          expect(runLeakCheck(root, "--full", false), key).toBe(expected);
        }
      }
    }
    writeFixture(root, fixture({description: "ordinary prose", unrelated: ["ordinary-value"]}));
    expect(runLeakCheck(root, "--full", false)).toBe(0);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
