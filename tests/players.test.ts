import { describe, expect, it } from "vitest";
import currentRewardsFixture from "./fixtures/api-players-current-rewards.fixture.json" with { type: "json" };
import detailsFixture from "./fixtures/api-players-details.fixture.json" with { type: "json" };
import lastFocusFixture from "./fixtures/api-players-last-focus-rewards.fixture.json" with { type: "json" };
import lastSeasonFixture from "./fixtures/api-players-last-season-rewards.fixture.json" with { type: "json" };
import unclaimedBalanceHistoryFixture from "./fixtures/api-players-unclaimed-balance-history.fixture.json" with { type: "json" };
import unclaimedBalancesFixture from "./fixtures/api-players-unclaimed-balances.fixture.json" with { type: "json" };
import { catalogue, getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";
import { matchesResultContract } from "../src/catalogue/fingerprint.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";

describe("player family contracts", () => {
  it("matches every captured body against its own entry's contract", () => {
    const pairs: Array<[string, unknown]> = [
      ["api.players.details", detailsFixture.body],
      ["api.players.current-rewards", currentRewardsFixture.body],
      ["api.players.last-season-rewards", lastSeasonFixture.body],
      ["api.players.last-focus-rewards", lastFocusFixture.body],
      ["api.players.unclaimed-balances", unclaimedBalancesFixture.body],
      ["api.players.unclaimed-balance-history", unclaimedBalanceHistoryFixture.body],
    ];
    for (const [entryId, body] of pairs) {
      expect(matchesResultContract(body, getCatalogueEntry(entryId).resultContract), entryId).toBe(true);
    }
  });

  it("declares no type for a field only ever observed as null", () => {
    // The schema forbids a null type, and inventing one would claim a shape never
    // seen. Such fields are absent from the fingerprint and named in the notes.
    const lastSeason = getCatalogueEntry("api.players.last-season-rewards");
    for (const format of ["modern_glint", "survival_glint", "foundation_glint"]) {
      expect(Object.keys(lastSeason.resultContract.fingerprint)).not.toContain(`season_reward_info.${format}`);
      expect(lastSeason.notes ?? "").toContain(format);
    }
    expect(lastSeason.resultContract.fingerprint["season_reward_info.wild_glint"]).toEqual({ type: "number", valueClass: "numeric" });
  });

  it("does not classify a format label as a player name", () => {
    // quest_data.name carries a format such as wild; only quest_data.player is an account.
    const focus = getCatalogueEntry("api.players.last-focus-rewards");
    expect(focus.resultContract.fingerprint["quest_data.name"]?.valueClass).toBe("enum");
    expect(focus.resultContract.fingerprint["quest_data.player"]?.valueClass).toBe("name");
    // rewards arrives as a JSON-encoded string and is passed through unparsed.
    expect(focus.resultContract.fingerprint["quest_data.rewards"]?.type).toBe("string");
  });

  it("keeps the routes that could not be honestly advertised unbound and dated", () => {
    const unadvertised = {
      "api.players.history": "401",
      "api.players.balance-history": "401",
      "api.players.referral-users": "no populated response",
      "api.players.referral-payments": "no populated response",
      "api.players.details-by-id": "numeric id",
    };
    const registeredTools = new Set(Object.keys(TOOL_ENTRY_IDS));
    for (const [entryId, reason] of Object.entries(unadvertised)) {
      const entry = getCatalogueEntry(entryId);
      expect(entry.owningTool, entryId).toBeNull();
      expect(entry.resultContract.fingerprint, entryId).toEqual({});
      expect(entry.resultContract.requiredKeyPaths, entryId).toEqual([]);
      expect(entry.notes ?? "", entryId).toContain("2026-09-08");
      expect(entry.notes ?? "", entryId).toContain(reason);
      expect(registeredTools.has(entryId), entryId).toBe(false);
    }
  });

  it("separates a gated route from one that merely returned nothing", () => {
    // Both are unadvertised, for different reasons; the notes must not blur them.
    const gated = getCatalogueEntry("api.players.history").notes ?? "";
    const empty = getCatalogueEntry("api.players.referral-users").notes ?? "";
    expect(gated).toContain("gated");
    expect(empty).not.toContain("gated");
    expect(empty).toContain("HTTP 200");
    // The bound routes are ours, not upstream's, and must say so.
    const oversized = getCatalogueEntry("api.players.inventory").notes ?? "";
    expect(oversized).toContain("this server's");
    expect(oversized).toContain("untruncated");
  });

  it("records the profile route as absent from the declaration", () => {
    const profile = getCatalogueEntry("api.players.details");
    expect(profile.owningTool).toBe("player_profile");
    expect(profile.notes ?? "").toContain("ABSENT from the published declaration");
    // Its selector is name, not username, and it is observed rather than declared.
    expect(profile.queryParams).toEqual([]);
    expect((profile.observedQueryParams ?? []).map((parameter) => parameter.name)).toEqual(["name"]);
  });

  it("carries every new player entry on the main host", () => {
    const players = catalogue.filter((entry) => entry.entryId.startsWith("api.players."));
    expect(players.length).toBeGreaterThanOrEqual(14);
    expect(players.every((entry) => entry.host === "api")).toBe(true);
    expect(players.every((entry) => entry.method === "GET")).toBe(true);
  });

  it("lets a declared-nullable field be null on some array rows and present on others", () => {
    // One array's rows are visited under the same key path. A nullable field absent
    // on one row and present on another is what nullable means, not the shape change
    // the repeated-path guard exists to catch. A genuine type change must still fail.
    const contract = getCatalogueEntry("api.players.unclaimed-balance-history").resultContract;
    expect(contract.fingerprint["[].status"]).toMatchObject({ type: "string", nullable: true });

    const rows = unclaimedBalanceHistoryFixture.body as Array<Record<string, unknown>>;
    expect(rows.some((row) => row.status === null)).toBe(true);
    expect(rows.some((row) => typeof row.status === "string")).toBe(true);
    expect(matchesResultContract(rows, contract)).toBe(true);

    // Null first, value later: order must not decide the outcome.
    const reversed = [...rows].reverse();
    expect(matchesResultContract(reversed, contract)).toBe(true);

    // A non-null type change on the same path is still rejected.
    const mutated = rows.map((row, index) => (index === 0 ? { ...row, status: 42 } : row));
    expect(matchesResultContract(mutated, contract)).toBe(false);

    // A field that is NOT declared nullable still rejects a null among its values.
    const amountChanged = rows.map((row, index) => (index === 0 ? { ...row, amount: null } : row));
    expect(contract.fingerprint["[].amount"]?.nullable).toBeUndefined();
    expect(matchesResultContract(amountChanged, contract)).toBe(false);
  });
});

it("accepts observed null profile fields and absent guild tournament data", () => {
  const body = structuredClone(detailsFixture.body) as Record<string, unknown>;
  const guild = body.guild as Record<string, unknown>;
  guild.tournament_id = null;
  delete guild.tournament_status;
  delete guild.tournament_data;
  body.title_pre = null;
  body.survival_bracket = null;
  const accepts = predicateFor(getCatalogueEntry("api.players.details").resultContract);
  expect(accepts(body)).toBe(true);
  expect(accepts({ ...body, rating: "invalid" })).toBe(false);
  expect(accepts({ ...body, guild: { ...guild, tournament_status: "invalid" } })).toBe(false);
  expect(accepts({ ...body, guild: { ...guild, tournament_data: 42 } })).toBe(false);
  expect(accepts({ ...body, guild: { ...guild, tournament_data: {} } })).toBe(false);
  expect(accepts({ ...body, survival_bracket: "invalid" })).toBe(false);
});
