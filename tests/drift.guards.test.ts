import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { allCatalogueEntries } from "../src/catalogue/index.js";
import { fixedPatterns } from "../scripts/leak-check.js";
import { planDriftIssues } from "../scripts/drift/plan.js";
import { renderIssue } from "../scripts/drift/render.js";
import { executeFixtureRenewal, planFixtureRenewal } from "../scripts/drift/renewal.js";
import { observeShape } from "../scripts/drift/shape.js";
import { planSpecDiff, specDiffExitCode, type SpecFetch } from "../scripts/drift/spec-diff.js";
import { sweep } from "../scripts/drift/sweep.js";
import { DriftIssueSchema, type BaselineEntry, type DriftBaseline, type DriftIssue, type SweepEntry } from "../scripts/drift/types.js";
import renewalCorpus from "./fixtures/drift/renewal.fixture.json" with { type: "json" };
import run401 from "./fixtures/drift/run-401-single.fixture.json" with { type: "json" };
import run403 from "./fixtures/drift/run-403-twenty.fixture.json" with { type: "json" };
import shapeCorpus from "./fixtures/drift/run-shape-change.fixture.json" with { type: "json" };
import specUnreachable from "./fixtures/drift/spec-unreachable.fixture.json" with { type: "json" };

const entries: SweepEntry[] = allCatalogueEntries().map((entry) => ({
  entryId: entry.entryId,
  host: entry.host,
  pathTemplate: entry.pathTemplate,
  authBaseline: "public",
}));
const stableBody = { status: "success", data: { value: "stable" } };

function baselineFor(inputEntries: readonly SweepEntry[] = entries, body: unknown = stableBody): DriftBaseline {
  const shape = observeShape(body);
  const records: BaselineEntry[] = inputEntries.map((entry) => ({
    entryId: entry.entryId,
    host: entry.host,
    pathTemplate: entry.pathTemplate,
    authTier: entry.authBaseline,
    statusesObserved: [200],
    shape,
    shapeSources: ["synthetic"],
    truncatedAt: [],
    capturedAt: "2026-09-07",
  }));
  return { entries: records, unbaselined: [], capturedAt: "2026-09-07" };
}

function issueWithDelta(): DriftIssue {
  return {
    key: "drift/vapi.land.volume",
    scope: "endpoint",
    labels: ["drift:added"],
    host: "vapi",
    entryId: "vapi.land.volume",
    pathTemplate: "/land/volume",
    observedOn: "2026-09-07",
    statusBaseline: 200,
    statusObserved: 200,
    authBaseline: "public",
    authObserved: "public",
    deltas: [{ keyPath: "data.new", change: "added", observedTypes: ["string"] }],
  };
}

describe("M23 planted drift guards", () => {
  it("G10c-a opens one auth issue for the planted 401 and omits traceId", async () => {
    const target = "vapi.land.deeds.search";
    const run = await sweep(entries, async (entry) => entry.entryId === target
      ? { status: run401.status, body: run401.body, isJson: true }
      : { status: 200, body: stableBody, isJson: true }, { observedOn: "2026-09-07" });
    const plan = planDriftIssues(baselineFor(), run);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]?.labels).toEqual(["drift:auth"]);
    expect(plan.issues[0]?.scope).toBe("endpoint");
    expect(plan.issues[0]?.entryId).toBe(target);
    expect(run.status).toBe("completed");
    expect(renderIssue(plan.issues[0]!).body).not.toContain("traceId");
  });

  it("G10c-b plants twenty 403s, observes two, aborts and suppresses endpoint issues", async () => {
    expect(run403.plantedEntryIds).toHaveLength(20);
    expect(run403.unreachedEntryIds).toHaveLength(18);
    const planted = new Set(run403.plantedEntryIds);
    const clean = new Set(run403.cleanEntryIds);
    const orderedPlanted = entries.filter((entry) => planted.has(entry.entryId));
    const ordered = [...orderedPlanted, ...entries.filter((entry) => clean.has(entry.entryId))];
    const expectedUnreachedEntryIds = orderedPlanted.slice(2).map((entry) => entry.entryId);
    expect(run403.unreachedEntryIds).toEqual(expectedUnreachedEntryIds);
    const requestLog: string[] = [];
    const run = await sweep(ordered, async (entry) => {
      requestLog.push(entry.entryId);
      return planted.has(entry.entryId)
        ? { status: run403.status, body: run403.body, isJson: false }
        : { status: 200, body: stableBody, isJson: true };
    }, { observedOn: "2026-09-07" });
    const plan = planDriftIssues(baselineFor(ordered), run);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]?.labels).toEqual(["drift:blocked"]);
    expect(plan.issues[0]?.scope).toBe("run");
    expect(run.status).toBe("aborted");
    expect(plan.issues[0]?.counts).toEqual({ entriesSwept: 2, blockedEndpoints: 2, entriesTotal: 22 });
    expect(requestLog).toHaveLength(2);
    for (const entryId of expectedUnreachedEntryIds) expect(requestLog).not.toContain(entryId);
    expect(plan.issues.some((issue) => issue.labels.includes("drift:auth"))).toBe(false);
  });

  it("G10c-c1 rejects a response value planted through a new issue field while the sentinel route stays green", () => {
    const issue = issueWithDelta();
    const planted = { ...issue, deltas: [{ ...issue.deltas[0], observedValue: "ZZSENTINELZZ" }] };
    expect(() => DriftIssueSchema.parse(planted)).toThrow(/observedValue/);
    expect(renderIssue(issue).body).not.toContain("ZZSENTINELZZ");
  });

  it("G10c-c2 catches a response value planted in rendered text while the schema stays green", () => {
    expect(shapeCorpus.observed["data.count"]).toBe("number");
    const issue = issueWithDelta();
    const observation: { body: unknown } = { body: { label: "ZZSENTINELZZ", count: 918273645 } };
    const plantedRenderIssue = vi.fn((candidate: DriftIssue, observed?: { body: unknown }) => {
      const rendered = renderIssue(candidate);
      return observed === undefined
        ? rendered
        : { ...rendered, body: `${rendered.body}\n\nObserved sample:\n${JSON.stringify(observed.body)}` };
    });
    expect(() => DriftIssueSchema.parse(issue)).not.toThrow();
    const rendered = plantedRenderIssue(issue, observation);
    expect(() => expect(`${rendered.title}\n${rendered.body}`, `G10c-c2 ${issue.key}: rendered issue leaked the observed sample`).not.toContain("ZZSENTINELZZ")).toThrow(issue.key);
    expect(() => expect(`${rendered.title}\n${rendered.body}`, `G10c-c2 ${issue.key}: rendered issue leaked the observed sample`).not.toContain("918273645")).toThrow(issue.key);
  });

  it("G10c-c3 proves fixed-pattern plants are live and clean rendering has no path or identifier hits", () => {
    const homePattern = fixedPatterns.find((pattern) => pattern.label === "home-path" && pattern.expression.source === "\\/home\\/[a-z]+");
    const idPattern = fixedPatterns.find((pattern) => pattern.label === "internal-identifier" && pattern.expression.source === "\\bIR-\\d+\\b");
    if (homePattern === undefined || idPattern === undefined) throw new Error("M23 fixed patterns no longer expose the required plants");
    const resolvedPath = fileURLToPath(import.meta.url);
    expect(homePattern.expression.test(resolvedPath), `Resolved plant path did not match home-path: ${resolvedPath}`).toBe(true);
    const internalToken = `${String.fromCharCode(73, 82)}-1234`;
    expect(idPattern.expression.test(internalToken), `Internal identifier plant did not match: ${internalToken}`).toBe(true);
    const plantedHits = fixedPatterns.filter(({ expression }) => expression.test(`${resolvedPath}\n${internalToken}`));
    expect(plantedHits.map(({ label }) => label)).toEqual(expect.arrayContaining(["home-path", "internal-identifier"]));
    const rendered = renderIssue(issueWithDelta());
    const cleanHits = fixedPatterns.filter(({ expression }) => expression.test(`${rendered.title}\n${rendered.body}`));
    expect(cleanHits).toEqual([]);
  });

  it("G10c-d holds unreachable network and HTML specifications without changing the catalogue", () => {
    const cataloguePath = fileURLToPath(new URL("../src/catalogue/catalogue.json", import.meta.url));
    const catalogueBefore = readFileSync(cataloguePath, "utf8");
    const url = "https://vapi.splinterlands.com/swagger.json";
    const cases: Array<{ name: string; fetched: SpecFetch }> = [
      {
        name: specUnreachable.reasons[0]!,
        fetched: { ok: false, url, reason: "network" },
      },
      {
        name: specUnreachable.reasons[1]!,
        fetched: { ok: true, url, body: "<html>502 Bad Gateway</html>" },
      },
    ];

    for (const testCase of cases) {
      const plan = planSpecDiff(testCase.fetched, allCatalogueEntries().length);
      expect(plan.issues, `G10c-d ${testCase.name}: exactly one issue`).toHaveLength(1);
      expect(plan.issues[0]?.labels, `G10c-d ${testCase.name}: unreachable label`).toEqual(["drift:spec-unreachable"]);
      expect(plan.issues[0]?.scope, `G10c-d ${testCase.name}: run scope`).toBe("run");
      expect(plan.catalogueDelta, `G10c-d ${testCase.name}: catalogue delta must be null`).toBeNull();
      expect(plan.issues.some((issue) => issue.labels.includes("drift:removed")), `G10c-d ${testCase.name}: no removals`).toBe(false);
      expect(specDiffExitCode(plan), `G10c-d ${testCase.name}: unreachable must exit successfully`).toBe(0);
    }
    expect(readFileSync(cataloguePath, "utf8"), "G10c-d: catalogue must remain byte-unchanged").toBe(catalogueBefore);
  });

  it("G10c-e holds changed fixture shape, writes only the refresh, and queues the recapture", async () => {
    expect(renewalCorpus.pairs).toEqual(["equal-shape-different-values", "changed-shape"]);
    const root = await mkdtemp(join(tmpdir(), "m23-renewal-"));
    const pairOnePath = join(root, "pair-one.fixture.json");
    const pairTwoPath = join(root, "pair-two.fixture.json");
    const pendingRoot = join(root, "pending");
    const stable = { status: "success", data: { value: 1, count: 2 } };
    const pairs = [
      {
        fixturePath: pairOnePath,
        entryId: "vapi.test.renewal.equal-shape",
        existing: stable,
        recaptured: { status: "success", data: { value: 3, count: 4 } },
      },
      {
        fixturePath: pairTwoPath,
        entryId: "vapi.test.renewal.changed-shape",
        existing: stable,
        recaptured: { status: "success", data: { value: 3 } },
      },
      ...["one", "two", "three"].map((suffix) => ({
        fixturePath: join(root, `anchor-${suffix}.fixture.json`),
        entryId: `vapi.test.renewal.anchor-${suffix}`,
        existing: stable,
        recaptured: stable,
      })),
    ];

    try {
      const plan = planFixtureRenewal(pairs, { observedOn: "2026-09-07", pendingRoot });
      expect(plan.outcomes.slice(0, 2), "G10c-e: fixture pair outcomes must be refresh then hold").toEqual(["refresh", "hold"]);
      expect(plan.issues, "G10c-e: exactly one shape issue must be produced").toHaveLength(1);
      expect(plan.issues[0]?.labels, "G10c-e: changed pair must be labelled drift:shape").toEqual(["drift:shape"]);
      expect(plan.issues[0]?.scope, "G10c-e: changed pair issue must be endpoint-scoped").toBe("endpoint");
      expect(plan.issues[0]?.entryId, "G10c-e: changed pair issue must name its entry").toBe("vapi.test.renewal.changed-shape");
      expect(plan.writes.map(({ path }) => path), "G10c-e: only the equal-shape pair may be written").toEqual([pairOnePath]);
      expect(plan.pendingWrites.map(({ path }) => path), "G10c-e: changed pair must be queued under pending").toEqual([join(pendingRoot, "pair-two.fixture.json")]);

      await executeFixtureRenewal(plan);
      expect(readFileSync(pairOnePath, "utf8"), "G10c-e: refresh pair must be written").toContain('"value": 3');
      expect(existsSync(pairTwoPath), "G10c-e: pair two fixture must not be written").toBe(false);
      const pendingPath = join(pendingRoot, "pair-two.fixture.json");
      expect(existsSync(pendingPath), "G10c-e: pair two recapture must be written under pending").toBe(true);
      expect(readFileSync(pendingPath, "utf8"), "G10c-e: pending recapture must contain the changed sample").toContain('"value": 3');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
