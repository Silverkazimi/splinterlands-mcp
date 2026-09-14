import { describe, expect, it } from "vitest";
import { SplinterlandsHttpClient } from "../src/http/client.js";
import {
  bindRequest,
  catalogue,
  CatalogueProgrammingError,
  createTestOnlyCataloguePath,
  inputSchemaForCatalogueEntry,
  inputSchemaFor,
  loadCatalogue,
  type CataloguePath,
} from "../src/catalogue/index.js";
import { fingerprint, matchesResultContract } from "../src/catalogue/fingerprint.js";
import type { ResultContract } from "../src/catalogue/schema.js";
import { generate } from "../scripts/gen-catalogue.js";
import { TOOL_ENTRY_IDS } from "../src/server.js";

describe("endpoint catalogue guards", () => {
  const syntheticSearchParams = {
    player: "__synthetic_player__",
    tract_id: 900000001,
    region_number: 900000002,
    limit: 900000003,
    offset: 900000004,
    orderBy: "__synthetic_order__",
  };

  function isClassifiedUnbound(entry: (typeof catalogue)[number]): boolean {
    return entry.owningTool === null
      && (entry.measured === null || (entry.provenance?.source === "live-observation" && /Excluded \d{4}-\d{2}-\d{2}/.test(entry.notes ?? "")))
      && Object.keys(entry.resultContract.fingerprint).length === 0
      && entry.resultContract.requiredKeyPaths.length === 0;
  }

  function _compileTimePathGuard(client: SplinterlandsHttpClient, outsidePath: { readonly value: string }): void {
    // Semantic: client.request cannot receive a path made outside the catalogue. Mutation: export createCataloguePath or widen request's path type. Input: an object with the same visible value field still fails TypeScript's opaque brand check.
    // @ts-expect-error An outside object is not a CataloguePath.
    void client.request("api.splinterlands.com", outsidePath);
  }

  it("rejects an unbranded runtime path", async () => {
    // Semantic: runtime callers cannot pass a lookalike path. Mutation: remove isCataloguePath from request. Input: a plain object with the expected value field reaches the runtime boundary and must be rejected before fetch.
    const client = new SplinterlandsHttpClient({ fetch: async () => new Response(JSON.stringify({ value: 1 })) });
    await expect(client.request("api.splinterlands.com", { value: "/hardcoded" } as unknown as CataloguePath)).rejects.toThrow("catalogue path");
  });

  it("keeps the test-only path seam explicit", () => {
    // Semantic: synthetic HTTP tests use a named test-only constructor. Mutation: remove its validation or replace it with a public arbitrary path factory. Input: a valid synthetic path is produced, but its construction is visibly outside the production binding path.
    expect(createTestOnlyCataloguePath("/synthetic").value).toBe("/synthetic");
    expect(() => createTestOnlyCataloguePath("/hardcoded?query=1")).toThrow("Catalogue paths");
  });

  // Semantic: every catalogue entry is callable through the read-only transport. Mutation: remove method from any generated entry. Input: the generated catalogue entry then fails the required method field.
  it("contains only GET entries with unique ids", () => {
    expect(new Set(catalogue.map((entry) => entry.entryId)).size).toBe(catalogue.length);
    expect(catalogue.every((entry) => entry.method === "GET")).toBe(true);
    expect(catalogue.every((entry) => entry.tier === null && (entry.owningTool !== null || isClassifiedUnbound(entry)))).toBe(true);
    const paths = new Set(catalogue.map((entry) => entry.pathTemplate));
    expect(paths).toEqual(new Set([
      "/collector/{player}/stickers/all",
      "/collector/{player}/{binderRef}",
      "/collector/{player}",
      "/delegation-rental/rentals/bid/{bid}",
      "/delegation-rental/rentals/player/{player}",
      "/market/player/activity",
      "/market/player/listings",
      "/market/player/all_listings",
      "/market/player/asset-detail-stats",
      "/land/deeds",
      "/land/deeds/{plot_id}",
      "/land/deeds/details/{deed_uid}",
      "/land/deeds/details/id/{plotId}",
      "/land/deeds/owned/{player}",
      "/land/projects/deed/{deed_uid}/active",
      "/land/projects/deed/{deed_uid}/list",
      // Corrected 2026-09-05 from "/land/projects/list/count": the live specification
      // declares this route under a deed, and the entry without that segment named a URL
      // the upstream does not serve.
      "/land/projects/deed/{deed_uid}/list/count",
      "/land/projects/deed/{deed_uid}/requirements",
      "/land/regions/counts",
      "/land/tracts/counts",
      "/land/volume",
      "/land/resources/production/overview",
      "/land/resources/production/region/overview",
      "/land/resources/owned",
      "/land/resources/richlist",
      "/land/resources/leaderboards",
      "/land/resources/taxes/{deedUID}",
      "/land/resources/production/region/harvestable",
      "/land/resources/balances/history/{player}",
      "/land/resources/balances/history/{player}/count",
      "/land/resources/balances/history/{player}/{regionuid}",
      "/land/resources/balances/history/{player}/{regionuid}/count",
      "/land/resources/titles",
      "/land/resources/titles/assigned",
      "/land/resources/titles/assigned/{player}",
      "/land/liquidity/pools",
      "/land/liquidity/pools/{id}",
      "/land/liquidity/poolsbysymbol/{symbol}",
      "/land/resources/liquidity/swaps/{player}",
      "/land/liquidity/landpools",
      "/land/liquidity/voucherpool",
      "/land/resources/liquidity/history/swaps/{pool}/{player}",
      "/land/liquidity/pools/{player}/{token}",
      "/land/liquidity/pool/rewards/{token}/{poolId}",
      "/land/liquidity/allrewards",
      "/land/liquidity/quote/{poolId}",
      "/land/liquidity/resources/{player}/{token}",
      "/land/liquidity/region/{player}",
      "/cards/collection/{username}",
      "/land/resources/rewardactions/{deedUID}",
      "/land/resources/rewardactions/{deedUID}/count",
      "/land/resources/history/{trx_id}",
      "/land/resources/fragment_history/{trx_id}",
      "/land/stake/deeds/{deedUid}/assets",
      "/land/stake/deed/details/{deedUid}",
      "/land/stake/cards/{stakeTypeUid}/available",
      "/land/stake/cards/{stakeTypeUid}/grouped",
      "/land/stake/items/{stakeTypeUid}/available",
      "/land/stake/items/{stakeTypeUid}/grouped",
      "/land/stake/dec/overall",
      "/land/stake/dec/region",
      "/land/stake/decstaked",
      "/land/stake/evp/pending-claim",
      "/cards/find",
      "/cards/get_details",
      "/cards/history",
      "/cards/lore",
      "/cards/pack_data_wax",
      "/cards/skins",
      "/cards/stats",
      "/cards/trx_lookup",
      "/players/item_details",
      "/players/details",
      "/players/details_by_id",
      "/players/current_rewards",
      "/players/last_season_rewards",
      "/players/last_focus_rewards",
      "/players/unclaimed_balances",
      "/players/unclaimed_balance_history",
      "/players/history",
      "/players/balance_history",
      "/players/referral_users",
      "/players/referral_payments",
      "/players/inventory",
      "/players/rebellion_presale_leaders",
      "/proposals/pending_proposal_count",
      "/proposals/",
      "/proposals/votes",
      "/delegation-rental/v3/offers/player/{player}",
      "/delegation-rental/v3/bids/player/{player}",
      "/delegation-rental/v3/rentals/player/{player}",
      "/delegation-rental/v3/rentals/player/{player}/{role}",
      "/delegation-rental/v3/offers/pending/{player}",
      "/delegation/outgoing/{player}",
      "/delegation/incoming/{player}",
      "/delegation/delegation/{player}/{target}",
      "/delegation-rental/v3/offers",
      "/delegation-rental/v3/offers/lowest-price",
      "/delegation-rental/v3/bids",
      "/delegation-rental/v3/bids/lowest-price",
      "/delegation-rental/bids",
      "/collector/{player}/stickers/tradeable",
      "/collector/{player}/stickers/for_sale",
      "/collector/config",
      "/collector/me",
      "/collector/me/stickers",
      "/collector/me/binders/{binderId}",
      "/market/landing",
      "/market/estimated-price",
      "/market/meta/asset/{assetName}",
      "/market/debug/listing",
      "/market/debug/listing-item",
      "/conflicts/seasons",
      "/conflicts/players",
      "/conflicts/airdrop_distribution",
      "/conflicts/leaderboard",
      "/conflicts/leaderboard_with_player",
      "/conflicts/status",
      "/conflicts/wagon",
      "/conflicts/wagon_eligible_cards",

      "/settings",
      "/last_block",
      "/maintenance_schedule",
      "/transactions/lookup",
      "/transactions/metrics",
      "/",

      "/guilds/list",
      "/guilds/find",
      "/guilds/members",
      "/guilds/contributions",
      "/guilds/brawl_sps_rewards",
      "/guilds/brawl_records",

      "/tournaments/find_brawl",
      "/tournaments/find",
      "/tournaments/crown_pot",
      "/tournaments/frays",
      "/tournaments/prizes",
      "/tournaments/upcoming_official",
      "/tournaments/upcoming",
      "/tournaments/in_progress",
      "/tournaments/completed",
      "/tournaments/cancelled",
      "/tournaments/mine",
      "/tournaments/battles",

      "/battle/history",
      "/battle/history2",
      "/battle/status",
      "/battle/result",
      "/battle/battle_teams_info",
      "/battle/submit_ptr",
      "/battle/battle_queue",

      "/purchases/status",
      "/purchases/settings",
      "/purchases/stats",
      "/purchases/check_uniswap_reward",
      "/market/status",
      "/market/active_status",
      "/market/completed_status",
      "/market/history",
      "/market/for_sale_grouped",
      "/market/market_query_grouped",
      "/market/market_query_by_card",
      "/market/for_rent_grouped",
      "/market/for_sale_packages",
      "/market/volume",
      "/market/active_rentals",
      "/market/rental_history",

      "/players/leaderboard",
      "/players/leaderboard_with_player",
      "/players/richlist",
      "/players/richlist_ranking",
      "/players/burn_event_leaderboard",
      "/players/burn_event_full_leaderboard",
      "/season",

      "/players/balances",
      "/players/archived_balances",
      "/players/authorities",
      "/players/quests",
      "/players/skins",
      "/players/lp_claim_history",
      "/players/reward_delegation_history",
      "/players/reward_delegations",
      "/players/recent_teams",
      "/players/pack_purchases",
      "/players/card_airdrop",
      "/players/voucher",
      "/players/dec",
      "/players/energy_purchase_information",
      "/players/avatar/{name}",
      "/players/player_avatar/{name}",
    ]));
    const entry = catalogue[0];
    expect(entry).toBeDefined();
    const broken = { ...entry } as Record<string, unknown>;
    delete broken.method;
    expect(() => loadCatalogue([broken])).toThrow(/method/);
  });

  it("names no owning tool that was never built", () => {
    // An entry either belongs to a tool that exists, or is unbound and carries its
    // dated classification. Five entries used to name tools nobody had built, kept
    // passing by an allowlist; the allowlist is gone, so a phantom owner fails here.
    const registeredTools = new Set(Object.keys(TOOL_ENTRY_IDS));

    const phantomOwners = catalogue
      .filter((entry) => entry.owningTool !== null && !registeredTools.has(entry.owningTool))
      .map((entry) => `${entry.entryId} -> ${String(entry.owningTool)}`);
    expect(phantomOwners).toEqual([]);

    expect(catalogue.every((entry) => isClassifiedUnbound(entry) || (entry.owningTool !== null && registeredTools.has(entry.owningTool)))).toBe(true);
  });

  it("keeps the working duplicate route unbound with its distinct classification", () => {
    const redundant = catalogue.find((entry) => entry.entryId === "vapi.land.resources.titles-assigned-by-player");
    expect(redundant).toBeDefined();
    if (redundant === undefined) return;
    expect(isClassifiedUnbound(redundant)).toBe(true);
    expect(redundant.notes).toContain("functional but redundant");
    expect(redundant.notes).toContain("land_resources_titles");
    expect(redundant.notes).toContain("HTTP 400");
    expect(redundant.notes).toContain("data:null");
    expect(redundant.notes).not.toContain("non-functional");
  });

  it("keeps the liquidity classifications distinct and unbound", () => {
    const classified = [
      ["vapi.land.liquidity.landpools", "pure duplicate", "land_liquidity_pools"],
      ["vapi.land.liquidity.voucherpool", "pure duplicate", "land_liquidity_pools"],
      ["vapi.land.resources.liquidity.history-swaps", "parameters are inert", "actively misstate"],
      ["vapi.land.liquidity.pools-by-player-token", "fabricates content", "garbage player"],
      ["vapi.land.liquidity.pool-rewards", "parameter's name misdescribes what it selects", "DEC/69"],
    ] as const;
    for (const [entryId, first, second] of classified) {
      const entry = catalogue.find((candidate) => candidate.entryId === entryId);
      expect(entry).toBeDefined();
      if (entry === undefined) continue;
      expect(isClassifiedUnbound(entry)).toBe(true);
      expect(entry.notes).toContain(first);
      expect(entry.notes).toContain(second);
    }
    expect(catalogue.find((entry) => entry.entryId === "vapi.land.resources.liquidity.history-swaps")?.notes).not.toContain("pure duplicate");
    expect(catalogue.find((entry) => entry.entryId === "vapi.land.liquidity.pools-by-player-token")?.notes).not.toContain("pure duplicate");
  });

  it("keeps the server-bound stats classification distinct and unbound", () => {
    const stats = catalogue.find((entry) => entry.entryId === "api.cards.stats");
    expect(stats).toBeDefined();
    if (stats === undefined) return;
    expect(isClassifiedUnbound(stats)).toBe(true);
    expect(stats.notes).toContain("sixth classification kind");
    expect(stats.notes).toContain("this server's 256 KB result bound");
    expect(stats.notes).not.toContain("HTTP 500");
    expect(stats.notes).not.toContain("pure duplicate");
    expect(stats.notes).not.toContain("fabricates content");
    expect(stats.notes).not.toContain("misdescribes what it selects");
  });

  // Semantic: every declared result key has a human semantic class. Mutation: remove valueClass from one fingerprint field. Input: a synthetic entry with that field reaches the schema and must fail before loading.
  it("rejects a fingerprint field without valueClass", () => {
    const entry = catalogue[0];
    expect(entry).toBeDefined();
    const broken = {
      ...entry,
      resultContract: {
        ...entry?.resultContract,
        fingerprint: { "data.id": { type: "string" } },
      },
    };
    expect(() => loadCatalogue([broken])).toThrow(/valueClass/);
  });

  // Semantic: auth is a classification with exactly three values. Mutation: replace authTier on a generated entry with an unrecognised value. Input: the changed entry fails zod validation rather than creating a fourth tier.
  it("keeps the auth tier closed", () => {
    expect(catalogue.every((entry) => entry.declared.authTier === null || entry.declared.authTier === "public" || entry.declared.authTier === "requires_auth" || entry.declared.authTier === "blocked")).toBe(true);
    const entry = catalogue[0];
    expect(() => loadCatalogue([{ ...entry, declared: { ...entry?.declared, authTier: "unknown" } }])).toThrow(/authTier/);
  });

  it("preserves evidence layers and variants through generation and loading", () => {
    const canonical = {
      entryId: "test.evidence.roundtrip",
      host: "vapi" as const,
      pathTemplate: "/test/evidence/{item_id}",
      pathParams: [{ name: "item_id", type: "integer" as const, required: true, isPlayerName: false }],
      queryParams: [{ name: "filter", type: "string" as const, declaredRequired: true, measuredRequired: false, inertUpstream: false }],
      tier: 2 as const,
      declared: { authTier: "requires_auth" as const, pagination: "limit-only" as const },
      measured: { authTier: "blocked" as const, pagination: "client-side" as const, observedAt: "2026-09-06T00:00:00Z" },
      resultContract: {
        envelope: "vapi" as const,
        fingerprint: { status: { type: "string" as const, valueClass: "enum" as const } },
        observedKeyPaths: ["status"],
        requiredKeyPaths: ["status"],
      },
      variants: [{
        variantKey: "alternate",
        resultContract: {
          envelope: "bare" as const,
          fingerprint: { result: { type: "number" as const, valueClass: "numeric" as const } },
          observedKeyPaths: ["result"],
          requiredKeyPaths: ["result"],
        },
      }],
      owningTool: null,
      notes: "synthetic evidence entry",
      provenance: {
        source: "live-observation" as const,
        sourceUrl: null,
        specHash: null,
        specFetchedAt: null,
        observedAt: "2026-09-06T00:00:00Z",
      },
    };

    const generated = generate([canonical]);
    const entry = generated[0];
    if (entry === undefined) {
      throw new Error("generated evidence entry is missing");
    }
    expect(entry).toMatchObject({
      declared: canonical.declared,
      measured: canonical.measured,
      provenance: canonical.provenance,
      variants: canonical.variants,
    });
    expect(entry).not.toHaveProperty("authTier");
    expect(entry).not.toHaveProperty("pagination");
    expect(entry?.resultContract).not.toEqual(entry?.variants?.[0]?.resultContract);
    expect(loadCatalogue(generated)).toEqual(generated);
  });

  it("lets measured optionality override a declared required parameter", () => {
    const [entry] = generate([{
      entryId: "test.evidence.requiredness",
      host: "api",
      pathTemplate: "/test/requiredness",
      queryParams: [{ name: "probe", type: "string", declaredRequired: true, measuredRequired: false, inertUpstream: false }],
      measured: { authTier: null, pagination: null, observedAt: "2026-09-06T00:00:00Z" },
      owningTool: null,
      notes: undefined,
    }]);
    if (entry === undefined) {
      throw new Error("generated requiredness entry is missing");
    }

    expect(inputSchemaForCatalogueEntry(entry).safeParse({}).success).toBe(true);
  });

  it("keeps unknown access and pagination evidence as null", () => {
    const [entry] = generate([{
      entryId: "test.evidence.unknown",
      host: "api",
      pathTemplate: "/test/unknown",
      owningTool: null,
      notes: undefined,
    }]);

    expect(entry?.tier).toBeNull();
    expect(entry?.declared).toEqual({ authTier: null, pagination: null });
    expect(entry?.measured).toBeNull();
  });

  it("rejects unknown and invalid entry metadata", () => {
    const entry = catalogue[0];
    expect(entry).toBeDefined();
    expect(() => loadCatalogue([{ ...entry, authTier: "public" }])).toThrow(/Unrecognized key|unrecognized key/i);
    expect(() => loadCatalogue([{ ...entry, declared: { ...entry?.declared, pagination: "cursor" } }])).toThrow(/pagination/);
  });

  it("validates provenance by source-specific fields", () => {
    const entry = catalogue[0];
    expect(entry).toBeDefined();
    expect(() => loadCatalogue([{
      ...entry,
      provenance: {
        source: "spec",
        sourceUrl: "not-a-url",
        specFetchedAt: "2026-09-06T00:00:00Z",
        specHash: "invalid",
      },
    }])).toThrow(/sourceUrl|specHash/);
    expect(() => loadCatalogue([{ ...entry, provenance: { source: "unknown" } }])).toThrow(/provenance/);
  });

  // Semantic: tools must obtain parameter validation from the selected entry. Mutation: remove a required path parameter from the binding input. Input: the owned-deeds entry receives an empty object and must fail before a client call can exist.
  it("rejects missing required path parameters as programming errors", () => {
    expect(() => bindRequest("vapi.land.deeds.owned", {})).toThrow(CatalogueProgrammingError);
    try {
      bindRequest("vapi.land.deeds.owned", {});
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_parameters" });
    }
  });

  it("passes each explicit account to the owned-deeds path unchanged", async () => {
    const paths: string[] = [];
    const client = {
      request(_host: string, path: CataloguePath) {
        paths.push(path.value);
        return Promise.resolve({
          ok: true,
          data: { status: "success", data: [] },
          endpoint: path.value,
          traceId: "scope",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;

    for (const player of ["__synthetic_account_a__", "__synthetic_account_b__"]) {
      await bindRequest("vapi.land.deeds.owned", { player }).execute(client);
    }

    expect(paths).toEqual([
      "/land/deeds/owned/__synthetic_account_a__",
      "/land/deeds/owned/__synthetic_account_b__",
    ]);
  });

  it("passes each explicit account to the search query unchanged", async () => {
    const queries: Array<Record<string, unknown>> = [];
    const client = {
      request(_host: string, _path: CataloguePath, params: Record<string, unknown>) {
        queries.push(params);
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds",
          traceId: "search-scope",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;
    const first = { ...syntheticSearchParams, player: "__synthetic_account_a__" };
    const second = { ...syntheticSearchParams, player: "__synthetic_account_b__" };

    await bindRequest("vapi.land.deeds.search", first).execute(client);
    await bindRequest("vapi.land.deeds.search", second).execute(client);

    expect(queries).toEqual([first, second]);
  });

  it("preserves non-empty account values with whitespace byte-for-byte", async () => {
    const queries: Array<Record<string, unknown>> = [];
    const client = {
      request(_host: string, _path: CataloguePath, params: Record<string, unknown>) {
        queries.push(params);
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds",
          traceId: "__synthetic_whitespace_scope__",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;
    const player = "  __synthetic_account_whitespace__  ";
    const params = { ...syntheticSearchParams, player };

    await bindRequest("vapi.land.deeds.search", params).execute(client);

    expect(queries).toEqual([params]);
    expect(queries[0]?.player).toBe(player);
  });

  it("rejects whitespace-only account values", () => {
    expect(() => bindRequest("vapi.land.deeds.owned", { player: "   " })).toThrow(/must not be empty/);
  });

  it("rejects blank or missing account scope without creating a fallback", async () => {
    expect(() => bindRequest("vapi.land.deeds.owned", { player: "" })).toThrow(/must not be empty/);
    expect(() => bindRequest("vapi.land.deeds.owned", {})).toThrow(CatalogueProgrammingError);
    expect(() => bindRequest("vapi.land.deeds.search", { ...syntheticSearchParams, player: "" })).toThrow(CatalogueProgrammingError);
    const queries: Array<Record<string, unknown>> = [];
    const client = {
      request(_host: string, _path: CataloguePath, params: Record<string, unknown>) {
        queries.push(params);
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds",
          traceId: "missing-search-player",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;

    // Whether the tool should require an account is a separate, still-open policy decision.
    // The catalogue records upstream behavior; a stricter tool-level rule is this project's choice.
    await bindRequest("vapi.land.deeds.search", { ...syntheticSearchParams, player: undefined }).execute(client);
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toHaveProperty("player");
  });

  // Semantic: an unknown entry cannot reach the transport. Mutation: change a binding call's entryId to one absent from catalogue.json. Input: the resolver has no matching value and must identify the unknown id.
  it("rejects unknown entry ids", () => {
    expect(() => bindRequest("vapi.land.missing", {})).toThrow(/Unknown catalogue entryId/);
  });

  // Semantic: the binding site passes the branded path, symbolic host resolution, query values, and validator to L1. Mutation: change BoundCatalogueRequest.execute to pass any separately assembled path. Input: a catalogue search request with a limit makes the captured request observably different from the bound request if wiring drifts.
  it("binds the contract at the L1 call site", async () => {
    const bound = bindRequest("vapi.land.deeds.search", syntheticSearchParams);
    let seen: { host?: string; path?: unknown; params?: unknown; validate?: unknown } = {};
    const client = {
      request(host: string, path: unknown, params: unknown, options: { validate?: unknown }) {
        seen = { host, path, params, validate: options.validate };
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds?limit=10",
          traceId: "guard",
          freshness: { retrievedAt: "2026-09-04T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;
    await bound.execute(client);
    expect(seen?.host).toBe(bound.hostname);
    expect(seen?.path).toBe(bound.path);
    expect(seen?.params).toEqual(syntheticSearchParams);
    expect(typeof seen?.validate).toBe("function");
  });

  // Semantic: the shared fingerprint is stable and preserves semantic classes. Mutation: stop sorting key paths in fingerprint.ts. Input: intentionally reverse-ordered declared fields expose nondeterministic output.
  it("sorts the declared fingerprint through one shared function", () => {
    const contract = {
      envelope: "vapi" as const,
      fingerprint: {
        "z.value": { type: "number" as const, valueClass: "numeric" as const },
        "a.value": { type: "string" as const, valueClass: "enum" as const },
      },
      requiredKeyPaths: [],
    };
    expect(Object.keys(fingerprint({ declared: contract }))).toEqual(["a.value", "z.value"]);
    expect(fingerprint({ declared: contract })["a.value"]?.valueClass).toBe("enum");
  });

  // Semantic: each variant names the contract used by its request. Mutation: delete a named variant from the generated entry. Input: selecting that variant must fail instead of silently falling back to default.
  it("does not silently fall back from an unknown variant", () => {
    expect(() => inputSchemaFor("vapi.land.deeds.search", "not-present")).toThrow(/unknown variantKey/);
    expect(bindRequest("vapi.land.deeds.search", syntheticSearchParams, "limited").variantKey).toBe("limited");
  });

  it("selects a variant validator without adding a query preset", async () => {
    const bound = bindRequest("vapi.land.deeds.search", syntheticSearchParams, "limited");
    let seen: { params?: unknown; validate?: unknown } = {};
    const client = {
      request(_host: string, _path: unknown, params: unknown, options: { validate?: unknown }) {
        seen = { params, validate: options.validate };
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds",
          traceId: "variant",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;

    await bound.execute(client);
    expect(bound.variantKey).toBe("limited");
    expect(seen.params).toEqual(syntheticSearchParams);
    expect(typeof seen.validate).toBe("function");
  });

  it("preserves account and geography selectors across a pagination continuation", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = {
      request(_host: string, _path: CataloguePath, params: Record<string, unknown>) {
        seen.push(params);
        return Promise.resolve({
          ok: true,
          data: {},
          endpoint: "/land/deeds",
          traceId: "pagination-scope",
          freshness: { retrievedAt: "2026-09-06T00:00:00.000Z", ageMs: 0 },
        });
      },
    } as unknown as SplinterlandsHttpClient;
    const firstPage = { ...syntheticSearchParams, offset: 900000004 };
    const continuation = { ...syntheticSearchParams, offset: 900000104 };

    await bindRequest("vapi.land.deeds.search", firstPage).execute(client);
    await bindRequest("vapi.land.deeds.search", continuation).execute(client);

    expect(seen).toEqual([firstPage, continuation]);
    expect(seen[1]).toMatchObject({
      player: "__synthetic_player__",
      tract_id: 900000001,
      region_number: 900000002,
    });
  });

  function valueContract(declaration: ResultContract["fingerprint"][string]): ResultContract {
    return {
      envelope: "vapi",
      fingerprint: {
        status: { type: "string", valueClass: "enum" },
        "data.value": declaration,
      },
      observedKeyPaths: ["status", "data.value"],
      requiredKeyPaths: ["status", "data.value"],
    };
  }

  function valueBody(value: unknown): unknown {
    return { status: "success", data: { value } };
  }

  it("F5 fails before Phase B and passes after nullable matcher handling", () => {
    const nullable = { type: "number" as const, valueClass: "numeric" as const, nullable: true };
    const nonNullable = { type: "number" as const, valueClass: "numeric" as const };
    const cases: Array<[string, ResultContract["fingerprint"][string], unknown, boolean]> = [
      ["nullable declaration with null", nullable, null, true],
      ["nullable declaration with declared type", nullable, 1, true],
      ["nullable declaration with another type", nullable, "wrong", false],
      ["non-nullable declaration with null", nonNullable, null, false],
    ];

    for (const [label, declaration, value, expected] of cases) {
      expect(matchesResultContract(valueBody(value), valueContract(declaration)), label).toBe(expected);
    }
    expect(matchesResultContract(valueBody(1), valueContract(nonNullable))).toBe(true);
    expect(matchesResultContract({ status: "success", data: {} }, valueContract(nonNullable))).toBe(false);
    expect(matchesResultContract({ status: "success", data: { value: 1, additive: true } }, valueContract(nonNullable))).toBe(true);
  });

  it("F5b fails before Phase B and passes after both null declaration forms are rejected", () => {
    const entry = catalogue.find((candidate) => candidate.entryId === "vapi.land.deeds.by-plot");
    expect(entry).toBeDefined();
    const fingerprintWith = (field: Record<string, unknown>) => ({
      ...entry,
      resultContract: {
        ...entry?.resultContract,
        fingerprint: { ...entry?.resultContract.fingerprint, "data.forbidden": field },
        observedKeyPaths: [...(entry?.resultContract.observedKeyPaths ?? []), "data.forbidden"],
      },
    });

    expect(() => loadCatalogue([fingerprintWith({ type: "null", valueClass: "opaque" })])).toThrow(/null/);
    expect(() => loadCatalogue([fingerprintWith({ type: "null", nullable: true, valueClass: "opaque" })])).toThrow(/null/);
  });

  it("F6 fails before Phase B and passes when catalogue nullability survives loading", () => {
    const entry = catalogue.find((candidate) => candidate.entryId === "vapi.land.deeds.by-plot");
    expect(entry?.resultContract.fingerprint["data.resource_id"]?.nullable).toBe(true);
    expect(entry?.resultContract.fingerprint["data.resource_symbol"]?.nullable).toBe(true);
  });
});
