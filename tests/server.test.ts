import { SCENARIO_TOOL_ROUTES } from "../src/land-scenario-snapshot.js";
import { HIVE_TOOL_ROUTES } from "../src/hive-tools.js";
import { PLOT_TOOL_KEYS } from "../src/plot-tool-adapter.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import listedFixture from "./fixtures/land-deed-listed.fixture.json" with { type: "json" };
import byUidFixture from "./fixtures/land-deed-by-uid-hit.fixture.json" with { type: "json" };
import searchLimitedFixture from "./fixtures/land-deeds-search-limited.fixture.json" with { type: "json" };
import historyRowsFixture from "./fixtures/land-projects-history-rows.fixture.json" with { type: "json" };
import stakeAssetsEmpty from "./fixtures/land-stake-assets-empty.fixture.json" with { type: "json" };
import stakeAssetsRows from "./fixtures/land-stake-assets-rows.fixture.json" with { type: "json" };
import stakeDetailsZeroed from "./fixtures/land-stake-deed-details-zeroed.fixture.json" with { type: "json" };
import stakeDetailsActive from "./fixtures/land-stake-deed-details-active.fixture.json" with { type: "json" };
import resourcesRichlist from "./fixtures/land-resources-richlist.fixture.json" with { type: "json" };
import resourcesLeaderboards from "./fixtures/land-resources-leaderboards.fixture.json" with { type: "json" };
import { getCatalogueEntry, inputSchemaFor } from "../src/catalogue/index.js";
import { matchesResultContract } from "../src/catalogue/fingerprint.js";
import { createServer, MAX_RESULT_BYTES, TOOL_ENTRY_IDS } from "../src/server.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deedBody() {
  return {
    status: "success",
    data: {
      created_block_num: 1,
      created_date: "2026-09-04T12:56:07Z",
      created_tx: "tx-0001",
      deed_type: "plot",
      deed_uid: "deed-0001",
      hex_code: "A1",
      in_use: false,
      is_construction: false,
      item_detail_id: 1,
      land_stats: "{}",
      listed: false,
      lock_days: 0,
      magic_type: "neutral",
      map_name: "map",
      player: "__synthetic_player__",
      plot_id: 13339,
      plot_number: 1,
      plot_status: "active",
      rarity: "common",
      rarity_sort_value: 1,
      region_id: 1,
      region_name: "region",
      region_number: 1,
      region_uid: "region-0001",
      resource_id: 1,
      resource_symbol: "RESOURCE",
      stats: "{}",
      tax_rate: "0",
      territory: "territory",
      time_crystal_value: 0,
      tract_id: 1,
      tract_number: 1,
      worksite_type: "none",
      future_field: "tolerated",
    },
  };
}

function resolvedDeedBody(uid: string) {
  return { status: byUidFixture.status, data: { ...byUidFixture.data, deed_uid: uid } };
}

function ownedDeedsBody() {
  return {
    status: "success",
    data: [{ uid: "deed-0001", count: 3 }],
  };
}

function ownedRowsBody(count: number, uidLength = 8) {
  return {
    status: "success",
    data: Array.from({ length: count }, (_, index) => ({ uid: `deed-${String(index).padStart(4, "0")}-${"x".repeat(uidLength)}`, count: 1 })),
  };
}

function ownedRowsBodyAtBytes(targetBytes: number) {
  const secondRow = { uid: "x", count: 1 };
  const base = { status: "success", data: [{ uid: "", count: 1 }, secondRow] };
  const fixedBytes = new TextEncoder().encode(JSON.stringify(base)).byteLength;
  return { status: "success", data: [{ uid: "x".repeat(targetBytes - fixedBytes), count: 1 }, secondRow] };
}

function searchLimitedBody() {
  return { status: searchLimitedFixture.status, data: searchLimitedFixture.data };
}

describe("land deed MCP protocol", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  async function connect(fetch: typeof globalThis.fetch): Promise<Client> {
    let clock = Date.now();
    const advance = async (ms: number) => { clock += ms; };
    server = createServer({ fetch, now: () => clock, sleep: advance, limiterOptions: { sleep: advance } });
    client = new Client({ name: "splinterlands-mcp-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
  }

  it("lists all bound tools and their inputs", async () => {
    const protocol = await connect(async () => jsonResponse(deedBody()));

    const result = await protocol.listTools();

    expect(result.tools).toHaveLength(Object.keys(TOOL_ENTRY_IDS).length + 3 + Object.keys(HIVE_TOOL_ROUTES).length + Object.keys(SCENARIO_TOOL_ROUTES).length);
    expect(result.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "land_deed_by_plot",
        inputSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            plot_id: expect.objectContaining({ anyOf: expect.arrayContaining([expect.objectContaining({ type: "integer", minimum: 1 }), expect.objectContaining({ type: "string" })]) }),
          }),
        }),
      }),
      expect.objectContaining({
        name: "land_deed_by_uid",
        inputSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            deed_uid: expect.objectContaining({ type: "string", minLength: 1 }),
          }),
        }),
      }),
      expect.objectContaining({
        name: "land_deeds_owned",
        description: "Return the per-region plot counts reported for one account; the tool name is historical, and the response contains region rows rather than individual land records. A successful response has {status, data}, where data is an array of {count, uid} rows and uid is the region identifier. data: null was observed for an unrecognised account; behaviour for a known account with no land was not captured. Query probes limit=2 and offset=5 returned bodies byte-identical to the no-query response, so those tried values had no effect.",
        inputSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            player: expect.objectContaining({ type: "string" }),
          }),
          required: ["player"],
        }),
      }),
      expect.objectContaining({
        name: "land_deeds_search",
        description: expect.stringContaining("The observed ordered probe with orderBy=desc returned an empty array (measured 2026-09-06), and this server's contract currently accepts that response. A non-empty ordered response would be reported as malformed rather than returned. Because the observed ordered response was empty, no row bound or truncation is described for that form."),
        inputSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            limit: expect.objectContaining({ type: "number" }),
            player: expect.objectContaining({ type: "string" }),
            tract_id: expect.objectContaining({ type: "number" }),
            region_number: expect.objectContaining({ type: "number" }),
          }),
          required: ["limit"],
        }),
      }),
      expect.objectContaining({
        name: "land_resources_richlist",
        description: "List the resource-richlist rows the upstream returns for one region and one resource, as GET /land/resources/richlist returns them. A successful response is {status, data}, where data is an array of rows carrying player, amount, region_uid and resource_symbol. amount is a JSON number, and this server returns it unchanged; it does not convert, round, total or compare it, and a change in that wire type would be reported as a malformed response rather than converted silently. The upstream matches resource case-sensitively against its exact symbol. This tool uppercases resource before making the request, but it does not enforce an enum because the observed symbols are not a declared exhaustive set. An unrecognised resource or region was observed to return data:[], which this server cannot distinguish from a genuinely empty ranking. Both region and resource are required by the upstream, and this tool refuses either missing parameter before making the request. This route uses region, not region_uid; other routes in this server take region_uid, and carrying that parameter name across to this route produces HTTP 400. Paging probes supplied offset=0, offset=5, page=2, cursor=5 and start=5; each returned parsed data equal to the limit=5 baseline. limit=50 returned 50 rows whose first five matched that baseline in the same order, and no ceiling was found at the tested limits 5 and 50. No value tried for offset, page, cursor or start produced a later slice. This tool reports the rows the upstream returned and nothing else.",
      }),
      expect.objectContaining({
        name: "land_resources_leaderboards",
        description: "List the resource-leaderboard rows the upstream returns, as GET /land/resources/leaderboards returns them. A successful response is {status, data}, where data is an array of rows carrying rank, player, amount, amount2, resource_per_hour, guild, title_pre, data and id. The numeric fields are JSON numbers, and this server returns them unchanged; it does not convert, round, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. The nested data field is a JSON-encoded string, not an object; this server returns it exactly as received and does not parse it, and a change in that wire type would be reported as malformed rather than converted. The upstream matches resource case-sensitively against its exact symbol. This tool uppercases resource before making the request, but it does not enforce an enum because the observed symbols are not a declared exhaustive set. Omitting resource returned HTTP 400. Omitting region with no territory produced no HTTP response in two measurements and timed out; territory was observed to work standalone without region, so this tool refuses only when both region and territory are absent. That refusal is this server's safety choice based on the observed hang, not an upstream validation rule. Supplying player returned that player's row in addition to the normal top rows. Paging probes supplied offset=0, offset=5, page=2 and from=5; each returned parsed data equal to the limit=5 baseline. limit=50 returned 50 rows whose first five matched that baseline in the same order, and no ceiling was found at the tested limits 5 and 50. No value tried for offset, page or from produced a later slice. This tool reports the rows the upstream returned and nothing else.",
      }),
      expect.objectContaining({ name: "land_projects_active" }),
      expect.objectContaining({ name: "land_projects_history" }),
      expect.objectContaining({ name: "land_projects_count" }),
      expect.objectContaining({ name: "land_projects_requirements" }),
      expect.objectContaining({
        name: "land_regions_counts",
        description: "List the 150 region count rows returned by GET /land/regions/counts. The unscoped call returns {status: \"success\", data: []}, an empty list. When a player is named, the response still carries all 150 regions rather than only that player's regions. Each row contains region.uid, region.name, region.region_number, for_sale, owned, listed, min_price and dec_stake. owned and dec_stake are the named player's fields. An unknown name returned the 150-row shape with owned and dec_stake zero; behaviour for a known account with no holdings was not captured.",
      }),
      expect.objectContaining({
        name: "land_tracts_counts",
        description: "List the tract count rows returned by GET /land/tracts/counts. The unscoped call returns {status: \"success\", data: []}, an empty list. A captured named-player response returned 36 rows, one per (region, tract_number) combination for which the account holds a deed. Each row contains region.uid, region.name, region.region_number, tract_number, owned and listed; all six row fields were present and non-null in every captured row. Whether any field is player-wide or player-scoped beyond this captured row shape is unmeasured, so this description makes no further absence claim.",
      }),
      expect.objectContaining({
        name: "land_volume",
        description: "Get the two land volume figures the upstream returns for GET /land/volume: a sum and a count. This route takes no parameters. Both figures are the upstream's own values. They were observed to change between two captures about an hour apart, and to decrease, so this server does not present them as a cumulative total. When this server observed the route, both figures were returned as JSON strings rather than numbers; that was true of every observation so far, not a guarantee about every response. This server passes the response through unchanged and does not convert, round or combine the figures, and a change in that wire type would be reported as a malformed response rather than converted silently. What the two figures measure, and over what period, is not stated by the response and is not claimed here.",
      }),
      expect.objectContaining({
        name: "land_stake_assets",
        description: expect.stringContaining("List the cards and items staked to one land deed, as GET /land/stake/deeds/{deedUid}/assets returns them. A successful response has {status, data}, where data holds a cards array and an items array; a deed with nothing staked returns both arrays present and empty, which is a successful answer and not a failure. On this route the boost, production-point and work figures are JSON strings, not numbers, and this server returns them exactly as received: it does not convert, round, compare or combine them, and a change in that wire type would be reported as a malformed response rather than converted silently. The deed-details tool returns the equivalent deed-level figures as JSON numbers; the two routes disagree about wire type and this server does not reconcile them. Rows carry the staking account name as the upstream returns it. A deed uid the upstream rejects is answered with an HTTP error on this route and is reported as an upstream failure rather than as an empty result, so this tool and the deed-details tool do not behave alike on a bad deed uid. This tool adds only a same-response worker label view: it does not count free slots, does not infer whether a deed is powered, and makes no statement about cards the response does not list."),
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({ deed_uid: expect.objectContaining({ type: "string", minLength: 1 }) }),
        }),
      }),
      expect.objectContaining({
        name: "land_stake_deed_details",
        description: expect.stringContaining("Get the staking summary the upstream reports for one land deed, as GET /land/stake/deed/details/{deedUid} returns it. A successful response has {status, data}, where data is one flat record of the deed's staking flags, worker counts, boosts and totals. A deed with nothing staked returns that record fully present, with its numeric fields zero and its boolean flags false, so an empty answer on this route is a populated record rather than an absent one. On this route the boost and total figures are JSON numbers; the deed-assets tool returns the equivalent per-card figures as JSON strings. The two routes disagree about wire type, this server returns each exactly as received, and a change in that wire type would be reported as a malformed response rather than converted silently. The record carries a `manager` string as returned by the upstream; its role is not stated. A deed uid the upstream does not recognise was measured to return a successful response holding no record rather than an error, so an answer holding no record establishes neither that the deed exists nor that it does not: this server cannot tell it apart from a deed that exists and has no staking record. The one deed with nothing staked that this repository observed returned the zeroed record described above rather than no record, which is a single observation and not a rule. The deed-assets tool answers a rejected deed uid with an upstream error instead, so the two tools do not behave alike on a bad deed uid. This tool reports only what the record states: it does not compute free slots, does not derive which cards are staked, and does not treat a total as evidence about any individual card."),
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({ deed_uid: expect.objectContaining({ type: "string", minLength: 1 }) }),
        }),
      }),
      expect.objectContaining({
        name: "land_stake_dec_overall",
        description: "Get the single DEC staking figure the upstream returns for one account, as GET /land/stake/dec/overall returns it. A successful response is {status, data}, where data is a bare JSON number rather than an object or an array; this server returns it exactly as received and does not convert, round, scale or combine it, and a change in that wire type would be reported as a malformed response rather than converted silently. What the number counts, and over what scope, is not stated by the response and is not claimed here. This route does not enforce its declared-required player parameter: a call that omits it was measured to answer HTTP 200 with the number zero, the same zero observed for an unscoped call; whether that equals a real account with nothing staked was not tested, so this tool refuses a call with no player rather than return a plausible zero that describes nobody. A name that matches no account was measured to answer with the same kind of figure as a real account, so an answer from this tool establishes neither that an account exists nor that it does not. A zero returned for a named account is a successful answer and is not reported as no result. The per-region tool lists this account's staking rows separately; this server does not add those rows up, does not compare their total with this figure, and does not derive either from the other.",
        inputSchema: expect.objectContaining({ properties: expect.objectContaining({ player: { type: "string", minLength: 1 } }) }),
      }),
      expect.objectContaining({
        name: "land_stake_dec_staked",
        description: "List the per-region DEC staking rows the upstream reports for one account, as GET /land/stake/decstaked returns them. A successful response is {status, data}, where data is an array of rows carrying id, region_uid, player, amount, percent_claimable, last_trx, created_date and last_updated_date. Every numeric field on this route is a JSON number, and a change in that wire type would be reported as a malformed response rather than converted silently. Rows carry the account name as the upstream returns it. An empty array is a successful answer, and an unknown name and an unscoped call were observed to return an empty array; behaviour for a known account with no staked DEC was not captured, so an empty answer establishes neither that an account exists nor that it does not. This route does not enforce its declared-required player parameter — a call with no parameters at all was measured to return that same empty array — so this tool refuses a call with no player rather than return an unscoped empty answer as though it described somebody. What percent_claimable measures is not stated by the response and is not claimed here. This tool reports the rows the upstream returned and nothing else: it does not total the amounts, does not compare them with the account's overall figure, and makes no statement about regions the response does not list.",
      }),
      expect.objectContaining({
        name: "land_stake_dec_region",
        description: "Get the DEC staking figures the upstream reports for one account and one land region, as GET /land/stake/dec/region returns them. A successful response is {status, data}. data is an object carrying uid, dec_stake_needed, dec_staked and dec_stake_in_use when the upstream has a record for the request, including a full object of zero figures when a valid region has no stake for the account; the upstream returned an empty array for incomplete requests, but this registered tool refuses those requests before making the call. All three figures are JSON numbers, and a change in that wire type would be reported as a malformed response rather than converted silently. Removing player changed a resolved object response to an empty array; no numeric comparison was made. What each figure counts is still not stated by the response and is not claimed here. Neither declared-required parameter is enforced: a call omitting region_uid, and a call with no parameters at all, were both measured to answer HTTP 200 with an empty array, so this tool refuses a call that does not supply both player and region_uid. Different region uids were measured to return different figures. This tool reports the record the upstream returned for the request it was given and nothing else: it does not add figures across regions and does not compare them with any other route's.",
      }),
      expect.objectContaining({
        name: "land_stake_evp_pending_claim",
        description: "Get the pending EVP claim figure the upstream reports for one account, as GET /land/stake/evp/pending-claim returns it. A successful response is {status, data}, where data is an object carrying a single pending_claim_amount field, a JSON number returned exactly as received; this server does not convert, round or accumulate it, and a change in that wire type would be reported as a malformed response rather than converted silently. What EVP is, what makes an amount claimable, and over what period the figure accrues are not stated by the response and are not claimed here. A zero is a successful answer. This server has observed zero for both a real account and a name that matches no account, while the real account's pending amount was also zero; whether this route distinguishes those cases is untested, so no answer from this tool may be read as saying that an account exists or that it does not. A call with no parameters at all was measured to answer HTTP 200 with a figure, so this tool refuses a call with no player rather than return a figure that describes nobody. This tool reports the figure the upstream returned and nothing else: it does not accumulate it, compare it with any DEC figure, or treat it as a balance.",
      }),
      expect.objectContaining({ name: "list_endpoints" }),
      expect.objectContaining({ name: "describe_endpoint" }),
    ]));

    const endpointTools = result.tools.filter((tool) => tool.name !== "list_endpoints" && tool.name !== "describe_endpoint" && tool.name !== "land_lineup_estimate" && !HIVE_TOOL_ROUTES[tool.name] && !SCENARIO_TOOL_ROUTES[tool.name]);
    expect(Object.keys(TOOL_ENTRY_IDS).sort()).toEqual(endpointTools.map((tool) => tool.name).sort());
    for (const tool of endpointTools) {
      const toolName = tool.name as keyof typeof TOOL_ENTRY_IDS;
      const entryId = TOOL_ENTRY_IDS[toolName];
      const keys = Object.keys(inputSchemaFor(entryId).shape);
      if (PLOT_TOOL_KEYS[tool.name]) keys.push("plot_id", "deed_uid");
      if (tool.name === "player_inventory") keys.push("item_detail_id");
      if (tool.name === "cards_collection") keys.push("include_plot_references");
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual([...new Set(keys)].sort());
    }
    expect(result.tools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    const regions = result.tools.find((tool) => tool.name === "land_regions_counts");
    expect(regions?.inputSchema.properties).toEqual({
      player: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
      plot_type: { type: "string", minLength: 1 },
      magic_type: { type: "string", minLength: 1 },
      rarity: { type: "string", minLength: 1 },
      geography: { type: "string", minLength: 1 },
      kingdom_type: { type: "string", minLength: 1 },
    });
    expect(regions?.inputSchema.required ?? []).toEqual([]);
    const tracts = result.tools.find((tool) => tool.name === "land_tracts_counts");
    expect(tracts?.inputSchema.properties).toEqual({ player: { type: "string", minLength: 1 } });
    expect(tracts?.inputSchema.required ?? []).toEqual([]);
    // No blanket "no numeric bounds anywhere" assertion here: land_deed_by_plot.plot_id
    // carries a deliberate minimum of 1, and a rule forbidding every bound would be
    // satisfied by deleting that one -- which is how it went missing once before.
    // Bounds are pinned per parameter instead: the three tools above by toEqual on their
    // whole property objects, plot_id and the history limit further down.

    const history = result.tools.find((tool) => tool.name === "land_projects_history");
    expect(history?.inputSchema.properties?.deed_uid).toMatchObject({ type: "string", minLength: 1 });
    expect(history?.inputSchema.required).toBeUndefined();
    expect(history?.inputSchema.properties?.limit).not.toHaveProperty("maximum");
  });

  it("uppercases owned-resource symbols before the catalogue request and refuses missing scope", async () => {
    const requestedUrls: string[] = [];
    const protocol = await connect(async (input) => {
      requestedUrls.push(input instanceof Request ? input.url : String(input));
      return jsonResponse({ status: "success", data: [] });
    });

    const result = await protocol.callTool({
      name: "land_resources_owned",
      arguments: { player: "__synthetic_player__", resource: "grain" },
    });
    expect(result.isError).not.toBe(true);
    expect(new URL(requestedUrls[0]!).searchParams.get("resource")).toBe("GRAIN");

    const refused = await protocol.callTool({
      name: "land_resources_owned",
      arguments: { player: "__synthetic_player__" },
    });
    expect(refused.isError).toBe(true);
    expect(requestedUrls).toHaveLength(1);
  });

  it("binds richlist and leaderboards scopes, uppercases resources, and refuses the measured hang", async () => {
    const requestedUrls: string[] = [];
    const protocol = await connect(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      return url.includes("/land/resources/richlist")
        ? jsonResponse(resourcesRichlist)
        : jsonResponse(resourcesLeaderboards);
    });

    const richlist = await protocol.callTool({
      name: "land_resources_richlist",
      arguments: { region: "PR-PNW-1", resource: "grain", limit: 5 },
    });
    expect(richlist.isError).not.toBe(true);
    const richlistUrl = new URL(requestedUrls[0]!);
    expect(richlistUrl.pathname).toBe("/land/resources/richlist");
    expect(richlistUrl.searchParams.get("region")).toBe("PR-PNW-1");
    expect(richlistUrl.searchParams.get("resource")).toBe("GRAIN");

    const leaderboards = await protocol.callTool({
      name: "land_resources_leaderboards",
      arguments: { region: "PR-PNW-1", resource: "grain", limit: 5, player: "sample-account-a" },
    });
    expect(leaderboards.isError).not.toBe(true);
    const leaderboardsUrl = new URL(requestedUrls[1]!);
    expect(leaderboardsUrl.pathname).toBe("/land/resources/leaderboards");
    expect(leaderboardsUrl.searchParams.get("region")).toBe("PR-PNW-1");
    expect(leaderboardsUrl.searchParams.get("resource")).toBe("GRAIN");
    expect(leaderboardsUrl.searchParams.get("player")).toBe("sample-account-a");

    const territoryOnly = await protocol.callTool({
      name: "land_resources_leaderboards",
      arguments: { territory: "Pristine Northwest", resource: "grain", limit: 5 },
    });
    expect(territoryOnly.isError).not.toBe(true);
    expect(requestedUrls).toHaveLength(3);

    const refused = await protocol.callTool({
      name: "land_resources_leaderboards",
      arguments: { resource: "grain", limit: 5 },
    });
    expect(refused.isError).toBe(true);
    expect((refused.content as Array<{ text?: string }>)[0]?.text).toContain("either a region or a territory");
    expect(requestedUrls).toHaveLength(3);
  });

  it("binds staking tools to their separate routes and preserves captured empty states", async () => {
    const urls: string[] = [];
    const assetsEmptyBody = { status: stakeAssetsEmpty.status, data: stakeAssetsEmpty.data };
    const assetsRowsBody = { status: stakeAssetsRows.status, data: stakeAssetsRows.data };
    const detailsZeroedBody = { status: stakeDetailsZeroed.status, data: stakeDetailsZeroed.data };
    const detailsActiveBody = { status: stakeDetailsActive.status, data: stakeDetailsActive.data };
    const protocol = await connect(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/land/deeds/details/")) return jsonResponse(resolvedDeedBody(decodeURIComponent(new URL(url).pathname.split("/").at(-1)!)));
      if (url.includes("/assets")) {
        if (url.endsWith("/bad/assets")) return jsonResponse({ message: "bad deed", status: "fail" }, 400);
        if (url.endsWith("/null/assets")) return jsonResponse({ status: "success", data: null });
        return jsonResponse(url.endsWith("/empty/assets") ? assetsEmptyBody : assetsRowsBody);
      }
      if (url.endsWith("/none")) return jsonResponse({ status: "success", data: null });
      return jsonResponse(url.endsWith("/zeroed") ? detailsZeroedBody : detailsActiveBody);
    });

    const assetsEmptyResult = await protocol.callTool({ name: "land_stake_assets", arguments: { deed_uid: "empty" } });
    const assetsNullResult = await protocol.callTool({ name: "land_stake_assets", arguments: { deed_uid: "null" } });
    const detailsZeroedResult = await protocol.callTool({ name: "land_stake_deed_details", arguments: { deed_uid: "zeroed" } });
    const detailsNullResult = await protocol.callTool({ name: "land_stake_deed_details", arguments: { deed_uid: "none" } });
    const assetsRowsResult = await protocol.callTool({ name: "land_stake_assets", arguments: { deed_uid: "rows" } });
    expect(assetsRowsResult.structuredContent).toMatchObject({ worker_view: {
      reference: "splinterlands://land/rules/screen-fields",
      workers: expect.arrayContaining([expect.objectContaining({ display: expect.objectContaining({
        "Boostable Production": stakeAssetsRows.data.cards[0]!.total_construction_pp,
        "Total Production": stakeAssetsRows.data.cards[0]!.total_harvest_pp,
      }) })]),
    } });
    const detailsActiveResult = await protocol.callTool({ name: "land_stake_deed_details", arguments: { deed_uid: "active" } });
    const assetsBadResult = await protocol.callTool({ name: "land_stake_assets", arguments: { deed_uid: "bad" } });

    expect(urls).toEqual([
      "https://vapi.splinterlands.com/land/deeds/details/empty",
      "https://vapi.splinterlands.com/land/stake/deeds/empty/assets",
      "https://vapi.splinterlands.com/land/deeds/details/null",
      "https://vapi.splinterlands.com/land/stake/deeds/null/assets",
      "https://vapi.splinterlands.com/land/deeds/details/zeroed",
      "https://vapi.splinterlands.com/land/stake/deed/details/zeroed",
      "https://vapi.splinterlands.com/land/deeds/details/none",
      "https://vapi.splinterlands.com/land/stake/deed/details/none",
      "https://vapi.splinterlands.com/land/deeds/details/rows",
      "https://vapi.splinterlands.com/land/stake/deeds/rows/assets",
      "https://vapi.splinterlands.com/land/deeds/details/active",
      "https://vapi.splinterlands.com/land/stake/deed/details/active",
      "https://vapi.splinterlands.com/land/deeds/details/bad",
      "https://vapi.splinterlands.com/land/stake/deeds/bad/assets",
    ]);
    expect(assetsEmptyResult.isError).not.toBe(true);
    expect(assetsEmptyResult.structuredContent).toMatchObject(assetsEmptyBody);
    expect((assetsEmptyResult.content as Array<{ text?: string }>)[0]?.text).toBe("No cards or items are staked to this deed.");
    // This synthetic data:null body exercises the assets route's retained standard empty branch.
    expect((assetsNullResult.content as Array<{ text?: string }>)[0]?.text).toBe("The upstream returned no staking record for this deed.");
    expect(detailsZeroedResult.structuredContent).toMatchObject(detailsZeroedBody);
    const zeroedText = JSON.parse((detailsZeroedResult.content as Array<{ text: string }>)[0]!.text);
    expect(zeroedText.data).toEqual(detailsZeroedBody.data);
    expect(zeroedText.plot_view.display).toEqual({ "PRODUCTION / HR": 0 });
    expect((detailsNullResult.content as Array<{ text?: string }>)[0]?.text).toBe("The upstream returned no staking record for this deed.");
    // The captured R8 record in tests/evidence/land-result-contract-evidence.json exercises the details empty branch.
    expect(detailsNullResult.structuredContent).toMatchObject({ status: "success", data: null });
    expect((assetsRowsResult.structuredContent as { data: { cards: Array<Record<string, unknown>> } }).data.cards[0]?.land_base_pp).toEqual(expect.any(String));
    expect((detailsActiveResult.structuredContent as { data: Record<string, unknown> }).data.total_base_pp).toEqual(expect.any(Number));
    // This captured R7 body never reaches a result contract because HTTP 400 is classified first.
    expect(assetsBadResult.isError).toBe(true);
    expect(assetsBadResult.structuredContent).toMatchObject({ kind: "upstream_malformed", endpoint: "/land/stake/deeds/{deedUid}/assets" });
    // `status` here is the HTTP code this server reports, not the upstream envelope's own
    // `status: "fail"` string. The point of this assertion is that the upstream's vocabulary
    // does not leak through: our value is the number 400, never the word "fail".
    expect(assetsBadResult.structuredContent).toMatchObject({ status: 400 });
    expect(JSON.stringify(assetsBadResult.structuredContent)).not.toContain("fail");
  });

  it("binds the count and volume tools with catalogue request shapes", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/land/volume")) {
        return jsonResponse({ status: "success", data: { sum: "synthetic-sum", count: "synthetic-count" } });
      }
      return jsonResponse({ status: "success", data: [] });
    });

    const regions = await protocol.callTool({ name: "land_regions_counts", arguments: { player: "__synthetic_player__", status: "active" } });
    const tracts = await protocol.callTool({ name: "land_tracts_counts", arguments: {} });
    const volume = await protocol.callTool({ name: "land_volume", arguments: {} });

    expect(urls).toEqual([
      "https://vapi.splinterlands.com/land/regions/counts?player=__synthetic_player__&status=active",
      "https://vapi.splinterlands.com/land/tracts/counts",
      "https://vapi.splinterlands.com/land/volume",
    ]);
    expect(regions.isError).not.toBe(true);
    expect(regions.structuredContent).toStrictEqual({ status: "success", data: [] });
    expect((regions.content as Array<{ text?: string }>)[0]?.text).toBe("The upstream returned no region count rows for this request.");
    expect(regions._meta).toMatchObject({ provenance: { endpoint: "/land/regions/counts", requestScope: { player: { supplied: true }, status: "active" } } });
    expect(JSON.stringify(regions)).not.toContain("__synthetic_player__");
    expect(tracts.isError).not.toBe(true);
    expect(tracts.structuredContent).toStrictEqual({ status: "success", data: [] });
    expect((tracts.content as Array<{ text?: string }>)[0]?.text).toBe("The upstream returned no tract count rows for this request.");
    expect(volume.isError).not.toBe(true);
    expect(volume.structuredContent).toStrictEqual({ status: "success", data: { sum: "synthetic-sum", count: "synthetic-count" } });
    expect(typeof (volume.structuredContent as { data: { sum: unknown } }).data.sum).toBe("string");
    expect(typeof (volume.structuredContent as { data: { count: unknown } }).data.count).toBe("string");
    for (const result of [regions, tracts, volume]) {
      expect(result._meta).toMatchObject({ provenance: { endpoint: expect.stringMatching(/^\/land\//) } });
    }
  });

  it("refuses unscoped DEC calls and preserves each route's response shape", async () => {
    let fetchCalls = 0;
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      fetchCalls += 1;
      const url = String(input);
      urls.push(url);
      if (url.includes("/dec/overall")) return jsonResponse({ status: "success", data: 0 });
      if (url.includes("/decstaked")) return jsonResponse({
        status: "success",
        data: [{
          id: 1,
          region_uid: "region-0001",
          player: "synthetic-player",
          amount: 1,
          percent_claimable: 0,
          last_trx: "trx-0001",
          created_date: "2026-01-01T00:00:00Z",
          last_updated_date: "2026-01-01T00:00:00Z",
        }],
      });
      if (url.includes("/dec/region")) return jsonResponse({
        status: "success",
        data: { uid: "region-0001", dec_stake_needed: 0, dec_staked: 0, dec_stake_in_use: 0 },
      });
      return jsonResponse({ status: "success", data: { pending_claim_amount: 0 } });
    });

    const overallRefusal = await protocol.callTool({ name: "land_stake_dec_overall", arguments: {} });
    const stakedRefusal = await protocol.callTool({ name: "land_stake_dec_staked", arguments: {} });
    const regionPlayerOnlyRefusal = await protocol.callTool({ name: "land_stake_dec_region", arguments: { player: "synthetic-player" } });
    const regionUidOnlyRefusal = await protocol.callTool({ name: "land_stake_dec_region", arguments: { region_uid: "region-0001" } });
    const evpRefusal = await protocol.callTool({ name: "land_stake_evp_pending_claim", arguments: {} });

    for (const result of [overallRefusal, stakedRefusal, regionPlayerOnlyRefusal, regionUidOnlyRefusal, evpRefusal]) {
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("This tool requires") }]);
    }
    expect(fetchCalls).toBe(0);

    const overall = await protocol.callTool({ name: "land_stake_dec_overall", arguments: { player: "synthetic-player" } });
    const staked = await protocol.callTool({ name: "land_stake_dec_staked", arguments: { player: "synthetic-player" } });
    const region = await protocol.callTool({ name: "land_stake_dec_region", arguments: { player: "synthetic-player", region_uid: "region-0001" } });
    const evp = await protocol.callTool({ name: "land_stake_evp_pending_claim", arguments: { player: "synthetic-player" } });

    expect(urls).toEqual([
      "https://vapi.splinterlands.com/land/stake/dec/overall?player=synthetic-player",
      "https://vapi.splinterlands.com/land/stake/decstaked?player=synthetic-player",
      "https://vapi.splinterlands.com/land/stake/dec/region?player=synthetic-player&region_uid=region-0001",
      "https://vapi.splinterlands.com/land/stake/evp/pending-claim?player=synthetic-player",
    ]);
    expect(overall.isError).not.toBe(true);
    expect((overall.structuredContent as { data: unknown }).data).toEqual(expect.any(Number));
    expect(staked.isError).not.toBe(true);
    expect((staked.structuredContent as { data: Array<{ amount: unknown }> }).data[0]?.amount).toEqual(expect.any(Number));
    expect(region.isError).not.toBe(true);
    expect(region.structuredContent).toMatchObject({ data: { dec_stake_needed: expect.any(Number), dec_staked: expect.any(Number), dec_stake_in_use: expect.any(Number) } });
    expect(evp.isError).not.toBe(true);
    expect((evp.structuredContent as { data: { pending_claim_amount: unknown } }).data.pending_claim_amount).toEqual(expect.any(Number));
    expect(overall._meta).toMatchObject({ provenance: { endpoint: "/land/stake/dec/overall", requestScope: { player: { supplied: true } } } });
    expect(region._meta).toMatchObject({ provenance: { endpoint: "/land/stake/dec/region", requestScope: { player: { supplied: true }, region_uid: "region-0001" } } });
  });

  it("does not promise fields absent from the owned-deeds result contract", async () => {
    const protocol = await connect(async () => jsonResponse({ status: "success", data: null }));
    const result = await protocol.listTools();
    const description = result.tools.find((tool) => tool.name === "land_deeds_owned")?.description ?? "";
    const contract = getCatalogueEntry("vapi.land.deeds.owned").resultContract;

    expect(description).not.toMatch(/deed[_ ]uids?/i);
    expect(description).not.toMatch(/plot[_ ]ids?/i);
    expect(description).toContain("per-region plot counts");
    expect(description).toContain("data is an array of {count, uid} rows");
    expect(contract.fingerprint["data[].deed_uid"]).toBeUndefined();
    expect(contract.fingerprint["data[].plot_id"]).toBeUndefined();
  });

  it("uses the history-specific limitation and truncation wording", async () => {
    const baseRow = (historyRowsFixture.data as Array<Record<string, unknown>>).find((row) => Array.isArray(row.segments) && row.segments.length === 0);
    if (baseRow === undefined) throw new Error("history fixture has no empty-segment row");
    const rows = Array.from({ length: 101 }, () => baseRow);
    const protocol = await connect(async input => String(input).includes("/land/deeds/details/") ? jsonResponse(resolvedDeedBody("deed/uid")) : jsonResponse({ status: "success", data: rows }));
    const result = await protocol.callTool({ name: "land_projects_history", arguments: { deed_uid: "deed/uid" } });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
    const listed = await protocol.listTools();
    const description = listed.tools.find((tool) => tool.name === "land_projects_history")?.description ?? "";

    expect(text).toContain("This result was truncated to 100 rows by this server's result limit; the upstream response contained more records. In the recorded probes, offset=1 and limit=2&offset=2 returned the same leading rows as their requests without an advancing offset; no later rows were reached by those values.");
    expect(text).not.toContain("narrow the request");
    expect(description).toContain("The recorded history probes were a bare request, offset=1, limit=2, and limit=2&offset=2");
    const historyAnchor = "The recorded history probes were";
    expect(description.indexOf(historyAnchor)).toBeGreaterThanOrEqual(0);
    expect(text).toContain(description.slice(description.indexOf(historyAnchor)).split(" Supply exactly one plot_id")[0]!);
  });

  it("resolves each project reference then binds its target once and preserves successful empty bodies", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/land/deeds/details/")) return jsonResponse(resolvedDeedBody(decodeURIComponent(new URL(url).pathname.split("/").at(-1)!)));
      if (url.endsWith("/active")) return jsonResponse({ status: "success", data: null });
      if (url.endsWith("/list")) return jsonResponse({ status: "success", data: [] });
      if (url.endsWith("/list/count")) return jsonResponse({ status: "success", data: { count: 0 } });
      return jsonResponse({ status: "success", data: null });
    });

    const active = await protocol.callTool({ name: "land_projects_active", arguments: { deed_uid: "deed/uid" } });
    const history = await protocol.callTool({ name: "land_projects_history", arguments: { deed_uid: "deed/uid" } });
    const count = await protocol.callTool({ name: "land_projects_count", arguments: { deed_uid: "deed/uid" } });
    const requirements = await protocol.callTool({ name: "land_projects_requirements", arguments: { deed_uid: "deed/uid" } });

    expect(urls).toEqual([
      "https://vapi.splinterlands.com/land/deeds/details/deed%2Fuid",
      "https://vapi.splinterlands.com/land/projects/deed/deed%2Fuid/active",
      "https://vapi.splinterlands.com/land/deeds/details/deed%2Fuid",
      "https://vapi.splinterlands.com/land/projects/deed/deed%2Fuid/list",
      "https://vapi.splinterlands.com/land/deeds/details/deed%2Fuid",
      "https://vapi.splinterlands.com/land/projects/deed/deed%2Fuid/list/count",
      "https://vapi.splinterlands.com/land/deeds/details/deed%2Fuid",
      "https://vapi.splinterlands.com/land/projects/deed/deed%2Fuid/requirements",
    ]);
    expect(active.isError).not.toBe(true);
    expect(active.structuredContent).toMatchObject({ status: "success", data: null });
    expect((active.content as Array<{ text?: string }>)[0]?.text).toContain("no active land project");
    expect(history.isError).not.toBe(true);
    expect(history.structuredContent).toMatchObject({ status: "success", data: [] });
    expect((history.content as Array<{ text?: string }>)[0]?.text).toContain("no land project records");
    expect(count.isError).not.toBe(true);
    expect(count.structuredContent).toMatchObject({ status: "success", data: { count: 0 } });
    expect(requirements.isError).not.toBe(true);
    expect(requirements.structuredContent).toMatchObject({ status: "success", data: null });
    expect((requirements.content as Array<{ text?: string }>)[0]?.text).toContain("no work requirement rows");
    for (const result of [active, history, count, requirements]) {
      expect(result._meta).toMatchObject({ provenance: { endpoint: expect.stringContaining("/land/projects/deed/{deed_uid}") } });
    }
  });

  it("keeps search account and place scopes honest", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse(searchLimitedBody());
    });

    const account = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, player: "__synthetic_player__" } });
    const tractOnly = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, tract_id: 1 } });
    const regionOnly = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, region_number: 1 } });

    expect(account._meta).toMatchObject({ provenance: { endpoint: "/land/deeds", requestScope: { scope: "explicit-account", player: { supplied: true } } } });
    expect(tractOnly._meta).toMatchObject({ provenance: { endpoint: "/land/deeds", requestScope: { scope: "explicit-geography", tract_id: 1 } } });
    expect(regionOnly._meta).toMatchObject({ provenance: { endpoint: "/land/deeds", requestScope: { scope: "explicit-geography", region_number: 1 } } });
    expect((tractOnly._meta as { provenance?: { requestScope?: Record<string, unknown> } }).provenance?.requestScope).not.toHaveProperty("player");
    expect((regionOnly._meta as { provenance?: { requestScope?: Record<string, unknown> } }).provenance?.requestScope).not.toHaveProperty("player");
    expect(JSON.stringify(account._meta)).not.toContain("__synthetic_player__");
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("player=__synthetic_player__");
    expect(urls[1]).toContain("tract_id=1");
    expect(urls[1]).not.toContain("region_number");
    expect(urls[2]).toContain("region_number=1");
    expect(urls[2]).not.toContain("tract_id");
  });

  it("uses the ordered validator when orderBy is supplied and never fetches a continuation", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse({ status: "success", data: [] });
    });

    const result = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, tract_id: 1, orderBy: "desc" } });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toStrictEqual({ status: "success", data: [] });
    expect((result.content as Array<{ text?: string }>)[0]?.text).toContain("The observed ordered probe with orderBy=desc returned an empty array (measured 2026-09-06), and this server's contract currently accepts that response");
    expect((result.content as Array<{ text?: string }>)[0]?.text).not.toContain("The limited form of this search has object-shaped data");
    expect(result._meta).toMatchObject({ provenance: { requestScope: { scope: "explicit-geography", tract_id: 1 } } });
    expect(urls).toEqual(["https://vapi.splinterlands.com/land/deeds?tract_id=1&limit=1&orderBy=desc"]);
  });

  it("rejects a bare search before transport with the scope policy message", async () => {
    let fetchCalls = 0;
    const protocol = await connect(async () => {
      fetchCalls += 1;
      return jsonResponse(searchLimitedBody());
    });

    const result = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1 } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe("Search requires a scope; none was supplied. Provide player or a place (tract_id or region_number).");
    expect(result._meta).toBeUndefined();
    expect(fetchCalls).toBe(0);
  });

  it("carries the result-bound limitation on a full-looking search result", async () => {
    const protocol = await connect(async () => jsonResponse(searchLimitedBody()));

    const result = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, region_number: 1 } });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";

    expect(result.isError).not.toBe(true);
    expect(text).toContain("The limited form of this search has object-shaped data rather than an array, so this server's 100-row bound does not apply to that response.");
    expect(text).toContain("The only server result bound that applies to that response is the 256 KB serialized-result limit, and that limit is all-or-nothing.");
    expect(text).toContain("Request a smaller limit; retrying the same call will not return partial data.");
    expect(text).toContain("Paging probes recorded for this route were offset=0, offset=5, limit=10000, three calls omitting all parameters, and orderBy=desc: offset=0 returned zero rows; offset=5 returned the first four rows of the omitted-offset response; limit=10000 returned 10000 rows; the three omitted-parameter calls returned zero bytes; and orderBy=desc returned an empty data array. No total or has-more field was observed. No offset value tried reached later rows than the omitted-offset response; narrow the player, tract_id or region_number request instead.");
    expect(text).not.toContain("of 3");
  });

  it("rejects non-empty ordered search and reports the empty ordered limitation", async () => {
    let callCount = 0;
    const protocol = await connect(async () => {
      callCount += 1;
      return callCount === 1
        ? jsonResponse({ status: "success", data: [{ deed_uid: "deed-0" }] })
        : jsonResponse({ status: "success", data: [] });
    });

    const malformed = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 101, region_number: 1, orderBy: "desc" } });
    const empty = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 101, region_number: 1, orderBy: "desc" } });
    const text = (empty.content as Array<{ text?: string }>)[0]?.text ?? "";

    expect(malformed.isError).toBe(true);
    expect(malformed.structuredContent).toMatchObject({ kind: "upstream_malformed" });
    expect(empty.isError).not.toBe(true);
    expect(empty.structuredContent).toStrictEqual({ status: "success", data: [] });
    expect(text).toContain("The observed ordered probe with orderBy=desc returned an empty array");
    expect(text).toContain("no row bound or truncation is described for that form");
    expect(text).not.toContain("The limited form of this search has object-shaped data");
  });

  it("describes an oversized search object as all-or-nothing", async () => {
    const body = structuredClone(searchLimitedBody()) as { status: string; data: { deeds: Array<Record<string, unknown>> } };
    body.data.deeds[0]!.deed_uid = "x".repeat(MAX_RESULT_BYTES);
    const protocol = await connect(async () => jsonResponse(body));

    const result = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 100, region_number: 1 } });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toStrictEqual({ status: "success" });
    expect(text).toContain("This single record is too large to return within the 256 KB result limit.");
    expect(text).toContain("Request a smaller limit; retrying the same call will not return partial data.");
    expect(text).not.toContain("This result was truncated to");
  });

  it("carries only the paging limitation on a search error", async () => {
    const protocol = await connect(async () => jsonResponse({ error: "unavailable" }, 404));

    const result = await protocol.callTool({ name: "land_deeds_search", arguments: { limit: 1, region_number: 1 } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe("/land/deeds returned an unexpected HTTP status (404). Paging probes recorded for this route were offset=0, offset=5, limit=10000, three calls omitting all parameters, and orderBy=desc: offset=0 returned zero rows; offset=5 returned the first four rows of the omitted-offset response; limit=10000 returned 10000 rows; the three omitted-parameter calls returned zero bytes; and orderBy=desc returned an empty data array. No total or has-more field was observed. No offset value tried reached later rows than the omitted-offset response; narrow the player, tract_id or region_number request instead.");
    expect((result.content as Array<{ text?: string }>)[0]?.text).not.toContain("100-row bound");
    expect(result._meta).toMatchObject({ provenance: { requestScope: { scope: "explicit-geography", region_number: 1 } } });
  });

  it("F2 control passes before and after the nullable fix", async () => {
    const protocol = await connect(async () => jsonResponse(deedBody()));

    expect(matchesResultContract(deedBody(), getCatalogueEntry("vapi.land.deeds.by-plot").resultContract)).toBe(true);
    const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });

    expect(result.structuredContent).toMatchObject({ status: "success", data: { plot_id: 13339, future_field: "tolerated" } });
    expect(result._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/{plot_id}",
        requestScope: { plot_id: 13339 },
        freshness: { retrievedAt: expect.any(String) },
        traceId: expect.any(String),
      },
    });
    expect(result.structuredContent).not.toHaveProperty("provenance");
    expect(JSON.stringify(result)).not.toContain("__synthetic_player__");
  });

  it("F1 fails before Phase B and passes after the nullable fix", async () => {
    const listedBody = { status: listedFixture.status, data: listedFixture.data };
    expect(matchesResultContract(listedBody, getCatalogueEntry("vapi.land.deeds.by-plot").resultContract)).toBe(true);
    const protocol = await connect(async () => jsonResponse(listedBody));

    const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 1 } });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: "success", data: { plot_id: 1, resource_id: null, resource_symbol: null } });
  });

  it("F3 fails before Phase C and passes after the plot-id domain fix", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      const body = deedBody(); body.data.plot_id = 1;
      return jsonResponse(body);
    });

    const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 1 } });
    const listed = await protocol.listTools();
    const landDeed = listed.tools.find((tool) => tool.name === "land_deed_by_plot");

    expect(result.isError).not.toBe(true);
    expect(urls).toEqual(["https://vapi.splinterlands.com/land/deeds/1"]);
    expect(landDeed?.inputSchema.properties?.plot_id).toMatchObject({ anyOf: expect.arrayContaining([expect.objectContaining({ type: "integer", minimum: 1 })]) });
    expect(landDeed?.inputSchema.properties?.plot_id).not.toHaveProperty("maximum");
  });

  it("rejects invalid or missing input before the injected fetch", async () => {
    let fetchCalls = 0;
    const protocol = await connect(async () => {
      fetchCalls += 1;
      return jsonResponse(deedBody());
    });

    const invalidArguments: Array<Record<string, unknown>> = [
      { plot_id: "not-an-integer" },
      {},
      { plot_id: -5 },
      { plot_id: 0 },
      { plot_id: 1.5 },
      { plot_id: "3" },
    ];
    for (const arguments_ of invalidArguments) {
      const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: arguments_ });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content.some((item) => item.type === "text" && item.text?.includes("plot_id") === true)).toBe(true);
    }
    expect(fetchCalls).toBe(0);
  });

  it("uses the catalogue URL without a query", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse(deedBody());
    });

    await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });

    expect(urls).toEqual(["https://vapi.splinterlands.com/land/deeds/13339"]);
  });

  it("binds the explicit plot and uid branches to their own routes and contracts", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      const url = String(input);
      urls.push(url);
      return url.includes("/details/") ? jsonResponse(byUidFixture) : jsonResponse(deedBody());
    });

    const uidResult = await protocol.callTool({ name: "land_deed_by_uid", arguments: { deed_uid: "I-296-d14043817866fa" } });
    const plotResult = await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });

    expect(uidResult.isError).not.toBe(true);
    expect(uidResult.structuredContent).toMatchObject({ status: "success", data: { market_id: 285587, listing_price: 100000, tax_rate: 0.1 } });
    expect(uidResult.structuredContent).not.toHaveProperty("data.worksite_type");
    expect(uidResult._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/details/{deed_uid}", requestScope: { deed_uid: "I-296-d14043817866fa" } } });
    expect(plotResult.isError).not.toBe(true);
    expect(plotResult._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/{plot_id}", requestScope: { plot_id: 13339 } } });
    expect(urls).toEqual([
      "https://vapi.splinterlands.com/land/deeds/details/I-296-d14043817866fa",
      "https://vapi.splinterlands.com/land/deeds/13339",
    ]);
  });

  it("rejects invalid or missing plot and uid input before the injected fetch", async () => {
    let fetchCalls = 0;
    const protocol = await connect(async () => {
      fetchCalls += 1;
      return jsonResponse(byUidFixture);
    });

    const invalidPlotArguments: Array<Record<string, unknown>> = [
      {},
      { deed_uid: "I-296-d14043817866fa", plot_id: 1 },
      { plot_id: "not-an-integer" },
      { plot_id: -5 },
    ];
    const invalidUidArguments: Array<Record<string, unknown>> = [
      {},
      { plot_id: 1, deed_uid: "ambiguous" },
      { deed_uid: " " },
      { deed_uid: 1 },
    ];
    for (const arguments_ of invalidPlotArguments) {
      const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: arguments_ });
      expect(result.isError).toBe(true);
    }
    for (const arguments_ of invalidUidArguments) {
      const result = await protocol.callTool({ name: "land_deed_by_uid", arguments: arguments_ });
      expect(result.isError).toBe(true);
    }
    expect(fetchCalls).toBe(0);
  });

  it("passes an absent uid result through unchanged and states the absence", async () => {
    const body = { status: "success", data: null };
    const protocol = await connect(async () => jsonResponse(body));

    const result = await protocol.callTool({ name: "land_deed_by_uid", arguments: { deed_uid: "ZZ-not-a-real-deed-uid-000000" } });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toStrictEqual(body);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toContain("ZZ-not-a-real-deed-uid-000000");
    expect((result.content as Array<{ text?: string }>)[0]?.text).toContain("no land deed");
    expect(result._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/details/{deed_uid}", requestScope: { deed_uid: "ZZ-not-a-real-deed-uid-000000" } } });
  });

  it("keeps genuine empty, unavailable, and auth-gated outcomes distinct", async () => {
    const empty = await connect(async () => jsonResponse({ status: "success", data: [] }));
    const emptyResult = await empty.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });
    await client?.close();
    await server?.close();

    const unavailable = await connect(async () => jsonResponse({ error: "unavailable" }, 500));
    const unavailableResult = await unavailable.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });
    await client?.close();
    await server?.close();

    const gated = await connect(async () => jsonResponse({}, 401));
    const toolsBeforeAuthFailure = (await gated.listTools()).tools.map(tool => tool.name);
    const gatedResult = await gated.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });
    expect((await gated.listTools()).tools.map(tool => tool.name)).toEqual(toolsBeforeAuthFailure);
    expect((await gated.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } })))
      .toMatchObject({ isError: true, structuredContent: { kind: "endpoint_requires_auth" } });

    expect(emptyResult).toMatchObject({ structuredContent: { status: "success", data: [] } });
    expect(emptyResult.isError).not.toBe(true);
    expect(emptyResult._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/{plot_id}",
        requestScope: { plot_id: 13339 },
        freshness: { retrievedAt: expect.any(String) },
      },
    });
    expect(unavailableResult).toMatchObject({ isError: true, structuredContent: { kind: "upstream_unavailable" } });
    expect(unavailableResult._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/{plot_id}",
        requestScope: { plot_id: 13339 },
      },
    });
    expect(gatedResult).toMatchObject({ isError: true, structuredContent: { kind: "endpoint_requires_auth" } });
    expect(gatedResult._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/{plot_id}",
        requestScope: { plot_id: 13339 },
      },
    });
  });

  it("answers for a plot that does not exist instead of calling it malformed", async () => {
    // Semantic: the two shapes this repository observed for a non-existent plot are successful
    // empty answers, not failures. Mutation: narrow the shared empty definition back to an empty
    // data array. Input: an envelope with no data key (observed 2026-09-05) and one whose data is
    // null (observed 2026-09-04) must both validate and reach the caller as a successful answer.
    const contract = getCatalogueEntry("vapi.land.deeds.by-plot").resultContract;
    const absent = { status: "success" };
    const nulled = { status: "success", data: null };
    expect(matchesResultContract(absent, contract)).toBe(true);
    expect(matchesResultContract(nulled, contract)).toBe(true);

    const missing = await connect(async () => jsonResponse(absent));
    const missingResult = await missing.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 75000 } });
    await client?.close();
    await server?.close();

    const nullData = await connect(async () => jsonResponse(nulled));
    const nullDataResult = await nullData.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 120000 } });

    for (const result of [missingResult, nullDataResult]) {
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: "success" });
      expect(result._meta).toMatchObject({
        provenance: {
          requestScope: { plot_id: expect.any(Number) },
          freshness: { retrievedAt: expect.any(String) },
        },
      });
    }
    const missingText = (missingResult.content as Array<{ text?: string }>)[0]?.text ?? "";
    expect(missingText).toContain("75000");
    expect(missingText).toContain("no land deed");
    expect((nullDataResult.content as Array<{ text?: string }>)[0]?.text).toContain("120000");
  });

  it("keeps an empty ownership result tied to the requested account", async () => {
    // Semantic: an empty owned-deeds list is an answer, not an error and not a bare envelope.
    // Mutation: drop the empty branch from the owned-deeds tool. Input: an empty data array must
    // still reach the caller as a successful result whose text states the absence.
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse({ status: "success", data: [] });
    });

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    expect(result._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/owned/{player}",
        requestScope: { player: { supplied: true } },
        freshness: { retrievedAt: expect.any(String) },
      },
    });
    expect((result._meta as { provenance?: { requestScope?: unknown } } | undefined)?.provenance?.requestScope).toEqual({
      player: { supplied: true },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: "success", data: [] });
    expect((result.content as Array<{ text?: string }>)[0]?.text).toContain("cannot distinguish an unrecognized account from an account with no land");
    expect(JSON.stringify(result)).not.toContain("__synthetic_player__");
    expect(urls).toEqual(["https://vapi.splinterlands.com/land/deeds/owned/__synthetic_player__"]);
  });

  it("returns the owned-deeds structured result from the injected response", async () => {
    const protocol = await connect(async () => jsonResponse(ownedDeedsBody()));

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });

    expect(result.structuredContent).toStrictEqual(ownedDeedsBody());
    expect(result._meta).toMatchObject({
      provenance: {
        endpoint: "/land/deeds/owned/{player}",
        requestScope: { player: { supplied: true } },
      },
    });
    expect(JSON.stringify(result)).not.toContain("__synthetic_player__");
  });

  it("does not truncate exactly 100 rows", async () => {
    const body = ownedRowsBody(100);
    const protocol = await connect(async () => jsonResponse(body));

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });

    expect(result.structuredContent).toStrictEqual(body);
    expect((result.structuredContent as { data?: unknown[] }).data).toHaveLength(100);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe(JSON.stringify(body));
  });

  it("bounds rows without making a continuation request", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse(ownedRowsBody(150));
    });

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    const data = (result.structuredContent as { data?: unknown[] }).data;

    expect(data).toHaveLength(100);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe("This result was truncated to 100 rows; more may exist upstream. The parameters tried for this route are not recorded in this message; this server made one request and did not fetch another response. Narrow the request to retrieve other results.");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://vapi.splinterlands.com/land/deeds/owned/__synthetic_player__");
  });

  it("applies the byte bound before the row bound", async () => {
    const protocol = await connect(async () => jsonResponse(ownedRowsBody(10, 40_000)));

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    const data = (result.structuredContent as { data?: unknown[] }).data ?? [];

    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThan(10);
    expect(new TextEncoder().encode(JSON.stringify(result.structuredContent)).byteLength).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toContain(`This result was truncated to ${data.length} rows;`);
  });

  it("truncates a payload that is exactly one byte over the byte bound", async () => {
    const body = ownedRowsBodyAtBytes(MAX_RESULT_BYTES + 1);
    const protocol = await connect(async () => jsonResponse(body));
    const inputBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;

    const result = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    const data = (result.structuredContent as { data?: unknown[] }).data ?? [];

    expect(inputBytes - MAX_RESULT_BYTES).toBe(1);
    expect(data).toHaveLength(1);
    expect(result.structuredContent).toStrictEqual({ status: "success", data: [body.data[0]] });
    expect(new TextEncoder().encode(JSON.stringify(result.structuredContent)).byteLength).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe("This result was truncated to 1 rows; more may exist upstream. The parameters tried for this route are not recorded in this message; this server made one request and did not fetch another response. Narrow the request to retrieve other results.");
  });

  it("explains when a single plot record exceeds the result bound", async () => {
    const body = deedBody();
    body.data.future_field = "x".repeat(MAX_RESULT_BYTES);
    const protocol = await connect(async () => jsonResponse(body));

    const result = await protocol.callTool({ name: "land_deed_by_plot", arguments: { plot_id: 13339 } });
    const text = (result.content as Array<{ text?: string }>)[0]?.text;

    expect(result.structuredContent).toStrictEqual({ status: "success" });
    expect(text).toBe(`This single record is too large to return within the ${MAX_RESULT_BYTES / 1024} KB result limit.`);
    expect(text).not.toContain("rows");
    expect(text).not.toContain("narrow");
  });

  it("rejects invalid or missing owned-deeds input before the injected fetch", async () => {
    let fetchCalls = 0;
    const protocol = await connect(async () => {
      fetchCalls += 1;
      return jsonResponse(ownedDeedsBody());
    });

    const invalid = await protocol.callTool({ name: "land_deeds_owned", arguments: { player: 1 } });
    const missing = await protocol.callTool({ name: "land_deeds_owned", arguments: {} });

    for (const result of [invalid, missing]) {
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content.some((item) => item.type === "text" && item.text?.includes("player") === true)).toBe(true);
    }
    expect(fetchCalls).toBe(0);
  });

  it("uses the owned-deeds catalogue URL without a query", async () => {
    const urls: string[] = [];
    const protocol = await connect(async (input) => {
      urls.push(String(input));
      return jsonResponse(ownedDeedsBody());
    });

    await protocol.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });

    expect(urls).toEqual(["https://vapi.splinterlands.com/land/deeds/owned/__synthetic_player__"]);
  });

  it("keeps owned-deeds empty, unavailable, and auth-gated outcomes distinct", async () => {
    const empty = await connect(async () => jsonResponse({ status: "success", data: [] }));
    const emptyResult = await empty.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    await client?.close();
    await server?.close();

    const unavailable = await connect(async () => jsonResponse({ error: "unavailable" }, 500));
    const unavailableResult = await unavailable.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    await client?.close();
    await server?.close();

    const gated = await connect(async () => jsonResponse({}, 401));
    const gatedResult = await gated.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    await client?.close();
    await server?.close();

    const malformed = await connect(async () => jsonResponse({ error: "malformed" }));
    const malformedResult = await malformed.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    await client?.close();
    await server?.close();

    const oversized = await connect(async () => new Response("x".repeat(2 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }));
    const oversizedResult = await oversized.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });
    await client?.close();
    await server?.close();

    const blocked = await connect(async () => jsonResponse({ error: "forbidden" }, 403));
    const blockedResult = await blocked.callTool({ name: "land_deeds_owned", arguments: { player: "__synthetic_player__" } });

    expect(emptyResult).toMatchObject({ structuredContent: { status: "success", data: [] } });
    expect(emptyResult.isError).not.toBe(true);
    expect(emptyResult._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/owned/{player}", requestScope: { player: { supplied: true } } } });
    expect(JSON.stringify(emptyResult)).not.toContain("__synthetic_player__");
    expect(unavailableResult).toMatchObject({ isError: true, structuredContent: { kind: "upstream_unavailable" } });
    expect(unavailableResult._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/owned/{player}", requestScope: { player: { supplied: true } } } });
    expect(JSON.stringify(unavailableResult)).not.toContain("__synthetic_player__");
    expect(gatedResult).toMatchObject({ isError: true, structuredContent: { kind: "endpoint_requires_auth" } });
    expect(gatedResult._meta).toMatchObject({ provenance: { endpoint: "/land/deeds/owned/{player}", requestScope: { player: { supplied: true } } } });
    expect(JSON.stringify(gatedResult)).not.toContain("__synthetic_player__");
    expect(malformedResult).toMatchObject({ isError: true, structuredContent: { kind: "upstream_malformed" } });
    expect(JSON.stringify(malformedResult)).not.toContain("__synthetic_player__");
    expect(oversizedResult).toMatchObject({ isError: true, structuredContent: { kind: "response_too_large" } });
    expect(JSON.stringify(oversizedResult)).not.toContain("__synthetic_player__");
    expect(blockedResult).toMatchObject({ isError: true, structuredContent: { kind: "upstream_blocked" } });
    expect(JSON.stringify(blockedResult)).not.toContain("__synthetic_player__");
  });
});
