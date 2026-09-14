import { describe, expect, it } from "vitest";
import byPlotHit from "./fixtures/land-deed-by-plot-hit.fixture.json" with { type: "json" };
import byPlotMiss from "./fixtures/land-deed-by-plot-miss.fixture.json" with { type: "json" };
import byUidHit from "./fixtures/land-deed-by-uid-hit.fixture.json" with { type: "json" };
import searchLimited from "./fixtures/land-deeds-search-limited.fixture.json" with { type: "json" };
import searchOrdered from "./fixtures/land-deeds-search-ordered-empty.fixture.json" with { type: "json" };
import activeHit from "./fixtures/land-projects-active-hit.fixture.json" with { type: "json" };
import activeNone from "./fixtures/land-projects-active-none.fixture.json" with { type: "json" };
import historyRows from "./fixtures/land-projects-history-rows.fixture.json" with { type: "json" };
import historyLimited from "./fixtures/land-projects-history-limited.fixture.json" with { type: "json" };
import historyEmpty from "./fixtures/land-projects-history-empty.fixture.json" with { type: "json" };
import countZero from "./fixtures/land-projects-count-zero.fixture.json" with { type: "json" };
import requirementsSentinel from "./fixtures/land-projects-requirements-sentinel.fixture.json" with { type: "json" };
import requirementsReal from "./fixtures/land-projects-requirements-real.fixture.json" with { type: "json" };
import requirementsNone from "./fixtures/land-projects-requirements-none.fixture.json" with { type: "json" };
import volume from "./fixtures/land-volume.fixture.json" with { type: "json" };
import regionsEmpty from "./fixtures/land-regions-counts-empty.fixture.json" with { type: "json" };
import regionsRows from "./fixtures/land-regions-counts-rows.fixture.json" with { type: "json" };
import tractsEmpty from "./fixtures/land-tracts-counts-empty.fixture.json" with { type: "json" };
import tractsRows from "./fixtures/land-tracts-counts-rows.fixture.json" with { type: "json" };
import ownedHit from "./fixtures/land-deeds-owned-hit.fixture.json" with { type: "json" };
import ownedNone from "./fixtures/land-deeds-owned-none.fixture.json" with { type: "json" };
import stakeAssetsEmpty from "./fixtures/land-stake-assets-empty.fixture.json" with { type: "json" };
import stakeAssetsRows from "./fixtures/land-stake-assets-rows.fixture.json" with { type: "json" };
import stakeDetailsZeroed from "./fixtures/land-stake-deed-details-zeroed.fixture.json" with { type: "json" };
import stakeDetailsActive from "./fixtures/land-stake-deed-details-active.fixture.json" with { type: "json" };
import decOverall from "./fixtures/land-stake-dec-overall.fixture.json" with { type: "json" };
import decRegion from "./fixtures/land-stake-dec-region-resolved.fixture.json" with { type: "json" };
import decStakedNone from "./fixtures/land-stake-decstaked-none.fixture.json" with { type: "json" };
import decStakedRows from "./fixtures/land-stake-decstaked-rows.fixture.json" with { type: "json" };
import evpPendingClaim from "./fixtures/land-stake-evp-pending-claim.fixture.json" with { type: "json" };
import resourcesOwnedEmpty from "./fixtures/land-resources-owned-empty.fixture.json" with { type: "json" };
import resourcesRichlist from "./fixtures/land-resources-richlist.fixture.json" with { type: "json" };
import resourcesLeaderboards from "./fixtures/land-resources-leaderboards.fixture.json" with { type: "json" };
import resourcesTaxesReal from "./fixtures/land-resources-taxes-real.fixture.json" with { type: "json" };
import resourcesTaxesUnknown from "./fixtures/land-resources-taxes-unknown.fixture.json" with { type: "json" };
import resourcesHarvestableEmpty from "./fixtures/land-resources-production-region-harvestable-empty.fixture.json" with { type: "json" };
import balancesHistory from "./fixtures/land-resources-balances-history.fixture.json" with { type: "json" };
import balancesHistoryEmpty from "./fixtures/land-resources-balances-history-empty.fixture.json" with { type: "json" };
import balancesHistoryCount from "./fixtures/land-resources-balances-history-count.fixture.json" with { type: "json" };
import balancesHistoryCountEmpty from "./fixtures/land-resources-balances-history-count-empty.fixture.json" with { type: "json" };
import titles from "./fixtures/land-resources-titles.fixture.json" with { type: "json" };
import titlesEmpty from "./fixtures/land-resources-titles-empty.fixture.json" with { type: "json" };
import titlesAssigned from "./fixtures/land-resources-titles-assigned.fixture.json" with { type: "json" };
import rewardactions from "./fixtures/land-resources-rewardactions.fixture.json" with { type: "json" };
import rewardactionsEmpty from "./fixtures/land-resources-rewardactions-empty.fixture.json" with { type: "json" };
import rewardactionsCount from "./fixtures/land-resources-rewardactions-count.fixture.json" with { type: "json" };
import resourcesHistory from "./fixtures/land-resources-history.fixture.json" with { type: "json" };
import resourcesHistoryEmpty from "./fixtures/land-resources-history-empty.fixture.json" with { type: "json" };
import fragmentHistory from "./fixtures/land-resources-fragment-history.fixture.json" with { type: "json" };
import fragmentHistoryEmpty from "./fixtures/land-resources-fragment-history-empty.fixture.json" with { type: "json" };
import liquidityPools from "./fixtures/land-liquidity-pools.fixture.json" with { type: "json" };
import liquidityPoolById from "./fixtures/land-liquidity-pool-by-id.fixture.json" with { type: "json" };
import liquidityPoolByIdMiss from "./fixtures/land-liquidity-pool-by-id-miss.fixture.json" with { type: "json" };
import liquidityPoolBySymbol from "./fixtures/land-liquidity-pool-by-symbol.fixture.json" with { type: "json" };
import liquidityPoolBySymbolMiss from "./fixtures/land-liquidity-pool-by-symbol-miss.fixture.json" with { type: "json" };
import liquiditySwaps from "./fixtures/land-resources-liquidity-swaps.fixture.json" with { type: "json" };
import liquiditySwapsEmpty from "./fixtures/land-resources-liquidity-swaps-empty.fixture.json" with { type: "json" };
import liquidityAllrewards from "./fixtures/land-liquidity-allrewards.fixture.json" with { type: "json" };
import liquidityQuote from "./fixtures/land-liquidity-quote.fixture.json" with { type: "json" };
import liquidityResources from "./fixtures/land-liquidity-resources.fixture.json" with { type: "json" };
import liquidityResourcesEmpty from "./fixtures/land-liquidity-resources-empty.fixture.json" with { type: "json" };
import liquidityRegion from "./fixtures/land-liquidity-region.fixture.json" with { type: "json" };
import liquidityRegionEmpty from "./fixtures/land-liquidity-region-empty.fixture.json" with { type: "json" };
import { getCatalogueEntry } from "../src/catalogue/index.js";
import { predicateFor } from "../src/catalogue/predicates.js";

describe("captured land result contracts", () => {
  it("accepts the direct deed hit and the explicit null empty result", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.by-plot").resultContract);
    expect(predicate(byPlotHit)).toBe(true);
    expect(predicate(byPlotMiss)).toBe(true);
  });

  it("rejects a by-plot deed with a missing field or a wrapper", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.by-plot").resultContract);
    const missing = structuredClone(byPlotHit) as { data: Record<string, unknown> };
    delete missing.data.worksite_type;
    const wrapped = structuredClone(byPlotHit) as { data: Record<string, unknown> };
    wrapped.data = { deeds: [wrapped.data] };
    expect(predicate(missing)).toBe(false);
    expect(predicate(wrapped)).toBe(false);
  });

  it("accepts the captured by-uid shape but not the by-plot contract", () => {
    const uidContract = getCatalogueEntry("vapi.land.deeds.details-by-uid").resultContract;
    expect(predicateFor(uidContract)(byUidHit)).toBe(true);
    expect(predicateFor(getCatalogueEntry("vapi.land.deeds.by-plot").resultContract)(byUidHit)).toBe(false);
  });

  it("keeps by-uid omissions and wire types distinct", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.details-by-uid").resultContract);
    const missing = structuredClone(byUidHit) as { data: Record<string, unknown> };
    delete missing.data.market_id;
    const wrongType = structuredClone(byUidHit) as { data: Record<string, unknown> };
    wrongType.data.tax_rate = "0.10";
    const absentByPlotFields = structuredClone(byUidHit) as { data: Record<string, unknown> };
    absentByPlotFields.data.worksite_type = "none";
    absentByPlotFields.data.rarity_sort_value = 1;
    expect(predicate(missing)).toBe(false);
    expect(predicate(wrongType)).toBe(false);
    expect(predicate(absentByPlotFields)).toBe(true);
  });

  it("passes the shared empty deed envelope through the by-uid contract", () => {
    const contract = getCatalogueEntry("vapi.land.deeds.details-by-uid").resultContract;
    expect(predicateFor(contract)(byPlotMiss)).toBe(true);
    expect(contract.fingerprint["data.worksite_type"]).toBeUndefined();
    expect(contract.fingerprint["data.rarity_sort_value"]).toBeUndefined();
    expect(contract.fingerprint["data.resource_id"]).toBeUndefined();
    expect(contract.requiredKeyPaths).not.toContain("data.resource_id");
  });

  it("accepts the three-array limited search and preserves string traps", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.search").variants?.find((variant) => variant.variantKey === "limited")?.resultContract ?? (() => { throw new Error("limited contract missing"); })());
    expect(predicate(searchLimited)).toBe(true);
    const deed = (searchLimited.data as { deeds: Array<Record<string, unknown>> }).deeds[0];
    if (deed === undefined) throw new Error("limited search deed is missing");
    expect(typeof deed.tax_rate).toBe("string");
    expect(typeof deed.stats).toBe("string");
    expect(typeof deed.land_stats).toBe("string");
    expect(deed.worksite_type).toBe("");
  });

  it("keeps null-only fields observed but untyped", () => {
    const limited = getCatalogueEntry("vapi.land.deeds.search").variants?.find((variant) => variant.variantKey === "limited")?.resultContract;
    if (limited === undefined) throw new Error("limited contract missing");
    const unknown = [
      "data.deeds[].castle",
      "data.deeds[].keep",
      "data.worksite_details[].segments",
      "data.worksite_details[].completed_date",
      "data.worksite_details[].destroyed_date",
      "data.worksite_details[].hours_to_completion",
      "data.worksite_details[].projected_end",
    ];
    expect(unknown.every((path) => limited.observedKeyPaths?.includes(path) && !(path in limited.fingerprint))).toBe(true);
  });

  it("rejects row omissions and trap type changes in the limited search", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.search").variants?.find((variant) => variant.variantKey === "limited")?.resultContract ?? (() => { throw new Error("limited contract missing"); })());
    const missing = structuredClone(searchLimited) as { data: { deeds: Array<Record<string, unknown>> } };
    const missingDeed = missing.data.deeds[0];
    if (missingDeed === undefined) throw new Error("limited search deed is missing");
    delete missingDeed.plot_id;
    const parsedStats = structuredClone(searchLimited) as { data: { deeds: Array<Record<string, unknown>> } };
    const parsedStatsDeed = parsedStats.data.deeds[0];
    if (parsedStatsDeed === undefined) throw new Error("limited search deed is missing");
    parsedStatsDeed.stats = {};
    const nullWorksiteType = structuredClone(searchLimited) as { data: { deeds: Array<Record<string, unknown>> } };
    const nullWorksiteTypeDeed = nullWorksiteType.data.deeds[0];
    if (nullWorksiteTypeDeed === undefined) throw new Error("limited search deed is missing");
    nullWorksiteTypeDeed.worksite_type = null;
    const missingWorksite = structuredClone(searchLimited) as { data: { worksite_details: Array<Record<string, unknown>> } };
    const missingWorksiteRow = missingWorksite.data.worksite_details[0];
    if (missingWorksiteRow === undefined) throw new Error("limited search worksite is missing");
    delete missingWorksiteRow.block_num;
    const missingStaking = structuredClone(searchLimited) as { data: { staking_details: Array<Record<string, unknown>> } };
    const missingStakingRow = missingStaking.data.staking_details[0];
    if (missingStakingRow === undefined) throw new Error("limited search staking details are missing");
    delete missingStakingRow.manager;
    expect(predicate(missing)).toBe(false);
    expect(predicate(parsedStats)).toBe(false);
    expect(predicate(nullWorksiteType)).toBe(false);
    expect(predicate(missingWorksite)).toBe(false);
    expect(predicate(missingStaking)).toBe(false);
  });

  it("accepts only the observed empty ordered result", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.deeds.search").variants?.find((variant) => variant.variantKey === "ordered")?.resultContract ?? (() => { throw new Error("ordered contract missing"); })());
    expect(predicate(searchOrdered)).toBe(true);
    expect(predicate({ status: "success", data: [{ unexpected: true }] })).toBe(false);
  });

  it("accepts the observed owned-deeds rows and null result", () => {
    const contract = getCatalogueEntry("vapi.land.deeds.owned").resultContract;
    expect(predicateFor(contract)(ownedHit)).toBe(true);
    expect(predicateFor(contract)(ownedNone)).toBe(true);
    expect(contract.fingerprint["data[].count"]).toMatchObject({ type: "number", valueClass: "numeric" });
    expect(contract.fingerprint["data[].uid"]).toMatchObject({ type: "string", valueClass: "id" });
    expect(contract.predicateId).toBeUndefined();
  });

  it("validates the two staking contracts without reconciling their wire types", () => {
    const assetsEntry = getCatalogueEntry("vapi.land.stake.deeds-assets");
    const assetsPredicate = predicateFor(assetsEntry.resultContract);
    expect(assetsPredicate(stakeAssetsRows)).toBe(true);
    expect(assetsPredicate(stakeAssetsEmpty)).toBe(true);

    // The declarative fingerprint alone cannot express a collection that may be empty; this is why the entry registers a predicate, and if this assertion ever flips, the predicate can be removed.
    const declarativeAssets = predicateFor({ ...assetsEntry.resultContract, predicateId: undefined });
    expect(declarativeAssets(stakeAssetsRows)).toBe(true);
    expect(declarativeAssets(stakeAssetsEmpty)).toBe(false);

    const missingCardKey = structuredClone(stakeAssetsRows) as { data: { cards: Array<Record<string, unknown>> } };
    delete missingCardKey.data.cards[0]!.land_base_pp;
    const numericCardFigure = structuredClone(stakeAssetsRows) as { data: { cards: Array<Record<string, unknown>> } };
    numericCardFigure.data.cards[0]!.land_base_pp = 200;
    const itemsObject = structuredClone(stakeAssetsRows) as { data: Record<string, unknown> };
    itemsObject.data.items = {};
    const numericStatus = structuredClone(stakeAssetsRows) as { status: unknown };
    numericStatus.status = 1;
    expect(assetsPredicate(missingCardKey)).toBe(false);
    expect(assetsPredicate(numericCardFigure)).toBe(false);
    expect(assetsPredicate(itemsObject)).toBe(false);
    expect(assetsPredicate(numericStatus)).toBe(false);
    expect(assetsPredicate([])).toBe(false);

    // This mutation exercises tolerance, not a nullability claim.
    const nullableTolerance = structuredClone(stakeAssetsRows) as { data: { cards: Array<Record<string, unknown>> } };
    nullableTolerance.data.cards[0]!.boost = null;
    expect(assetsPredicate(nullableTolerance)).toBe(true);
    const extraKey = structuredClone(stakeAssetsRows) as { data: { cards: Array<Record<string, unknown>> } };
    extraKey.data.cards[0]!.future_field = "ignored";
    expect(assetsPredicate(extraKey)).toBe(true);

    const detailsContract = getCatalogueEntry("vapi.land.stake.deed-details").resultContract;
    const detailsPredicate = predicateFor(detailsContract);
    expect(detailsPredicate(stakeDetailsZeroed)).toBe(true);
    expect(detailsPredicate(stakeDetailsActive)).toBe(true);

    // This captured R8 response is data: null; the vapi empty-result short-circuit checks status before the 58-path fingerprint.
    expect(detailsPredicate({ status: "success", data: null })).toBe(true);

    const missingDetail = structuredClone(stakeDetailsActive) as { data: Record<string, unknown> };
    delete missingDetail.data.manager;
    const stringTotal = structuredClone(stakeDetailsActive) as { data: Record<string, unknown> };
    stringTotal.data.total_base_pp = "1100.000";
    const numericManager = structuredClone(stakeDetailsActive) as { data: Record<string, unknown> };
    numericManager.data.manager = 1;
    expect(detailsPredicate(missingDetail)).toBe(false);
    expect(detailsPredicate(stringTotal)).toBe(false);
    expect(detailsPredicate(numericManager)).toBe(false);
  });

  it("contracts the DEC staking routes without deriving one figure from another", () => {
    const overallContract = getCatalogueEntry("vapi.land.stake.dec-overall").resultContract;
    const overallPredicate = predicateFor(overallContract);
    expect(overallPredicate(decOverall)).toBe(true);
    expect(overallContract.fingerprint.data).toMatchObject({ type: "number", valueClass: "numeric" });
    expect(overallPredicate({ ...decOverall, data: String(decOverall.data) })).toBe(false);
    expect(overallPredicate({ ...decOverall, data: {} })).toBe(false);
    // `data: []` is ACCEPTED, and deliberately so: it takes the same VAPI empty-result
    // short-circuit as `data: null` two lines below, which fires before any type comparison
    // (src/catalogue/fingerprint.ts:108-115). So the numeric declaration on this route cannot
    // reject an empty array -- an empty result is a legitimate outcome for any VAPI route, and
    // the short-circuit is global rather than per-entry. Documented, not asserted away; the
    // meaningful rejections above (a string, an object) do still hold.
    expect(overallPredicate({ ...decOverall, data: [] })).toBe(true);
    // This synthetic body exercises the VAPI empty-result short-circuit; no observed overall capture had this shape.
    expect(overallPredicate({ status: "success", data: null })).toBe(true);

    const regionPredicate = predicateFor(getCatalogueEntry("vapi.land.stake.dec-region").resultContract);
    expect(regionPredicate(decRegion)).toBe(true);
    // The fully scoped no-stake request returned a zero-valued object, so this is the measured unscoped response used to pin the empty-array branch.
    expect(regionPredicate({ status: "success", data: [] })).toBe(true);
    const missingRegionField = structuredClone(decRegion) as { data: Record<string, unknown> };
    delete missingRegionField.data.dec_staked;
    const stringRegionFigure = structuredClone(decRegion) as { data: Record<string, unknown> };
    stringRegionFigure.data.dec_staked = "0";
    const regionRows = structuredClone(decRegion) as { data: unknown };
    regionRows.data = [{ uid: "region-0001" }];
    expect(regionPredicate(missingRegionField)).toBe(false);
    expect(regionPredicate(stringRegionFigure)).toBe(false);
    expect(regionPredicate(regionRows)).toBe(false);
    expect(regionPredicate({ status: 1, data: [] })).toBe(false);

    const stakedContract = getCatalogueEntry("vapi.land.stake.dec-staked").resultContract;
    const stakedPredicate = predicateFor(stakedContract);
    expect(stakedPredicate(decStakedRows)).toBe(true);
    expect(stakedPredicate(decStakedNone)).toBe(true);
    const stringAmount = structuredClone(decStakedRows) as { data: Array<Record<string, unknown>> };
    stringAmount.data[0]!.amount = "1";
    const nullAmount = structuredClone(decStakedRows) as { data: Array<Record<string, unknown>> };
    nullAmount.data[0]!.amount = null;
    const objectRows = structuredClone(decStakedRows) as { data: unknown };
    objectRows.data = {};
    expect(stakedPredicate(stringAmount)).toBe(false);
    expect(stakedPredicate(nullAmount)).toBe(false);
    expect(stakedPredicate(objectRows)).toBe(false);
    const missingAmount = structuredClone(decStakedRows) as { data: Array<Record<string, unknown>> };
    delete missingAmount.data[0]!.amount;
    // The declarative contract enforces per-row type but not per-row presence; this recorded limitation is intentional.
    expect(stakedPredicate(missingAmount)).toBe(true);
    const extraKey = structuredClone(decStakedRows) as { data: Array<Record<string, unknown>> };
    extraKey.data[0]!.future_field = "ignored";
    expect(stakedPredicate(extraKey)).toBe(true);

    const pendingPredicate = predicateFor(getCatalogueEntry("vapi.land.stake.evp-pending-claim").resultContract);
    expect(pendingPredicate(evpPendingClaim)).toBe(true);
    const nullPending = structuredClone(evpPendingClaim) as { data: Record<string, unknown> };
    nullPending.data.pending_claim_amount = null;
    expect(pendingPredicate(nullPending)).toBe(false);
    expect(pendingPredicate({ ...evpPendingClaim, data: 0 })).toBe(false);
  });

  it("contracts owned resource rows and their empty result", () => {
    const contract = getCatalogueEntry("vapi.land.resources.owned").resultContract;
    const predicate = predicateFor(contract);
    expect(predicate(resourcesOwnedEmpty)).toBe(true);
    expect(predicate({
      status: "success",
      data: [{
        id: 1,
        region_uid: "PR-PNW-1",
        player: "sample-account-b",
        amount: 261324.764,
        resource_symbol: "GRAIN",
        created_date: "2026-01-01T00:00:00.000Z",
        last_updated_date: "2026-01-02T00:00:00.000Z",
        region_name: "region",
        region_number: 1,
      }],
    })).toBe(true);
    const stringAmount = {
      status: "success",
      data: [{
        id: 1,
        region_uid: "PR-PNW-1",
        player: "sample-account-b",
        amount: "261324.764",
        resource_symbol: "GRAIN",
        created_date: "2026-01-01T00:00:00.000Z",
        last_updated_date: "2026-01-02T00:00:00.000Z",
        region_name: "region",
        region_number: 1,
      }],
    };
    expect(predicate(stringAmount)).toBe(false);
  });

  it("contracts tax records for recognized and fabricated deed ids", () => {
    const contract = getCatalogueEntry("vapi.land.resources.taxes").resultContract;
    const predicate = predicateFor(contract);
    expect(predicate(resourcesTaxesReal)).toBe(true);
    expect(predicate(resourcesTaxesUnknown)).toBe(true);
    const stringCapacity = structuredClone(resourcesTaxesReal) as { data: { capacity: unknown } };
    stringCapacity.data.capacity = "1000000";
    expect(predicate(stringCapacity)).toBe(false);
  });

  it("contracts reward actions, their count, and both transaction-history row sets", () => {
    const rewardactionsContract = getCatalogueEntry("vapi.land.resources.rewardactions").resultContract;
    const rewardactionsPredicate = predicateFor(rewardactionsContract);
    expect(rewardactionsPredicate(rewardactions)).toBe(true);
    expect(rewardactionsPredicate(rewardactionsEmpty)).toBe(true);
    expect(rewardactionsContract.fingerprint["data[].trx_id"]).toMatchObject({ type: "string", valueClass: "id" });
    expect(rewardactions.data[0]!.trx_id).toBe("a5cc07d54c3f5b6e30bf120be7f672606cecb0a6");
    const stringRewardAmount = structuredClone(rewardactions) as { data: Array<Record<string, unknown>> };
    stringRewardAmount.data[0]!.amount_received = "700.657";
    expect(rewardactionsPredicate(stringRewardAmount)).toBe(false);

    const countContract = getCatalogueEntry("vapi.land.resources.rewardactions-count").resultContract;
    const countPredicate = predicateFor(countContract);
    expect(countPredicate(rewardactionsCount)).toBe(true);
    expect(rewardactionsCount.data.count).toBe(313);
    expect(countPredicate({ ...rewardactionsCount, data: { count: "313" } })).toBe(false);

    const historyContract = getCatalogueEntry("vapi.land.resources.history").resultContract;
    const historyPredicate = predicateFor(historyContract);
    expect(historyPredicate(resourcesHistory)).toBe(true);
    expect(historyPredicate(resourcesHistoryEmpty)).toBe(true);
    expect(resourcesHistory.data[0]!.trx_id).toBe(rewardactions.data[0]!.trx_id);
    expect((resourcesHistory.data[0]!.amount as number)).toBeLessThan(0);
    const stringHistoryAmount = structuredClone(resourcesHistory) as { data: Array<Record<string, unknown>> };
    stringHistoryAmount.data[0]!.amount = "-6278.29";
    expect(historyPredicate(stringHistoryAmount)).toBe(false);

    const fragmentContract = getCatalogueEntry("vapi.land.resources.fragment-history").resultContract;
    const fragmentPredicate = predicateFor(fragmentContract);
    expect(fragmentPredicate(fragmentHistory)).toBe(true);
    expect(fragmentPredicate(fragmentHistoryEmpty)).toBe(true);
    expect(fragmentHistory.data[0]!.trx_id).toBe(rewardactions.data[0]!.trx_id);
    expect(fragmentHistory.data[0]!.deed_uid).not.toBe(rewardactions.data[0]!.deed_uid);
    const stringFragmentChance = structuredClone(fragmentHistory) as { data: Array<Record<string, unknown>> };
    stringFragmentChance.data[0]!.fragment_chance = "0.00464";
    expect(fragmentPredicate(stringFragmentChance)).toBe(false);
  });

  it("contracts balance-history rows and counts without implying list equivalence", () => {
    const historyContract = getCatalogueEntry("vapi.land.resources.balances-history").resultContract;
    const historyPredicate = predicateFor(historyContract);
    expect(historyPredicate(balancesHistory)).toBe(true);
    expect(historyPredicate(balancesHistoryEmpty)).toBe(true);
    expect(balancesHistory.data).toHaveLength(2);
    expect(historyContract.fingerprint["data[].player"]).toMatchObject({ type: "string", valueClass: "name" });
    const stringAmount = structuredClone(balancesHistory) as { data: Array<Record<string, unknown>> };
    stringAmount.data[0]!.amount = "16332.706";
    expect(historyPredicate(stringAmount)).toBe(false);

    const countContract = getCatalogueEntry("vapi.land.resources.balances-history-count").resultContract;
    const countPredicate = predicateFor(countContract);
    expect(countPredicate(balancesHistoryCount)).toBe(true);
    expect(countPredicate(balancesHistoryCountEmpty)).toBe(true);
    expect(balancesHistoryCount.data.count).toBe(721);
    expect(countPredicate({ ...balancesHistoryCount, data: { count: "721" } })).toBe(false);
  });

  it("contracts title rows and preserves their wire types", () => {
    const titlesContract = getCatalogueEntry("vapi.land.resources.titles").resultContract;
    const titlesPredicate = predicateFor(titlesContract);
    expect(titlesPredicate(titles)).toBe(true);
    expect(titlesPredicate(titlesEmpty)).toBe(true);
    expect(titles.data[0]!.title).toBe("Warden");
    expect(titlesContract.fingerprint["data[].player"]).toMatchObject({ type: "string", valueClass: "name" });
    const numericTitle = structuredClone(titles) as { data: Array<Record<string, unknown>> };
    numericTitle.data[0]!.title = 1;
    expect(titlesPredicate(numericTitle)).toBe(false);

    const assignedContract = getCatalogueEntry("vapi.land.resources.titles-assigned").resultContract;
    const assignedPredicate = predicateFor(assignedContract);
    expect(assignedPredicate(titlesAssigned)).toBe(true);
    expect(assignedContract.fingerprint["data[].avatar_id"]).toMatchObject({ type: "number", valueClass: "id" });
    const stringLeague = structuredClone(titlesAssigned) as { data: Array<Record<string, unknown>> };
    stringLeague.data[0]!.league = "1";
    expect(assignedPredicate(stringLeague)).toBe(false);
  });

  it("contracts richlist rows and the leaderboard JSON-encoded data field", () => {
    const richlistPredicate = predicateFor(getCatalogueEntry("vapi.land.resources.richlist").resultContract);
    const leaderboardsPredicate = predicateFor(getCatalogueEntry("vapi.land.resources.leaderboards").resultContract);
    expect(richlistPredicate(resourcesRichlist)).toBe(true);
    expect(leaderboardsPredicate(resourcesLeaderboards)).toBe(true);

    const wrongRichlistAmount = structuredClone(resourcesRichlist) as { data: Array<Record<string, unknown>> };
    wrongRichlistAmount.data[0]!.amount = "44636444.689";
    const parsedLeaderboardData = structuredClone(resourcesLeaderboards) as { data: Array<Record<string, unknown>> };
    parsedLeaderboardData.data[0]!.data = { crest: { banner: "teal", decal: "shield" } };
    expect(richlistPredicate(wrongRichlistAmount)).toBe(false);
    expect(leaderboardsPredicate(parsedLeaderboardData)).toBe(false);
  });

  it("contracts harvestable resource rows and their empty result", () => {
    const contract = getCatalogueEntry("vapi.land.resources.production-region-harvestable").resultContract;
    const predicate = predicateFor(contract);
    expect(predicate(resourcesHarvestableEmpty)).toBe(true);
    expect(predicate({
      status: "success",
      data: [{
        amount_claimable: 1,
        grain_required_for_food: 2,
        wood_required: 3,
        stone_required: 4,
        iron_required: 5,
        token_symbol: "GRAIN",
      }],
    })).toBe(true);
  });

  it("accepts active hits and successful empty active answers", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.deed-active").resultContract);
    expect(predicate(activeHit)).toBe(true);
    expect(predicate(activeNone)).toBe(true);

    const arraySegments = structuredClone(activeHit) as { data: Record<string, unknown> };
    arraySegments.data.segments = [];
    expect(predicate(arraySegments)).toBe(true);
  });

  it("accepts the observed history bodies and empty list", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.list").resultContract);
    expect(predicate(historyRows)).toBe(true);
    expect(predicate(historyLimited)).toBe(true);
    expect(predicate(historyEmpty)).toBe(true);
  });

  it("keeps nullable fields required and typed", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.list").resultContract);
    const keys = [
      "completed_date", "destroyed_date", "next_op_allowed_date", "projected_end",
      "hours_to_completion", "project_id", "is_sps_work",
    ];
    for (const key of keys) {
      const nulled = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
      nulled.data[0]![key] = null;
      expect(predicate(nulled)).toBe(true);
      const absent = structuredClone(nulled);
      delete absent.data[0]![key];
      expect(predicate(absent)).toBe(false);
    }
  });

  it("rejects wrong project types and list segment wrappers", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.list").resultContract);
    const wrongBoolean = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    wrongBoolean.data[0]!.is_sps_work = "no";
    const wrongNumber = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    wrongNumber.data[0]!.project_id = "44752";
    const wrongSegments = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    wrongSegments.data[0]!.segments = {};
    expect(predicate(wrongBoolean)).toBe(false);
    expect(predicate(wrongNumber)).toBe(false);
    expect(predicate(wrongSegments)).toBe(false);
  });

  it("accepts the widened open-segment termination fields while requiring them", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.list").resultContract);
    const openSegment = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    const segments = openSegment.data.find((row) => Array.isArray(row.segments) && row.segments.length > 0)?.segments as Array<Record<string, unknown>>;
    if (segments === undefined) throw new Error("history fixture has no segment");
    // This mutation is a validator exercise, not a captured observation.
    segments[0]!.ended_date = null;
    segments[0]!.closed_trx = null;
    segments[0]!.end_staked_pp = null;
    segments[0]!.duration = null;
    expect(predicate(openSegment)).toBe(true);
    delete segments[0]!.ended_date;
    expect(predicate(openSegment)).toBe(false);
  });

  it("rejects missing project keys but tolerates unknown keys", () => {
    const predicate = predicateFor(getCatalogueEntry("vapi.land.projects.list").resultContract);
    const missing = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    delete missing.data[0]!.block_num;
    const extra = structuredClone(historyRows) as { data: Array<Record<string, unknown>> };
    extra.data[0]!.future_field = "tolerated";
    expect(predicate(missing)).toBe(false);
    expect(predicate(extra)).toBe(true);
  });

  it("validates requirement types and null-only parent ids", () => {
    const contract = getCatalogueEntry("vapi.land.projects.requirements").resultContract;
    const predicate = predicateFor(contract);
    expect(predicate(requirementsSentinel)).toBe(true);
    expect(predicate(requirementsReal)).toBe(true);
    expect(predicate(requirementsNone)).toBe(true);
    expect((requirementsSentinel.data as Array<Record<string, unknown>>).every((row) => typeof row.work_per_hour === "string")).toBe(true);
    expect((requirementsReal.data as Array<Record<string, unknown>>).every((row) => typeof row.work_per_hour === "string")).toBe(true);
    expect(contract.fingerprint["data[].land_work_type_parent_id"]).toBeUndefined();

    const numericRate = structuredClone(requirementsReal) as { data: Array<Record<string, unknown>> };
    numericRate.data[0]!.work_per_hour = 6820;
    expect(predicate(numericRate)).toBe(false);

    const parentVariants = [null, "parent", undefined];
    for (const parent of parentVariants) {
      const body = structuredClone(requirementsReal) as { data: Array<Record<string, unknown>> };
      if (parent === undefined) delete body.data[0]!.land_work_type_parent_id;
      else body.data[0]!.land_work_type_parent_id = parent;
      expect(predicate(body)).toBe(true);
    }
  });

  it("treats a zero count as a populated answer", () => {
    const contract = getCatalogueEntry("vapi.land.projects.list-count").resultContract;
    expect(predicateFor(contract)(countZero)).toBe(true);
    expect(countZero.data.count).toBe(0);
  });

  it("accepts volume strings without asserting momentary values", () => {
    const contract = getCatalogueEntry("vapi.land.volume").resultContract;
    const predicate = predicateFor(contract);
    expect(predicate(volume)).toBe(true);
    const data = volume.data as { sum?: unknown; count?: unknown };
    expect(data).toHaveProperty("sum");
    expect(data).toHaveProperty("count");
    expect(typeof data.sum).toBe("string");
    expect(typeof data.count).toBe("string");

    const numericSum = structuredClone(volume) as { data: { sum: unknown } };
    numericSum.data.sum = 1;
    const missingCount = structuredClone(volume) as { data: Record<string, unknown> };
    delete missingCount.data.count;
    // These are synthetic validator exercises, not captured observations.
    expect(predicate(numericSum)).toBe(false);
    expect(predicate(missingCount)).toBe(false);
  });

  it("contracts the liquidity reward totals and quote response", () => {
    const rewardsContract = getCatalogueEntry("vapi.land.liquidity.allrewards").resultContract;
    const rewardsPredicate = predicateFor(rewardsContract);
    expect(rewardsPredicate(liquidityAllrewards)).toBe(true);
    expect(liquidityAllrewards.data).toHaveLength(12);
    expect(rewardsContract.fingerprint["data[].liquidity_pool_id"]).toMatchObject({ type: "number", valueClass: "id" });

    const quoteContract = getCatalogueEntry("vapi.land.liquidity.quote").resultContract;
    const quotePredicate = predicateFor(quoteContract);
    expect(quotePredicate(liquidityQuote)).toBe(true);
    const stringQuote = structuredClone(liquidityQuote) as { data: { resource_amount: unknown } };
    stringQuote.data.resource_amount = "12144.988";
    expect(quotePredicate(stringQuote)).toBe(false);
  });

  it("contracts per-token liquidity resources and the regional pivot", () => {
    const resourcesContract = getCatalogueEntry("vapi.land.liquidity.resources").resultContract;
    const resourcesPredicate = predicateFor(resourcesContract);
    expect(resourcesPredicate(liquidityResources)).toBe(true);
    expect(resourcesPredicate(liquidityResourcesEmpty)).toBe(true);
    expect(resourcesContract.fingerprint["data[].resource_symbol"]).toMatchObject({ type: "string", valueClass: "enum" });
    const stringAmount = structuredClone(liquidityResources) as { data: Array<Record<string, unknown>> };
    stringAmount.data[0]!.amount = "20722901.171";
    expect(resourcesPredicate(stringAmount)).toBe(false);

    const regionContract = getCatalogueEntry("vapi.land.liquidity.region").resultContract;
    const regionPredicate = predicateFor(regionContract);
    expect(regionPredicate(liquidityRegion)).toBe(true);
    expect(regionPredicate(liquidityRegionEmpty)).toBe(true);
    expect(regionContract.fingerprint["data[].plots_owned"]).toMatchObject({ type: "number", valueClass: "numeric" });
    const stringPlots = structuredClone(liquidityRegion) as { data: Array<Record<string, unknown>> };
    stringPlots.data[0]!.plots_owned = "102";
    expect(regionPredicate(stringPlots)).toBe(false);
  });

  it("accepts the captured populated and empty count envelopes", () => {
    const regions = getCatalogueEntry("vapi.land.regions.counts").resultContract;
    const tracts = getCatalogueEntry("vapi.land.tracts.counts").resultContract;
    expect(predicateFor(regions)(regionsEmpty)).toBe(true);
    expect(predicateFor(regions)(regionsRows)).toBe(true);
    expect(predicateFor(tracts)(tractsEmpty)).toBe(true);
    expect(predicateFor(tracts)(tractsRows)).toBe(true);
    expect(regions.observedKeyPaths).toContain("data[].dec_stake");
    expect(regions.observedKeyPaths).toContain("data[].region.uid");
    expect(tracts.observedKeyPaths).toContain("data[].tract_number");
    expect(tracts.observedKeyPaths).toContain("data[].region.name");
    expect(regions.predicateId).toBe("land.regions.counts");
    expect(tracts.predicateId).toBe("land.tracts.counts");
  });

  it("rejects malformed populated count rows", () => {
    const regionsPredicate = predicateFor(getCatalogueEntry("vapi.land.regions.counts").resultContract);
    const tractsPredicate = predicateFor(getCatalogueEntry("vapi.land.tracts.counts").resultContract);
    const missingRegionField = structuredClone(regionsRows) as { data: Array<{ region: Record<string, unknown> }> };
    delete missingRegionField.data[0]!.region.uid;
    const wrongTractType = structuredClone(tractsRows) as { data: Array<Record<string, unknown>> };
    wrongTractType.data[0]!.tract_number = "1";
    expect(regionsPredicate(missingRegionField)).toBe(false);
    expect(tractsPredicate(wrongTractType)).toBe(false);
  });

  it("rejects AppException-shaped success envelopes", () => {
    const appException = { status: "success", data: { name: "AppException", status: 400, message: "upstream failure" } };
    expect(predicateFor(getCatalogueEntry("vapi.land.regions.counts").resultContract)(appException)).toBe(false);
    expect(predicateFor(getCatalogueEntry("vapi.land.tracts.counts").resultContract)(appException)).toBe(false);
  });

  it("rejects invalid envelopes across the count and volume contracts", () => {
    const contracts = [
      getCatalogueEntry("vapi.land.regions.counts").resultContract,
      getCatalogueEntry("vapi.land.tracts.counts").resultContract,
      getCatalogueEntry("vapi.land.volume").resultContract,
    ];
    for (const contract of contracts) {
      const predicate = predicateFor(contract);
      expect(predicate([])).toBe(false);
      expect(predicate({ status: 1, data: [] })).toBe(false);
    }
  });

  it("keeps the limited history ids as a prefix of the full history ids", () => {
    const fullIds = (historyRows.data as Array<{ id: number }>).map((row) => row.id);
    const limitedIds = (historyLimited.data as Array<{ id: number }>).map((row) => row.id);
    expect(fullIds.slice(0, limitedIds.length)).toEqual(limitedIds);
  });

  it("contracts liquidity pools, separate lookups, and swap history", () => {
    const poolsContract = getCatalogueEntry("vapi.land.liquidity.pools").resultContract;
    const poolsPredicate = predicateFor(poolsContract);
    expect(poolsPredicate(liquidityPools)).toBe(true);
    expect(poolsContract.fingerprint["data[].resource_quantity"]).toMatchObject({ type: "string", valueClass: "numeric" });
    expect(poolsContract.fingerprint["data[].resource_price"]).toMatchObject({ type: "number", valueClass: "numeric" });
    const numericResourceQuantity = structuredClone(liquidityPools) as { data: Array<Record<string, unknown>> };
    numericResourceQuantity.data[0]!.resource_quantity = 4957049374.652;
    expect(poolsPredicate(numericResourceQuantity)).toBe(false);

    const byIdPredicate = predicateFor(getCatalogueEntry("vapi.land.liquidity.pools-by-id").resultContract);
    expect(byIdPredicate(liquidityPoolById)).toBe(true);
    expect(byIdPredicate(liquidityPoolByIdMiss)).toBe(true);
    const bySymbolPredicate = predicateFor(getCatalogueEntry("vapi.land.liquidity.pools-by-symbol").resultContract);
    expect(bySymbolPredicate(liquidityPoolBySymbol)).toBe(true);
    expect(bySymbolPredicate(liquidityPoolBySymbolMiss)).toBe(true);

    const swapsContract = getCatalogueEntry("vapi.land.resources.liquidity.swaps").resultContract;
    const swapsPredicate = predicateFor(swapsContract);
    expect(swapsPredicate(liquiditySwaps)).toBe(true);
    expect(swapsPredicate(liquiditySwapsEmpty)).toBe(true);
    expect(liquiditySwaps.data).toHaveLength(2);
    const stringQuantity = structuredClone(liquiditySwaps) as { data: Array<Record<string, unknown>> };
    stringQuantity.data[0]!.sent_quantity = "549.15";
    expect(swapsPredicate(stringQuantity)).toBe(false);
  });
});

it("accepts a null lock duration on an unlocked deed without coercing strings", () => {
  const accepts = predicateFor(getCatalogueEntry("vapi.land.deeds.details-by-uid").resultContract);
  expect(accepts({ ...byUidHit, data: { ...byUidHit.data, lock_days: null } })).toBe(true);
  expect(accepts({ ...byUidHit, data: { ...byUidHit.data, lock_days: "0" } })).toBe(false);
});
