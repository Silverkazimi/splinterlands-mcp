import { createAvatarRenderer, AvatarArtworkError } from "./avatar/artwork.js";
import { collectionPlotReferences } from "./collection-plot-references.js";
import { registerScenarioSnapshot, SCENARIO_TOOL_ROUTES } from "./land-scenario-snapshot.js";
import { POWER_CORE_ENTRY_IDS, registerPowerCoreReads } from "./power-core.js";
import { DELEGATION_ENTRY_IDS, registerDelegations } from "./delegations.js";
import { INVENTORY_ENTRY_IDS, registerInventory } from "./player-inventory.js";
import { withLandPlotView } from "./land-plot-view.js";
import { registerLineupEstimator } from "./land-lineup-estimator.js";
import { withCollectionStaking } from "./collection-staking.js";
import { withLandWorkerView } from "./land-worker-view.js";
import { registerLandRuleResources } from "./land-rule-resources.js";
import { createCardDefinitionLoader, joinCardDefinition } from "./card-definitions.js";
import { registerHiveTools, HIVE_TOOL_ROUTES } from "./hive-tools.js";
import { HermesHiveReader } from "./hive-reader.js";
import { ScopedMcpServer } from "./scoped-server.js";
import { candidatePlotId, matchesPlotLabel, parsePlotLabel, plotIdentityFromResponse, plotIdOrLabelSchema } from "./plot-references.js";
import { COLLECTOR_ENTRY_IDS, registerCollector } from "./collector.js";
import { RENTAL_ENTRY_IDS, registerRentals } from "./rentals.js";
import { VAPI_MARKET_ENTRY_IDS, registerVapiMarket } from "./vapi-market.js";
import { CONFLICT_PROPOSAL_ENTRY_IDS, registerConflictsProposals } from "./conflicts-proposals.js";
import { GAME_METADATA_ENTRY_IDS, registerGameMetadata } from "./game-metadata.js";
import { GUILD_ENTRY_IDS, registerGuilds } from "./guilds.js";
import { TOURNAMENT_ENTRY_IDS, registerTournaments } from "./tournaments.js";
import { BATTLE_ENTRY_IDS, registerBattles } from "./battles.js";
import { MARKET_ENTRY_IDS, registerMarket } from "./market.js";
import { RANKING_ENTRY_IDS, registerRankings } from "./rankings.js";
import { PLAYER_COMPLETION_ENTRY_IDS, registerPlayerCompletion } from "./player-completion.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bindRequest, inputSchemaFor } from "./catalogue/index.js";
import { SplinterlandsHttpClient, type ClientOptions } from "./http/client.js";
import { isEmptyResult, type Freshness, type HttpResult, type UpstreamOutcome } from "./http/errors.js";
import { CARD_DETAILS_TTL_MS, COLLECTION_CACHE_TTL_MS, TtlCache } from "./http/cache.js";
import { describeEndpoint, listEndpoints } from "./endpoint-knowledge.js";
import { COLLECTION_PAGE_LIMIT, COLLECTION_TIMEOUT_MS, parseCardsCollection, type ProjectedCollection, type ProjectedCollectionCard } from "./cards-collection.js";
import { z } from "zod";

const LAND_LIQUIDITY_POOLS_DESCRIPTION = "List the six liquidity-pool rows the upstream returns, as GET /land/liquidity/pools returns them. A successful response is {status, data}, where data is an array of pool objects. The wire types are intentionally mixed: resource_quantity, dec_quantity and total_shares are JSON strings, while resource_price and the resource and DEC volume fields are JSON numbers. This server returns every field exactly as received; it does not convert the string-valued decimals, and a wire-type change would be reported as a malformed response rather than converted silently. The six observed rows had ids 1, 34, 67, 68, 69 and 100 with symbols GRAIN, VOUCHER, WOOD, STONE, IRON and SPS. This tool reports the rows returned by the upstream and does not derive prices, volumes or shares.";
const LAND_LIQUIDITY_POOL_BY_ID_DESCRIPTION = "Get one liquidity-pool object by id, as GET /land/liquidity/pools/{id} returns it. A real id returned a single object with a narrower field set than the list route, omitting the one-day and thirty-day volume fields. An unknown well-formed id returned HTTP 200 with data:null, while a malformed id returned HTTP 400; these are distinguishable upstream outcomes. The object fields retain the mixed wire types observed on the list route: resource_quantity, dec_quantity and total_shares are JSON strings, while prices are JSON numbers. This server returns the upstream response unchanged and does not turn data:null into an error or manufacture a pool object.";
const LAND_LIQUIDITY_POOL_BY_SYMBOL_DESCRIPTION = "Get one liquidity-pool object by symbol, as GET /land/liquidity/poolsbysymbol/{symbol} returns it. All five tested casings GRAIN, grain, Grain, VOUCHER and voucher returned the correct matching pool; this records five observed working casings and is not a general rule about every possible input. An unknown symbol returned HTTP 200 with data:null. The object fields retain the mixed wire types observed on the list route: resource_quantity, dec_quantity and total_shares are JSON strings, while prices are JSON numbers. This server sends the symbol as supplied, returns the upstream response unchanged and does not manufacture a pool object.";
const LAND_RESOURCES_LIQUIDITY_SWAPS_DESCRIPTION = "List the liquidity-swap rows the upstream returns for one player, as GET /land/resources/liquidity/swaps/{player} returns them. A real account returned 682 rows spanning all six observed pool ids. The rows carry numeric ids, quantities and pool quantities, string player/token/transaction fields and timestamp strings; this server returns each row unchanged and does not interpret or total the figures. An unknown player returned HTTP 200 with data:[], a different empty shape from the data:null used by the two pool lookup routes. An empty array therefore establishes neither that the account exists nor that it has no swaps.";
const LAND_LIQUIDITY_ALLREWARDS_DESCRIPTION = "List the 12 real (token, liquidity_pool_id) reward-total pairs returned by GET /land/liquidity/allrewards. DEC appeared once for each of the six observed pools, and each pool's own resource token appeared once. reward_total and liquidity_pool_id are JSON numbers and token is a string. This tool returns the rows unchanged and does not derive totals or pool membership.";
const LAND_LIQUIDITY_QUOTE_DESCRIPTION = "Get the best route in this liquidity family: a genuine linear, pool-specific quote from GET /land/liquidity/quote/{poolId}. resource_amount and dec_amount are optional inputs and the response carries both quoted amounts. The relationship was verified arithmetically from observed pairs: at the values tested, doubling dec_amount from 100 to 200 exactly doubled resource_amount from 12144.988 to 24289.976, and the relationship held at 1e14. This is an observed relationship at those tested values, not a formula this project has verified across the whole input range. Pool ids 1, 34 and 67 returned different quotes for the same amount. Zero and negative amounts clamp to 0/0, non-numeric amounts return HTTP 400, and an unknown well-formed pool returns 0/0. The one trap is that supplying both resource_amount and dec_amount silently lets resource_amount win, so a caller providing both receives an answer to only one of their questions. This tool reports the upstream quote unchanged.";
const LAND_LIQUIDITY_RESOURCES_DESCRIPTION = "List per-region resource rows from GET /land/liquidity/resources/{player}/{token}. This route validates properly: a garbage player, a garbage token and both garbage returned genuine empty arrays with no synthesised entry. token matching is case-sensitive. GRAIN, WOOD, STONE, IRON, RESEARCH and AURA were observed; the set is not declared exhaustive. Each row carries id, region_name, region_number, region_uid, player, amount, resource_symbol, created_date and last_updated_date, and this tool returns those fields unchanged.";
const LAND_LIQUIDITY_REGION_DESCRIPTION = "Get one row per region from GET /land/liquidity/region/{player}, a pivot of six per-token calls to GET /land/liquidity/resources/{player}/{token}. Relative to that named per-token route, this gains plots_owned and a human-readable region name available from no other measured route, while losing each per-record id, created_date and last_updated_date. It is therefore a one-call regional summary that removes fan-out; choose the per-token route when those record metadata fields are needed. An unknown or case-mismatched player returns a genuine empty array. This tool returns the upstream rows unchanged.";

const LAND_DEED_BY_PLOT_ENTRY_ID = "vapi.land.deeds.by-plot";
const LAND_DEED_BY_UID_ENTRY_ID = "vapi.land.deeds.details-by-uid";
const LAND_DEEDS_OWNED_ENTRY_ID = "vapi.land.deeds.owned";
const LAND_DEEDS_SEARCH_ENTRY_ID = "vapi.land.deeds.search";
const LAND_PROJECTS_ACTIVE_ENTRY_ID = "vapi.land.projects.deed-active";
const LAND_PROJECTS_HISTORY_ENTRY_ID = "vapi.land.projects.list";
const LAND_PROJECTS_COUNT_ENTRY_ID = "vapi.land.projects.list-count";
const LAND_PROJECTS_REQUIREMENTS_ENTRY_ID = "vapi.land.projects.requirements";
const LAND_REGIONS_COUNTS_ENTRY_ID = "vapi.land.regions.counts";
const LAND_TRACTS_COUNTS_ENTRY_ID = "vapi.land.tracts.counts";
const LAND_VOLUME_ENTRY_ID = "vapi.land.volume";
const LAND_RESOURCES_OWNED_ENTRY_ID = "vapi.land.resources.owned";
const LAND_RESOURCES_RICHLIST_ENTRY_ID = "vapi.land.resources.richlist";
const LAND_RESOURCES_LEADERBOARDS_ENTRY_ID = "vapi.land.resources.leaderboards";
const LAND_RESOURCES_TAXES_ENTRY_ID = "vapi.land.resources.taxes";
const LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_ENTRY_ID = "vapi.land.resources.production-region-harvestable";
const LAND_RESOURCES_BALANCES_HISTORY_ENTRY_ID = "vapi.land.resources.balances-history";
const LAND_RESOURCES_BALANCES_HISTORY_COUNT_ENTRY_ID = "vapi.land.resources.balances-history-count";
const LAND_RESOURCES_TITLES_ENTRY_ID = "vapi.land.resources.titles";
const LAND_RESOURCES_TITLES_ASSIGNED_ENTRY_ID = "vapi.land.resources.titles-assigned";
const LAND_RESOURCES_REWARDACTIONS_ENTRY_ID = "vapi.land.resources.rewardactions";
const LAND_RESOURCES_REWARDACTIONS_COUNT_ENTRY_ID = "vapi.land.resources.rewardactions-count";
const LAND_RESOURCES_HISTORY_ENTRY_ID = "vapi.land.resources.history";
const LAND_RESOURCES_FRAGMENT_HISTORY_ENTRY_ID = "vapi.land.resources.fragment-history";
const LAND_STAKE_ASSETS_ENTRY_ID = "vapi.land.stake.deeds-assets";
const LAND_STAKE_DEED_DETAILS_ENTRY_ID = "vapi.land.stake.deed-details";
const LAND_STAKE_DEC_OVERALL_ENTRY_ID = "vapi.land.stake.dec-overall";
const LAND_STAKE_DEC_REGION_ENTRY_ID = "vapi.land.stake.dec-region";
const LAND_STAKE_DEC_STAKED_ENTRY_ID = "vapi.land.stake.dec-staked";
const LAND_STAKE_EVP_PENDING_CLAIM_ENTRY_ID = "vapi.land.stake.evp-pending-claim";
const LAND_LIQUIDITY_POOLS_ENTRY_ID = "vapi.land.liquidity.pools";
const LAND_LIQUIDITY_POOL_BY_ID_ENTRY_ID = "vapi.land.liquidity.pools-by-id";
const LAND_LIQUIDITY_POOL_BY_SYMBOL_ENTRY_ID = "vapi.land.liquidity.pools-by-symbol";
const LAND_RESOURCES_LIQUIDITY_SWAPS_ENTRY_ID = "vapi.land.resources.liquidity.swaps";
const LAND_LIQUIDITY_ALLREWARDS_ENTRY_ID = "vapi.land.liquidity.allrewards";
const LAND_LIQUIDITY_QUOTE_ENTRY_ID = "vapi.land.liquidity.quote";
const LAND_LIQUIDITY_RESOURCES_ENTRY_ID = "vapi.land.liquidity.resources";
const LAND_LIQUIDITY_REGION_ENTRY_ID = "vapi.land.liquidity.region";
const CARDS_FIND_ENTRY_ID = "api.cards.find";
const CARDS_COLLECTION_ENTRY_ID = "api.cards.collection";
const CARDS_GET_DETAILS_ENTRY_ID = "api.cards.get-details";
const CARDS_HISTORY_ENTRY_ID = "api.cards.history";
const CARDS_LORE_ENTRY_ID = "api.cards.lore";
const CARDS_PACK_DATA_WAX_ENTRY_ID = "api.cards.pack-data-wax";
const CARDS_SKINS_ENTRY_ID = "api.cards.skins";
const CARDS_TRX_LOOKUP_ENTRY_ID = "api.cards.trx-lookup";
const PLAYERS_ITEM_DETAILS_ENTRY_ID = "api.players.item-details";
const PLAYER_PROFILE_ENTRY_ID = "api.players.details";
const PLAYER_CURRENT_REWARDS_ENTRY_ID = "api.players.current-rewards";
const PLAYER_LAST_SEASON_REWARDS_ENTRY_ID = "api.players.last-season-rewards";
const PLAYER_LAST_FOCUS_REWARDS_ENTRY_ID = "api.players.last-focus-rewards";
const PLAYER_UNCLAIMED_BALANCES_ENTRY_ID = "api.players.unclaimed-balances";
const PLAYER_UNCLAIMED_BALANCE_HISTORY_ENTRY_ID = "api.players.unclaimed-balance-history";
export const TOOL_ENTRY_IDS = {
  ...POWER_CORE_ENTRY_IDS,
  ...DELEGATION_ENTRY_IDS,
  ...PLAYER_COMPLETION_ENTRY_IDS,
  ...INVENTORY_ENTRY_IDS,
  ...RANKING_ENTRY_IDS,
  ...MARKET_ENTRY_IDS,
  ...BATTLE_ENTRY_IDS,
  ...TOURNAMENT_ENTRY_IDS,
  ...GUILD_ENTRY_IDS,
  ...GAME_METADATA_ENTRY_IDS,
  ...CONFLICT_PROPOSAL_ENTRY_IDS,
  ...VAPI_MARKET_ENTRY_IDS,
  ...RENTAL_ENTRY_IDS,
  ...COLLECTOR_ENTRY_IDS,
  land_deed_by_plot: LAND_DEED_BY_PLOT_ENTRY_ID,
  land_deed_by_uid: LAND_DEED_BY_UID_ENTRY_ID,
  land_deeds_owned: LAND_DEEDS_OWNED_ENTRY_ID,
  land_deeds_search: LAND_DEEDS_SEARCH_ENTRY_ID,
  land_projects_active: LAND_PROJECTS_ACTIVE_ENTRY_ID,
  land_projects_history: LAND_PROJECTS_HISTORY_ENTRY_ID,
  land_projects_count: LAND_PROJECTS_COUNT_ENTRY_ID,
  land_projects_requirements: LAND_PROJECTS_REQUIREMENTS_ENTRY_ID,
  land_regions_counts: LAND_REGIONS_COUNTS_ENTRY_ID,
  land_tracts_counts: LAND_TRACTS_COUNTS_ENTRY_ID,
  land_volume: LAND_VOLUME_ENTRY_ID,
  land_resources_owned: LAND_RESOURCES_OWNED_ENTRY_ID,
  land_resources_richlist: LAND_RESOURCES_RICHLIST_ENTRY_ID,
  land_resources_leaderboards: LAND_RESOURCES_LEADERBOARDS_ENTRY_ID,
  land_resources_taxes: LAND_RESOURCES_TAXES_ENTRY_ID,
  land_resources_production_region_harvestable: LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_ENTRY_ID,
  land_resources_balances_history: LAND_RESOURCES_BALANCES_HISTORY_ENTRY_ID,
  land_resources_balances_history_count: LAND_RESOURCES_BALANCES_HISTORY_COUNT_ENTRY_ID,
  land_resources_titles: LAND_RESOURCES_TITLES_ENTRY_ID,
  land_resources_titles_assigned: LAND_RESOURCES_TITLES_ASSIGNED_ENTRY_ID,
  land_resources_rewardactions: LAND_RESOURCES_REWARDACTIONS_ENTRY_ID,
  land_resources_rewardactions_count: LAND_RESOURCES_REWARDACTIONS_COUNT_ENTRY_ID,
  land_resources_history: LAND_RESOURCES_HISTORY_ENTRY_ID,
  land_resources_fragment_history: LAND_RESOURCES_FRAGMENT_HISTORY_ENTRY_ID,
  land_stake_assets: LAND_STAKE_ASSETS_ENTRY_ID,
  land_stake_deed_details: LAND_STAKE_DEED_DETAILS_ENTRY_ID,
  land_stake_dec_overall: LAND_STAKE_DEC_OVERALL_ENTRY_ID,
  land_stake_dec_region: LAND_STAKE_DEC_REGION_ENTRY_ID,
  land_stake_dec_staked: LAND_STAKE_DEC_STAKED_ENTRY_ID,
  land_stake_evp_pending_claim: LAND_STAKE_EVP_PENDING_CLAIM_ENTRY_ID,
  land_liquidity_pools: LAND_LIQUIDITY_POOLS_ENTRY_ID,
  land_liquidity_pool_by_id: LAND_LIQUIDITY_POOL_BY_ID_ENTRY_ID,
  land_liquidity_pool_by_symbol: LAND_LIQUIDITY_POOL_BY_SYMBOL_ENTRY_ID,
  land_resources_liquidity_swaps: LAND_RESOURCES_LIQUIDITY_SWAPS_ENTRY_ID,
  land_liquidity_allrewards: LAND_LIQUIDITY_ALLREWARDS_ENTRY_ID,
  land_liquidity_quote: LAND_LIQUIDITY_QUOTE_ENTRY_ID,
  land_liquidity_resources: LAND_LIQUIDITY_RESOURCES_ENTRY_ID,
  land_liquidity_region: LAND_LIQUIDITY_REGION_ENTRY_ID,
  cards_find: CARDS_FIND_ENTRY_ID,
  cards_collection: CARDS_COLLECTION_ENTRY_ID,
  cards_get_details: CARDS_GET_DETAILS_ENTRY_ID,
  cards_history: CARDS_HISTORY_ENTRY_ID,
  cards_lore: CARDS_LORE_ENTRY_ID,
  cards_pack_data_wax: CARDS_PACK_DATA_WAX_ENTRY_ID,
  cards_skins: CARDS_SKINS_ENTRY_ID,
  cards_trx_lookup: CARDS_TRX_LOOKUP_ENTRY_ID,
  players_item_details: PLAYERS_ITEM_DETAILS_ENTRY_ID,
  player_avatar: "api.players.avatar",
  player_custom_avatar: "api.players.custom-avatar",
  player_profile: PLAYER_PROFILE_ENTRY_ID,
  player_current_rewards: PLAYER_CURRENT_REWARDS_ENTRY_ID,
  player_last_season_rewards: PLAYER_LAST_SEASON_REWARDS_ENTRY_ID,
  player_last_focus_rewards: PLAYER_LAST_FOCUS_REWARDS_ENTRY_ID,
  player_unclaimed_balances: PLAYER_UNCLAIMED_BALANCES_ENTRY_ID,
  player_unclaimed_balance_history: PLAYER_UNCLAIMED_BALANCE_HISTORY_ENTRY_ID,
} as const;
const CALLABLE_ENDPOINT_IDS = new Set<string>(Object.values(TOOL_ENTRY_IDS));
export const MAX_RESULT_ROWS = 100;
export const MAX_RESULT_BYTES = 256 * 1024;
const TRUNCATION_TEXT = "This result was truncated to {rows} rows; more may exist upstream. The parameters tried for this route are not recorded in this message; this server made one request and did not fetch another response. Narrow the request to retrieve other results.";
const HISTORY_TRUNCATION_TEXT = "This result was truncated to {rows} rows by this server's result limit; the upstream response contained more records. In the recorded probes, offset=1 and limit=2&offset=2 returned the same leading rows as their requests without an advancing offset; no later rows were reached by those values.";
const OVERSIZED_RECORD_TEXT = `This single record is too large to return within the ${MAX_RESULT_BYTES / 1024} KB result limit.`;
const HISTORY_LIMITATION_TEXT = "The recorded history probes were a bare request, offset=1, limit=2, and limit=2&offset=2: limit=2 narrowed from the start, while offset=1 and offset=2 did not reach later rows in those requests. This answer is additionally bounded to at most 100 rows and 256 KB by this server; if it is cut for that reason, the response reports that local bound. The project-count tool returns the count the upstream reports for this deed; whether that count covers exactly the records this tool would return has not been verified.";
const SEARCH_PAGING_TEXT = "Paging probes recorded for this route were offset=0, offset=5, limit=10000, three calls omitting all parameters, and orderBy=desc: offset=0 returned zero rows; offset=5 returned the first four rows of the omitted-offset response; limit=10000 returned 10000 rows; the three omitted-parameter calls returned zero bytes; and orderBy=desc returned an empty data array. No total or has-more field was observed. No offset value tried reached later rows than the omitted-offset response; narrow the player, tract_id or region_number request instead.";
const SEARCH_LIMITATION_TEXT = `The limited form of this search has object-shaped data rather than an array, so this server's 100-row bound does not apply to that response. The only server result bound that applies to that response is the 256 KB serialized-result limit, and that limit is all-or-nothing. An oversized limited response returns status alone with the deeds, worksite_details and staking_details arrays dropped; the text says "This single record is too large to return within the 256 KB result limit." Request a smaller limit; retrying the same call will not return partial data. ${SEARCH_PAGING_TEXT}`;
const ORDERED_SEARCH_LIMITATION_TEXT = `The observed ordered probe with orderBy=desc returned an empty array (measured 2026-09-06), and this server's contract currently accepts that response. A non-empty ordered response would be reported as malformed rather than returned. Because the observed ordered response was empty, no row bound or truncation is described for that form. ${SEARCH_PAGING_TEXT}`;
const SEARCH_SCOPE_REFUSAL_TEXT = "Search requires a scope; none was supplied. Provide player or a place (tract_id or region_number).";
const LAND_RESOURCES_OWNED_SCOPE_REFUSAL_TEXT = "This tool requires both a player and a resource. The upstream returns data:null at HTTP 200 when either is missing, so this tool refuses a partly scoped call rather than return that response as though it described an empty holding.";
const LAND_RESOURCES_RICHLIST_SCOPE_REFUSAL_TEXT = "This tool requires both a region and a resource. The upstream returned HTTP 400 when either was omitted, so this tool refuses a partly scoped call before making the request.";
const LAND_RESOURCES_LEADERBOARDS_SCOPE_REFUSAL_TEXT = "This tool requires a resource and either a region or a territory. The upstream call without region or territory was measured to hang without an HTTP response, so this tool refuses that call before making the request.";
const LAND_RESOURCES_BALANCES_HISTORY_DESCRIPTION = "List the resource-balance history rows the upstream returns for one account and optional dates, as GET /land/resources/balances/history/{player} returns them. The player is a path segment on this route, not a query parameter. A successful response is {status, data}, where data is an array of rows carrying id, region_number, player, amount, end_balance, operation_id, resource_id, trx_id, created_date, balance_history and counterparty. The numeric fields are JSON numbers, created_date is a timestamp string, balance_history is an array and counterparty is a string; this server returns these fields unchanged and does not convert, round, total or compare them. Both YYYY-MM-DD and full ISO-8601 timestamps were accepted for startDate and endDate and produced identical results for the same calendar range. A malformed date returned HTTP 500, while a far-past date range returned a successful empty array, so this tool does not describe malformed dates as empty or unfiltered results. An unknown player returned HTTP 200 with an empty array; an empty result therefore does not establish that the account exists or does not exist. The default response contained 100 newest rows. limit=1000 and limit=500 returned HTTP 400; limit=3 with offset=0 returned three rows; limit=3 with offset=1, offset=2 and offset=3 returned HTTP 200 with empty arrays. No offset value tried reached rows beyond the newest 100. This tool reports the rows returned by the upstream and nothing else.";
const LAND_RESOURCES_BALANCES_HISTORY_COUNT_DESCRIPTION = "Get the resource-balance history count the upstream reports for one account and optional dates, as GET /land/resources/balances/history/{player}/count returns it. The player is a path segment on this route, not a query parameter. A successful response is {status, data}, where data is an object carrying count, a JSON number returned unchanged; this server does not convert, round or derive it. The measured count was 721. In the paired list probes, the default returned 100 newest rows, limit=3&offset=0 returned three rows, limit=3&offset=1, limit=3&offset=2 and limit=3&offset=3 returned empty arrays, and limit=500 and limit=1000 returned HTTP 400; those tried list parameters did not expose rows beyond the 100-row default, leaving 621 rows present in the count but absent from those list responses. The count and the list do not contradict each other: the count reports more rows than those responses contain. Whether the count covers exactly what the list would return was not verified, so this tool does not assert that relationship. A far-past date range returned count 0, matching the list route's empty result for the same range, and a malformed date returned HTTP 500. An unknown player returned count 0; that response does not establish that the account exists or does not exist. This tool reports the count returned by the upstream and nothing else.";
const LAND_RESOURCES_TITLES_DESCRIPTION = "List the public land-title rows the upstream returns for one player, as GET /land/resources/titles?player= returns them. The player is a query parameter. A successful response is {status, data}, where data is an array of rows carrying title, player and created_date; title and player are strings and created_date is a timestamp string, and this server returns them unchanged. Omitting player returned HTTP 400. An unknown player returned HTTP 200 with data:[], an honest empty result. This route is well-behaved: a missing player is rejected with HTTP 400 and an unknown player gives an empty array. This tool reports the title rows returned by the upstream and nothing else.";
const LAND_RESOURCES_TITLES_ASSIGNED_DESCRIPTION = "List the public title-assignment rows the upstream returns for one title, as GET /land/resources/titles/assigned?title= returns them. The title is a query parameter. A successful response is {status, data}, where data is an array of rows carrying title, player, created_date, avatar_id, league and modern_league. The title, player and created_date fields are strings or a timestamp string, and avatar_id, league and modern_league are JSON numbers; this server returns them unchanged. Warden and warden both succeeded. WARDEN returned HTTP 500, the same response as a nonexistent title and as a missing title parameter. A 500 does not establish whether the title exists. This route is not generally case-insensitive: two casings were observed to work and one failed. This tool sends the argument's case exactly as supplied and does not normalise it, because normalising toward an untested form could turn a working call into a 500. This tool reports the rows returned by the upstream and nothing else.";
const LAND_RESOURCES_REWARDACTIONS_DESCRIPTION = "List the reward-action rows the upstream returns for one deed uid, as GET /land/resources/rewardactions/{deedUID} returns them. A successful response is {status, data}, where data is an array of rows carrying id, plot_id, tract_id, region_uid, site_efficiency, region_number, land_worksite_id, land_project_id, resource_id, resource_symbol, working_pp, duration, deed_uid, claim_amount, grain_required, claim_amount_eaten, amount_received, tax_burnt, amount_taxed, trx_description, trx_id, block_num, created_date, last_updated_date and fragment_roll. The numeric fields are JSON numbers, and this server returns them unchanged; it does not convert, round, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. fragment_roll is a nested object; this server returns it unchanged and does not interpret its fields. The default response contained 100 rows. A nonzero offset was measured to return data:[] rather than advance the list: limit=3&offset=3 and limit=1&offset=1 both returned empty arrays for a deed with 313 recorded actions. This is not the repeating-offset failure measured on the deeds search; it is an empty-array failure, and no offset value tried reached rows beyond the first 100. Supplying a limit narrows the returned rows from the start, but this tool does not imply that pagination works. A fake deed uid and a real deed with no actions both returned data:[], so an empty array establishes neither that the deed exists nor that it has no reward actions. A trx_id appears in these rows; this tool reports the rows returned by the upstream and nothing else, and does not claim what any numeric figure means.";
const LAND_RESOURCES_REWARDACTIONS_COUNT_DESCRIPTION = "Get the reward-action count the upstream reports for one deed uid, as GET /land/resources/rewardactions/{deedUID}/count returns it. A successful response is {status, data}, where data is an object carrying count, a JSON number; this server returns it unchanged and does not convert, round or derive it. The measured count was 313 for a deed whose reward-actions list returned 100 rows by default; limit=3&offset=3 and limit=1&offset=1 both returned empty arrays, so roughly 213 counted actions were absent from those three list responses. The count and list do not contradict each other: the count reports more actions than those responses contain. Whether the count covers exactly what the list would return was not verified, so this tool does not assert equivalence. A fake deed uid returned count 0, while the list route returned data:[] for both that fake deed and a real deed with no actions; these responses do not establish what an empty deed count would be. This tool reports the count the upstream returned and nothing else, and does not claim what the count means beyond the measured response.";
const LAND_RESOURCES_HISTORY_DESCRIPTION = "List the resource-history rows the upstream returns for one transaction id, as GET /land/resources/history/{trx_id} returns them. A successful response is {status, data}, where data is an array of rows carrying id, region_number, player, amount, end_balance, operation_id, resource_id, trx_id, created_date, balance_history and counterparty. The numeric fields are JSON numbers, including signed amount values; balance_history is an array; this server returns these fields unchanged and does not convert, round, total or compare them. These rows are not the private history of the deed whose reward-action row supplied the input: in one captured transaction, both measured rows named the same player, that player was not the source deed's owner, and the rows carried no deed identifier, so nothing in the response ties them to that deed. This is a bounded observation from those two rows in that one transaction, not a claim about every transaction. This route must not be described as that deed's history. A fake transaction id returned data:[] rather than an error, so an empty array establishes neither that the id exists nor that the transaction has no rows. No measured route surfaces a trx_id except reward-action rows, so this tool is reachable only by chaining from one of those rows; otherwise a caller has no measured way to obtain its input. This tool reports the rows returned by the upstream and nothing else, and does not claim what any numeric figure means.";
const LAND_RESOURCES_FRAGMENT_HISTORY_DESCRIPTION = "List the fragment-history rows the upstream returns for one transaction id, as GET /land/resources/fragment_history/{trx_id} returns them. A successful response is {status, data}, where data is an array of rows carrying id, reward_action_id, land_work_type_id, land_project_number, tract_number, region_number, deed_uid, fragment_type, fragment_found, fragment_chance, fragment_roll, trx_id, block_num, created_date, last_updated_date, labors_luck_uid, labors_luck_chance, labors_luck_roll, labors_luck_pool_pick and labors_luck_treasures_left. The numeric fields are JSON numbers and fragment_found is a boolean; this server returns them unchanged and does not convert, round, total or compare them. The nullable fields are returned as received; the response does not state what fragment_chance or fragment_roll measures, and this tool does not interpret them. These rows are not the private history of the deed whose reward-action row supplied the input: in one captured transaction, the two measured rows carried differing deed_uid values, neither matching the source deed, so that transaction id covered records for more than one deed. The rows carried no player field, so this observation makes no claim about players. This is a bounded observation from those two rows in that one transaction, not a claim about every transaction. This route must not be described as that deed's history. A fake transaction id returned data:[] rather than an error, so an empty array establishes neither that the id exists nor that the transaction has no fragment-history rows. No measured route surfaces a trx_id except reward-action rows, so this tool is reachable only by chaining from one of those rows; otherwise a caller has no measured way to obtain its input. This tool reports the rows returned by the upstream and nothing else.";
const SEARCH_TOOL_DESCRIPTION = `Search public land deeds by player or place (tract_id or region_number); a bare search is refused. A successful limited response is {status, data}, where data is an object carrying deeds, worksite_details and staking_details arrays. The catalogue declares those arrays as arrays of objects, and declares deed_uid as a string ID on each row; use that common deed_uid to join the three arrays. The deeds rows carry the public land-deed fields declared for this route. The worksite_details and staking_details rows carry the fields declared for those arrays, including staking_details[].total_work_per_hour, the per-deed total that a caller would rank deeds by; the response also carries a separate per-hour rate, worksite_details[].work_per_hour_per_one_pp, and this server does not relate the two; what it counts is not stated by the response and is not claimed here. total_work_per_hour is a JSON number, not a string, and this server returns it unchanged; it does not convert, round, rank, sort, sum or compare it, and a change in that wire type would be reported as a malformed response rather than converted silently. A zero total_work_per_hour was observed on deeds whose is_powered value was false, on one page of one account on one day (library/observations/land-deeds-search-details-2026-09-07.md); that observation does not establish that zero proves a deed is unpowered, what the figure counts beyond the field name, or what any unobserved value means. An empty result is a successful upstream answer, not an error, and establishes only that this response carried no rows; it does not establish that an account, place or deed does not exist, that no other matches exist, or that the response is complete. ${SEARCH_LIMITATION_TEXT} ${ORDERED_SEARCH_LIMITATION_TEXT} This server makes one logical upstream request and reports what that request returned; it does not claim to analyse, rank, sort, sum or compare the returned deeds or detail rows.`;
const LAND_RESOURCES_OWNED_DESCRIPTION = "List the resource-holding rows the upstream returns for one account and one resource, as GET /land/resources/owned returns them. A successful response is {status, data}, where data is an array of rows carrying id, region_uid, player, amount, resource_symbol, created_date, last_updated_date, region_name and region_number. All numeric fields are JSON numbers, and this server returns them unchanged; it does not convert, round, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. The upstream matches resource case-sensitively against its exact symbol. This tool uppercases the resource argument before making the request, but it does not enforce an enum: the observed symbols are not an exhaustive set. An unrecognised symbol returns an empty array that this server cannot distinguish from an account owning none of that resource. A missing player or resource produced data:null at HTTP 200 upstream; data:null therefore indicates a missing parameter in that observation rather than an empty holding, and this tool refuses either missing parameter rather than return that response. An empty array is a successful answer and does not establish that the account exists or that the account owns no resource beyond the request's returned rows. This tool reports the rows the upstream returned and nothing else: it does not infer holdings for symbols or regions the response does not list.";
const LAND_RESOURCES_RICHLIST_DESCRIPTION = "List the resource-richlist rows the upstream returns for one region and one resource, as GET /land/resources/richlist returns them. A successful response is {status, data}, where data is an array of rows carrying player, amount, region_uid and resource_symbol. amount is a JSON number, and this server returns it unchanged; it does not convert, round, total or compare it, and a change in that wire type would be reported as a malformed response rather than converted silently. The upstream matches resource case-sensitively against its exact symbol. This tool uppercases resource before making the request, but it does not enforce an enum because the observed symbols are not a declared exhaustive set. An unrecognised resource or region was observed to return data:[], which this server cannot distinguish from a genuinely empty ranking. Both region and resource are required by the upstream, and this tool refuses either missing parameter before making the request. This route uses region, not region_uid; other routes in this server take region_uid, and carrying that parameter name across to this route produces HTTP 400. Paging probes supplied offset=0, offset=5, page=2, cursor=5 and start=5; each returned parsed data equal to the limit=5 baseline. limit=50 returned 50 rows whose first five matched that baseline in the same order, and no ceiling was found at the tested limits 5 and 50. No value tried for offset, page, cursor or start produced a later slice. This tool reports the rows the upstream returned and nothing else.";
const LAND_RESOURCES_LEADERBOARDS_DESCRIPTION = "List the resource-leaderboard rows the upstream returns, as GET /land/resources/leaderboards returns them. A successful response is {status, data}, where data is an array of rows carrying rank, player, amount, amount2, resource_per_hour, guild, title_pre, data and id. The numeric fields are JSON numbers, and this server returns them unchanged; it does not convert, round, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. The nested data field is a JSON-encoded string, not an object; this server returns it exactly as received and does not parse it, and a change in that wire type would be reported as malformed rather than converted. The upstream matches resource case-sensitively against its exact symbol. This tool uppercases resource before making the request, but it does not enforce an enum because the observed symbols are not a declared exhaustive set. Omitting resource returned HTTP 400. Omitting region with no territory produced no HTTP response in two measurements and timed out; territory was observed to work standalone without region, so this tool refuses only when both region and territory are absent. That refusal is this server's safety choice based on the observed hang, not an upstream validation rule. Supplying player returned that player's row in addition to the normal top rows. Paging probes supplied offset=0, offset=5, page=2 and from=5; each returned parsed data equal to the limit=5 baseline. limit=50 returned 50 rows whose first five matched that baseline in the same order, and no ceiling was found at the tested limits 5 and 50. No value tried for offset, page or from produced a later slice. This tool reports the rows the upstream returned and nothing else.";
const LAND_RESOURCES_TAXES_DESCRIPTION = "Get the resource-tax record the upstream returns for one deed, as GET /land/resources/taxes/{deedUID} returns it. A successful response is {status, data}, where data is one object carrying taxes and capacity. taxes was null on all three real deeds measured; no populated taxes array was ever observed. A fabricated deed id returned taxes:[] and capacity:0, while each of the three real deed ids returned taxes:null and capacity:1000000, so those measured real and fabricated responses are distinguishable. capacity was 1000000 on all three real deeds measured. That is either a shared cap or a field that does not vary by deed; one probe cannot tell those apart, so this description does not call it the deed's capacity. The taxes and capacity values are returned unchanged; this server does not interpret, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. The required deedUID is a path segment, so omitting it reaches no handler and is reported as an upstream routing failure.";
const LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_DESCRIPTION = "List the harvestable resource rows the upstream returns for one account and one land region, as GET /land/resources/production/region/harvestable returns them. A successful response is {status, data}, where data is an array of rows carrying amount_claimable, grain_required_for_food, wood_required, stone_required, iron_required and token_symbol. All numeric fields are JSON numbers, and this server returns them unchanged; it does not convert, round, total or compare them, and a change in their wire type would be reported as a malformed response rather than converted silently. The upstream returned HTTP 400 with Invalid parameters passed when either player or region_uid was missing, and this tool requires both before making the request. A fake player or region_uid returned data:[], a successful empty answer. This tool reports the rows the upstream returned and nothing else.";
const DEC_PLAYER_SCOPE_REFUSAL_TEXT = "This tool requires a player. The upstream answers a call with no player with a plausible zero or empty result rather than an error, so an unscoped call would look like an answer about an account without being one.";
const DEC_REGION_SCOPE_REFUSAL_TEXT = "This tool requires both a player and a region_uid. The upstream answers a call missing either one with an empty result rather than an error, so a partly scoped call would look like an answer about a region without being one.";
const LAND_STAKE_DEC_OVERALL_DESCRIPTION = "Get the single DEC staking figure the upstream returns for one account, as GET /land/stake/dec/overall returns it. A successful response is {status, data}, where data is a bare JSON number rather than an object or an array; this server returns it exactly as received and does not convert, round, scale or combine it, and a change in that wire type would be reported as a malformed response rather than converted silently. What the number counts, and over what scope, is not stated by the response and is not claimed here. This route does not enforce its declared-required player parameter: a call that omits it was measured to answer HTTP 200 with the number zero, the same zero observed for an unscoped call; whether that equals a real account with nothing staked was not tested, so this tool refuses a call with no player rather than return a plausible zero that describes nobody. A name that matches no account was measured to answer with the same kind of figure as a real account, so an answer from this tool establishes neither that an account exists nor that it does not. A zero returned for a named account is a successful answer and is not reported as no result. The per-region tool lists this account's staking rows separately; this server does not add those rows up, does not compare their total with this figure, and does not derive either from the other.";
const LAND_STAKE_DEC_STAKED_DESCRIPTION = "List the per-region DEC staking rows the upstream reports for one account, as GET /land/stake/decstaked returns them. A successful response is {status, data}, where data is an array of rows carrying id, region_uid, player, amount, percent_claimable, last_trx, created_date and last_updated_date. Every numeric field on this route is a JSON number, and a change in that wire type would be reported as a malformed response rather than converted silently. Rows carry the account name as the upstream returns it. An empty array is a successful answer, and an unknown name and an unscoped call were observed to return an empty array; behaviour for a known account with no staked DEC was not captured, so an empty answer establishes neither that an account exists nor that it does not. This route does not enforce its declared-required player parameter — a call with no parameters at all was measured to return that same empty array — so this tool refuses a call with no player rather than return an unscoped empty answer as though it described somebody. What percent_claimable measures is not stated by the response and is not claimed here. This tool reports the rows the upstream returned and nothing else: it does not total the amounts, does not compare them with the account's overall figure, and makes no statement about regions the response does not list.";
const LAND_STAKE_DEC_REGION_DESCRIPTION = "Get the DEC staking figures the upstream reports for one account and one land region, as GET /land/stake/dec/region returns them. A successful response is {status, data}. data is an object carrying uid, dec_stake_needed, dec_staked and dec_stake_in_use when the upstream has a record for the request, including a full object of zero figures when a valid region has no stake for the account; the upstream returned an empty array for incomplete requests, but this registered tool refuses those requests before making the call. All three figures are JSON numbers, and a change in that wire type would be reported as a malformed response rather than converted silently. Removing player changed a resolved object response to an empty array; no numeric comparison was made. What each figure counts is still not stated by the response and is not claimed here. Neither declared-required parameter is enforced: a call omitting region_uid, and a call with no parameters at all, were both measured to answer HTTP 200 with an empty array, so this tool refuses a call that does not supply both player and region_uid. Different region uids were measured to return different figures. This tool reports the record the upstream returned for the request it was given and nothing else: it does not add figures across regions and does not compare them with any other route's.";
const LAND_STAKE_EVP_PENDING_CLAIM_DESCRIPTION = "Get the pending EVP claim figure the upstream reports for one account, as GET /land/stake/evp/pending-claim returns it. A successful response is {status, data}, where data is an object carrying a single pending_claim_amount field, a JSON number returned exactly as received; this server does not convert, round or accumulate it, and a change in that wire type would be reported as a malformed response rather than converted silently. What EVP is, what makes an amount claimable, and over what period the figure accrues are not stated by the response and are not claimed here. A zero is a successful answer. This server has observed zero for both a real account and a name that matches no account, while the real account's pending amount was also zero; whether this route distinguishes those cases is untested, so no answer from this tool may be read as saying that an account exists or that it does not. A call with no parameters at all was measured to answer HTTP 200 with a figure, so this tool refuses a call with no player rather than return a figure that describes nobody. This tool reports the figure the upstream returned and nothing else: it does not accumulate it, compare it with any DEC figure, or treat it as a balance.";
const LAND_STAKE_ASSETS_DESCRIPTION = "Read each worker’s Base Production, Base PP after cap, Terrain Boost, Boostable Production and Total Production in worker_view, alongside unchanged source cards and items. Display labels follow the public client; explicit unpowered rows display zero while missing values remain unknown. The cap preview allocates ordinary workers in ascending slot order, then adds Runi outside the cap; see splinterlands://land/rules/screen-fields for source and limits. List the cards and items staked to one land deed, as GET /land/stake/deeds/{deedUid}/assets returns them. A successful response has {status, data}, where data holds a cards array and an items array; a deed with nothing staked returns both arrays present and empty, which is a successful answer and not a failure. On this route the boost, production-point and work figures are JSON strings, not numbers, and this server returns them exactly as received: it does not convert, round, compare or combine them, and a change in that wire type would be reported as a malformed response rather than converted silently. The deed-details tool returns the equivalent deed-level figures as JSON numbers; the two routes disagree about wire type and this server does not reconcile them. Rows carry the staking account name as the upstream returns it. A deed uid the upstream rejects is answered with an HTTP error on this route and is reported as an upstream failure rather than as an empty result, so this tool and the deed-details tool do not behave alike on a bad deed uid. This tool adds only a same-response worker label view: it does not count free slots, does not infer whether a deed is powered, and makes no statement about cards the response does not list.";
const LAND_STAKE_DEED_DETAILS_DESCRIPTION = "Get the staking summary the upstream reports for one land deed, as GET /land/stake/deed/details/{deedUid} returns it. A successful response has {status, data}, where data is one flat record of the deed's staking flags, worker counts, boosts and totals. A deed with nothing staked returns that record fully present, with its numeric fields zero and its boolean flags false, so an empty answer on this route is a populated record rather than an absent one. On this route the boost and total figures are JSON numbers; the deed-assets tool returns the equivalent per-card figures as JSON strings. The two routes disagree about wire type, this server returns each exactly as received, and a change in that wire type would be reported as a malformed response rather than converted silently. The record carries a `manager` string as returned by the upstream; its role is not stated. A deed uid the upstream does not recognise was measured to return a successful response holding no record rather than an error, so an answer holding no record establishes neither that the deed exists nor that it does not: this server cannot tell it apart from a deed that exists and has no staking record. The one deed with nothing staked that this repository observed returned the zeroed record described above rather than no record, which is a single observation and not a rule. The deed-assets tool answers a rejected deed uid with an upstream error instead, so the two tools do not behave alike on a bad deed uid. This tool reports only what the record states: it does not compute free slots, does not derive which cards are staked, and does not treat a total as evidence about any individual card.";

const CARDS_GET_DETAILS_DESCRIPTION = "List the card-definition rows returned by GET /cards/get_details. The type query is a real upstream filter: type=Summoner returned 107 rows versus 1101 rows from the bare route. The bare upstream response measured about 1.17 MB, so this server refuses an unfiltered call before sending it because the response exceeds this server's 256 KB result bound and would otherwise be reduced to status alone with the data dropped. That refusal is this server's size-based choice from the measured response, not an upstream rule; provide type to make a filtered call. Each returned definition carries id, name, color, type, sub_type, rarity, drop_rate, per-level stats, abilities, editions, total_printed and distribution fields. The measured route carried no BCX, donor or account-attribution field. Successful filtered metadata responses are cached for 24 hours; provenance reports the route and the original fetch time. This tool reports the filtered rows returned and does not add per-instance ownership data.";
const CARDS_LORE_DESCRIPTION = "Get the lore object returned by GET /cards/lore for one card_detail_id. The measured successful response was a bare object with numeric card_detail_id and string text. Omitting card_detail_id returned HTTP 200 with an empty body and no JSON, so this tool requires card_detail_id before making the request. The measured response carried no BCX, donor or account-attribution field. Successful lore responses are cached for 24 hours; provenance reports the route and the original fetch time. This tool returns the lore object unchanged and does not derive card attributes from its text.";
const CARDS_SKINS_DESCRIPTION = "List the skin rows returned by GET /cards/skins. The measured public response was a bare array of 74 objects, each carrying card_detail_id, skin, total, remaining, cost, set_cost and set; the captured body was 8,893 bytes. The measured response carried no BCX, donor or account-attribution field. Successful metadata responses are cached for 24 hours; provenance reports the route and the original fetch time. This tool returns the rows unchanged and does not calculate availability or prices.";
const CARDS_PACK_DATA_WAX_DESCRIPTION = "List the pack metadata rows returned by GET /cards/pack_data_wax. The measured public response was a six-object bare array for ALPHA, BETA, ORB, UNTAMED, DICE and CHAOS, with symbol, template_id, max, minted and burned fields as JSON numbers. The measured response carried no BCX, donor or account-attribution field because it is WAX-bridge mint/burn metadata rather than per-card or per-owner data. Successful metadata responses are cached for 24 hours; provenance reports the route and the original fetch time. This tool returns the rows unchanged.";
const CARDS_HISTORY_DESCRIPTION = "List the transfer records returned by GET /cards/history for one per-instance card UID. id is a card UID, not a card_detail_id: numeric ids silently returned [], while a real UID returned transfer records. A returned record carries card_id, transfer_date, transfer_type, transfer_tx, from_player, to_player, card_detail_id, xp, gold, edition, payment_amount, payment_currency and combined_cards. from_player and to_player are account-attribution fields for the transfer, not donor provenance. Donor and BCX were absent in the measured response. This route is a per-instance event lookup, not a card-definition lookup or an enumeration of history for a numeric card_detail_id. The result is limited by this server's 100-row and 256 KB bounds and is not cached as static metadata.";
const CARDS_FIND_DESCRIPTION = "Look up per-instance card records through GET /cards/find. Supply ids as one comma-separated string of full per-instance card UIDs; real 2-ID and 3-ID requests returned exactly the requested UIDs in order. Repeated ids=, ids[]= and JSON-array encodings are not valid: repeated and bracketed parameters return an unable-to-parse error, while a JSON array is split as literal comma-separated text. A matched record carries player, uid, card_detail_id, xp, gold, edition, card_set, collection_power, market and rental fields, and the measured bcx and bcx_unbound fields. BCX is therefore promised for this per-instance route only; it is not a claim about definition routes. player is current-owner attribution, not donor provenance, and donor was absent in the measured record. This result is bounded by this server's 100-row and 256 KB limits and is not cached as static metadata.";
const CARDS_COLLECTION_DESCRIPTION = "Optional include_plot_references adds reported_stake_plot_reference with verified padded label, numeric ID and deed UID to returned cards using at most one account-scoped deed search (limit 200); the call then permits three logical GETs instead of two. Unresolved or conflicting references remain null with explicit status and separate freshness. This is not complete holdings discovery. Cooling cards have left their old plot; a retained reference is historical. The projected collection cache is reused when only this option changes, and plot references are read afresh. Joined metadata exposes normalized element and secondary_element, plus only the selected level’s land_abilities and land_abilities_status. Missing level entries are unknown, never an invented empty ability list; absent ability tables mean no Land abilities in that definition. Raw numeric land_dec_stake_needed is retained if present. The element filter matches either normalized element. For known edition-19 cards, land_lineup_estimate resolves its dated abilities itself; omit an explicit abilities override there. Other cards can use the returned ability tuples, subject to estimator-supported codes. Optional stake_start_date, stake_end_date and numeric stake_plot are retained when present. staking_status and staking_observed_at classify one capture as staked, unstaking, unstaked, pending or unknown; cached pages preserve that classification time. Missing dates are unknown, not unstaked. Local staked=yes selects active staking, staked=no selects explicitly unstaked cards (not cooling or pending), and staked=plot requires numeric stake_plot_id. Plot labels are not inferred from an unverified numeric reference. These filters make no extra request. Stream the projected collection returned by GET /cards/collection/{username}. The upstream response has exactly {player,cards[]} and no total, count, cursor, page token or other pagination field; no narrower query was available in the measured collection evidence. The route-size and memory measurements are recorded in `library/observations/collection-streaming-memory-2026-09-08.md`. The server never materialises the upstream body: it parses cards[] incrementally, skips unprojected fields, counts matching cards, and retains only the projected cards in the requested page, up to 100. Each emitted card contains uid, card_detail_id, edition, gold, foil, level, xp, bcx, collection_power and card_set. The source card object carried 56 fields; this projection keeps the ten core fields plus land_base_pp when present, and makes no byte-saving claim. In the upstream wire types, land_base_pp and last_buy_price are numeric-looking JSON strings, while bcx, xp, collection_power and level are real JSON numbers; land_base_pp is retained as its original decimal string and last_buy_price is not projected. A missing land_base_pp stays absent; an observed null stays null. Both mean unknown production and never pass a min_land_base_pp filter, including a zero threshold. Malformed or non-finite production strings are refused; the latter four fields are returned as numbers. Card definitions are joined by card_detail_id, adding name, color, secondary_color when present and sub_type. Color and subtype filters are case-insensitive exact matches; color matches either primary or secondary color. Unknown definitions retain the instance without invented fields, never match metadata filters, and are counted in definition_missing_count across the full scanned collection before filtering. The complete definition catalogue is fetched under the existing 2 MiB cap and projected into one 24-hour cache; only joined page fields are returned. This tool may use two logical GET requests (definitions plus collection). Definition failure stops before reading the collection. Definition refresh invalidates the joined page cache, and metadata freshness is separate. Local filters are color, sub_type, gold, edition, foil, card_set, min_level, min_collection_power and min_land_base_pp; cursor is a zero-based filtered-result offset and limit defaults to 100 with a maximum of 100. This server's heap-occupancy guard is 128 MiB: the highest observed production-path value was 90.71 MiB of unforced heapUsed; the occupancy backstop is wider because GC timing can vary, so it needs operational slack. Production normally has no --expose-gc, so heapUsed is high-water heap occupancy including uncollected garbage, not a retention bound. If global.gc is exposed, as it may be in a diagnostic/test process, the server calls it before sampling to reduce transient garbage. Retention was measured separately at about 9.4 MiB flat under forced GC and is verified by test, not at runtime. A separate 358 MiB RSS operational ceiling is based on the highest RSS observed across the measurement rounds: 286.4 MiB in the forced-GC diagnosis, higher than the 278.08 MiB RSS maximum of the final production-path runs. RSS is a separate process-occupancy backstop, not a retention bound, and includes memory outside the V8 heap and uncollected garbage. Neither runtime number bounds retention: both are occupancy guards at different scopes, while retention is verified by measurement, not enforced at runtime. Memory is sampled every 256 parsed cards, plus once at the end when needed; on the measured 51,799-card run that means at most 203 cadence samples, and a regression is detected within 256 parsed cards without a memory call on every card. The route uses a 90-second timeout chosen by this server behind the measured 41-second fetch; a timeout is attempted once and is not retried. The global 2 MB response cap is unchanged for every other route and is not raised for this exception. One successful page is cached for 60 seconds per username, retaining at most that page; cache reuse requires the same filter, cursor and limit request. A different page or filter is a cache miss, re-streams and re-parses the full collection, and replaces that username's cached page because the upstream has no pagination; the cached page re-streams after expiry. The fixture is deliberately trimmed to three cards with representative raw fields rather than the measured 155 MiB response; the fixture declares every concrete array index and is only a contract sample. No account name is embedded in this server source, and this server remains version 0.0.0 with no remote delivery path.";
const PLAYERS_ITEM_DETAILS_DESCRIPTION = "List the full item-type catalogue returned by GET /players/item_details. The measured public response contained 320 items and was about 134 KB, with id, name, type, nullable sub_type, data, transferable, consumable, inventory, nullable print_limit, total_printed, nullable image_filename, nullable icon_filename, nullable description, nullable rarity and stake_type_id. The id parameter is inert: the no-id response and id=1 response were byte-identical, so this tool does not advertise id as an item lookup filter. The measured response carried no BCX, donor or account-attribution field. Successful metadata responses are cached for 24 hours; provenance reports the route and the original fetch time. This server applies its general 100-row and 256 KB result bounds to the returned array; it does not claim that the bounded response is the full upstream catalogue.";
const PLAYER_PROFILE_DESCRIPTION = "Return one account's profile from GET /players/details. This route is ABSENT from the main host's published declaration and was found by probing; it answered publicly with no token, and its selector is name, not username. The captured response was about 4.7 KB and carried the account name, join date, ranked figures, collection power, league, a public guild record, a player_uuid and a season pass flag. Ranked figures appear per format: the wild figures are unprefixed, with modern_, survival_ and foundation_ fields alongside. player_avatar is a JSON-encoded string inside the JSON response and is returned as a string; this server does not parse it a second time. Four fields were null on the captured account, so no type is claimed for them. One account was captured, so which fields are always present is not established beyond the name.";
const PLAYER_CURRENT_REWARDS_DESCRIPTION = "Return the current season's glint totals for one account from GET /players/current_rewards. The measured public response carried a season_reward_info object with the season number and a glint figure per format. Some per-format glint fields were observed null on the captured account and carry no declared type; the wild and survival figures were observed as numbers. A missing figure is not evidence that the account earned nothing. One account and one season were captured; no claim is made about which formats carry a figure in general.";
const PLAYER_LAST_SEASON_REWARDS_DESCRIPTION = "Return the previous season's glint totals for one account from GET /players/last_season_rewards. The measured public response carried the same season_reward_info shape as the current-season route, with the season number and a glint figure per format. Three per-format glint fields were observed null on the captured account and carry no declared type; only the wild figure was observed as a number. A missing figure is not evidence that the account earned nothing. One account and one season were captured. This tool is a separate route from the current-season one and no equivalence between them was tested.";
const PLAYER_LAST_FOCUS_REWARDS_DESCRIPTION = "Return one account's last completed focus from GET /players/last_focus_rewards. The measured public response carried a quest_data object with an id, the account, creation date and block, a name, item counts, a reward quantity and claim details. quest_data.name carries a format such as wild; it does not name an account. quest_data.rewards is a JSON-encoded STRING inside the JSON response and is returned exactly as received; this server does not parse it. Two fields were null on the captured account, so no type is claimed for them. One account was captured.";
const PLAYER_UNCLAIMED_BALANCES_DESCRIPTION = "Return one account's unclaimed balances for one token from GET /players/unclaimed_balances. Both username and token_type are required: omitting token_type returns HTTP 200 carrying the message that player and token are required, which is an application error inside a success status rather than an HTTP failure. The measured response carried one row per reward type, each with the account, token, type, a string balance and a last-updated date, alongside a last_claim_date. On the captured account SPS returned rows while DEC and CREDITS returned an empty array, so an empty array means no unclaimed rows for that token, not an error. Only DEC, SPS and CREDITS were tried, so the accepted token_type set is not established.";
const PLAYER_UNCLAIMED_BALANCE_HISTORY_DESCRIPTION = "Return one account's unclaimed-balance history for one token from GET /players/unclaimed_balance_history. Both username and token_type are required, and omitting token_type returns HTTP 200 carrying the message that player and token are required rather than an HTTP failure. The response is a bare array; each row carried a reward action, an id, the account, token, type, a string amount, a block number, a transaction id, dates, a destination account and a status. On the captured account SPS returned rows while DEC returned an empty array. Only DEC and SPS were tried on this route. This server applies its general 100-row and 256 KB result bounds to the array and does not claim the bounded answer is the full upstream history.";
const CARDS_TRX_LOOKUP_DESCRIPTION = "Look up the transaction object returned by GET /cards/trx_lookup for a real trx_id. A bare call, card_detail_id alone and username alone returned the same HTTP-200 application error saying that trx_id was missing; a real trx_id returned a trx_info object with id, block_id, prev_block_id, type, player, data, success, error, block_num, created_date, result, steem_price and sbd_price. data and result are JSON-encoded strings inside the JSON response and are returned as strings; this server does not parse them a second time. player is transaction account attribution, not donor provenance. BCX and donor were absent in the measured response. This route is a single-transaction event lookup and is not cached as static metadata.";

function redactPlayer(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return body;
  }
  const envelope = body as Record<string, unknown>;
  if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data)) {
    return { ...envelope };
  }
  const { player: _player, ...data } = envelope.data as Record<string, unknown>;
  return { ...envelope, data };
}

/**
 * A successful answer that holds no record. The upstream body is passed through
 * unchanged; only the prose says, in words, that the record does not exist — so a
 * caller never has to read "no deed here" out of an empty envelope, and the tool
 * never claims the call failed.
 */
type RequestScope = Record<string, unknown>;
type SearchScope = "explicit-account" | "explicit-geography";

type ResultWithProvenance = {
  endpoint: string;
  traceId: string;
  freshness: Freshness;
};

function requestScope(params: Record<string, unknown>): RequestScope {
  return Object.fromEntries(Object.entries(params).map(([name, value]) => [
    name,
    ["player", "players", "username", "name"].includes(name) ? { supplied: value !== undefined } : value,
  ]));
}

function requestSearchScope(params: Record<string, unknown>): SearchScope | undefined {
  if (params.player !== undefined) return "explicit-account";
  if (params.tract_id !== undefined || params.region_number !== undefined) return "explicit-geography";
  return undefined;
}

function searchScopeRefusal() {
  return {
    isError: true,
    content: [{ type: "text" as const, text: SEARCH_SCOPE_REFUSAL_TEXT }],
  };
}

function decPlayerScopeRefusal() {
  return {
    isError: true,
    content: [{ type: "text" as const, text: DEC_PLAYER_SCOPE_REFUSAL_TEXT }],
  };
}

function decRegionScopeRefusal() {
  return {
    isError: true,
    content: [{ type: "text" as const, text: DEC_REGION_SCOPE_REFUSAL_TEXT }],
  };
}

function provenanceMeta(result: ResultWithProvenance, endpointTemplate: string, params: Record<string, unknown>, scope?: SearchScope) {
  return {
    provenance: {
      endpoint: endpointTemplate,
      traceId: result.traceId,
      freshness: result.freshness,
      requestScope: scope === undefined ? requestScope(params) : { ...requestScope(params), scope },
    },
  };
}

function emptyResult(body: unknown, text: string, result: ResultWithProvenance, endpointTemplate: string, params: Record<string, unknown>, limitationText?: string, scope?: SearchScope) {
  return {
    content: [{ type: "text" as const, text: limitationText === undefined ? text : `${text} ${limitationText}` }],
    structuredContent: body as Record<string, unknown>,
    _meta: provenanceMeta(result, endpointTemplate, params, scope),
  };
}

function outcomeResult(outcome: UpstreamOutcome, endpointTemplate: string, params: Record<string, unknown>, limitationText?: string, scope?: SearchScope) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: limitationText === undefined ? outcome.message : `${outcome.message} ${limitationText}` }],
    structuredContent: {
      kind: outcome.kind,
      endpoint: endpointTemplate,
      traceId: outcome.traceId,
      freshness: outcome.freshness,
      ...(outcome.status === undefined ? {} : { status: outcome.status }),
    },
    _meta: provenanceMeta(outcome, endpointTemplate, params, scope),
  };
}

type BoundedResult = {
  structuredContent: Record<string, unknown>;
  rowCount: number;
  truncated: boolean;
  oversizedRecord: boolean;
};

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedResult(body: Record<string, unknown>): BoundedResult {
  const data = body.data;
  if (!Array.isArray(data)) {
    if (utf8Bytes(body) <= MAX_RESULT_BYTES) {
      return { structuredContent: body, rowCount: 0, truncated: false, oversizedRecord: false };
    }
    const status = body.status;
    const structuredContent = status === undefined ? {} : { status };
    const isRecord = typeof data === "object" && data !== null;
    return { structuredContent, rowCount: 0, truncated: !isRecord, oversizedRecord: isRecord };
  }
  const rows = data;
  let rowCount = Math.min(rows.length, MAX_RESULT_ROWS);
  let structuredContent: Record<string, unknown> = {
    ...body,
    data: rows.slice(0, rowCount),
  };
  while (rowCount > 0 && utf8Bytes(structuredContent) > MAX_RESULT_BYTES) {
    rowCount -= 1;
    structuredContent = {
      ...body,
      data: rows.slice(0, rowCount),
    };
  }
  if (utf8Bytes(structuredContent) > MAX_RESULT_BYTES) {
    const status = body.status;
    structuredContent = status === undefined
      ? { data: [] }
      : { status, data: [] };
    rowCount = 0;
  }
  return {
    structuredContent,
    rowCount,
    truncated: rowCount < rows.length || utf8Bytes(body) > MAX_RESULT_BYTES,
    oversizedRecord: false,
  };
}

function resultText(result: BoundedResult, limitationText?: string, truncationText = TRUNCATION_TEXT): string {
  const text = result.oversizedRecord
    ? OVERSIZED_RECORD_TEXT
    : result.truncated
    ? truncationText.replace("{rows}", String(result.rowCount))
    : JSON.stringify(result.structuredContent);
  return limitationText === undefined ? text : `${text} ${limitationText}`;
}

type CachedMetadata = {
  route: string;
  fetchedAt: string;
  result: Extract<HttpResult<unknown>, { ok: true }>;
};

type CachedCollection = {
  requestKey: string;
  result: Extract<HttpResult<ProjectedCollection>, { ok: true }>;
};

const cardsCollectionInputSchema = z.object({
  username: z.string().min(1).refine((value) => value.trim().length > 0, "must not be empty"),
  limit: z.number().int().min(1).max(COLLECTION_PAGE_LIMIT).optional(),
  cursor: z.number().int().min(0).optional(),
  gold: z.boolean().optional(),
  edition: z.number().int().min(0).optional(),
  foil: z.number().int().min(0).optional(),
  card_set: z.string().min(1).optional(),
  min_level: z.number().int().min(1).optional(),
  min_collection_power: z.number().min(0).optional(),
  min_land_base_pp: z.number().finite().min(0).optional(),
  color: z.string().trim().min(1).optional(),
  element: z.enum(["fire", "water", "earth", "life", "death", "dragon", "neutral"]).optional(),
  sub_type: z.string().trim().min(1).optional(),
  staked: z.enum(["yes", "no", "plot"]).optional(),
  stake_plot_id: z.number().int().positive().optional(),
  include_plot_references: z.boolean().optional(),
}).strict();

type CardsCollectionParams = z.infer<typeof cardsCollectionInputSchema>;

export function collectionCardMatches(card: ProjectedCollectionCard, params: CardsCollectionParams): boolean {
  return (params.staked === undefined
      || (params.staked === "yes" && card.staking_status === "staked")
      || (params.staked === "no" && card.staking_status === "unstaked")
      || (params.staked === "plot" && card.staking_status === "staked" && card.stake_plot === params.stake_plot_id))
    && (params.gold === undefined || card.gold === params.gold)
    && (params.edition === undefined || card.edition === params.edition)
    && (params.foil === undefined || card.foil === params.foil)
    && (params.card_set === undefined || card.card_set === params.card_set)
    && (params.min_level === undefined || card.level >= params.min_level)
    && (params.min_collection_power === undefined || card.collection_power >= params.min_collection_power)
    && (params.color === undefined || [card.color, card.secondary_color].some((color) => typeof color === "string" && color.toLowerCase() === params.color!.toLowerCase()))
    && (params.element === undefined || card.element === params.element || card.secondary_element === params.element)
    && (params.sub_type === undefined || card.sub_type?.toLowerCase() === params.sub_type.toLowerCase())
    && (params.min_land_base_pp === undefined || (typeof card.land_base_pp === "string" && Number(card.land_base_pp) >= params.min_land_base_pp));
}

type BoundedArrayResult = {
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
};

function boundedArrayResult(rows: unknown[]): BoundedArrayResult {
  let rowCount = Math.min(rows.length, MAX_RESULT_ROWS);
  let selected = rows.slice(0, rowCount);
  while (rowCount > 0 && utf8Bytes(selected) > MAX_RESULT_BYTES) {
    rowCount -= 1;
    selected = rows.slice(0, rowCount);
  }
  return { rows: selected, rowCount, truncated: rowCount < rows.length || utf8Bytes(rows) > MAX_RESULT_BYTES };
}

function arrayResultText(result: BoundedArrayResult): string {
  return result.truncated
    ? TRUNCATION_TEXT.replace("{rows}", String(result.rowCount))
    : JSON.stringify(result.rows);
}

function metadataCacheKey(entryId: string, params: Record<string, unknown>): string {
  return JSON.stringify([entryId, Object.entries(params).sort(([left], [right]) => left.localeCompare(right))]);
}

async function executeCachedMetadata(
  cache: TtlCache<CachedMetadata>,
  now: () => number,
  entryId: string,
  params: Record<string, unknown>,
  bound: ReturnType<typeof bindRequest>,
  client: SplinterlandsHttpClient,
): Promise<HttpResult<unknown>> {
  const key = metadataCacheKey(entryId, params);
  const cached = cache.get(key);
  if (cached !== undefined) {
    const fetchedAt = Date.parse(cached.fetchedAt);
    return {
      ...cached.result,
      freshness: {
        retrievedAt: cached.fetchedAt,
        ageMs: Number.isFinite(fetchedAt) ? Math.max(0, now() - fetchedAt) : cached.result.freshness.ageMs,
      },
    };
  }
  const result = await bound.execute(client);
  if (result.ok) {
    cache.set(key, { route: bound.endpointTemplate, fetchedAt: result.freshness.retrievedAt, result }, CARD_DETAILS_TTL_MS);
  }
  return result;
}

/** Tool registration only — transport wiring remains in the executable entry point. */
export function createServer(clientOptions: ClientOptions = {}): McpServer {
  const server = new ScopedMcpServer({
    name: "splinterlands-mcp",
    version: "0.0.0",
  });
  const client = new SplinterlandsHttpClient(clientOptions);
  const renderAvatar = createAvatarRenderer(clientOptions.fetch);
  server.configurePlotReferences(client);
  registerLandRuleResources(server);
  registerHiveTools(server, client, new HermesHiveReader(clientOptions.fetch, clientOptions.timeoutMs));
  registerLineupEstimator(server);
  const now = clientOptions.now ?? Date.now;
  const metadataCache = new TtlCache<CachedMetadata>(now, 8);
  const collectionCache = new TtlCache<CachedCollection>(now, 64);
  const loadCardDefinitions = createCardDefinitionLoader(client, now);
  registerScenarioSnapshot(server, client, loadCardDefinitions, now);
  const landDeedByPlotInputSchema = inputSchemaFor(LAND_DEED_BY_PLOT_ENTRY_ID).extend({ plot_id: plotIdOrLabelSchema });
  const landDeedByUidInputSchema = inputSchemaFor(LAND_DEED_BY_UID_ENTRY_ID);
  const ownedInputSchema = inputSchemaFor(LAND_DEEDS_OWNED_ENTRY_ID);
  const searchInputSchema = inputSchemaFor(LAND_DEEDS_SEARCH_ENTRY_ID);
  const projectsActiveInputSchema = inputSchemaFor(LAND_PROJECTS_ACTIVE_ENTRY_ID);
  const projectsHistoryInputSchema = inputSchemaFor(LAND_PROJECTS_HISTORY_ENTRY_ID);
  const projectsCountInputSchema = inputSchemaFor(LAND_PROJECTS_COUNT_ENTRY_ID);
  const projectsRequirementsInputSchema = inputSchemaFor(LAND_PROJECTS_REQUIREMENTS_ENTRY_ID);
  const regionsCountsInputSchema = inputSchemaFor(LAND_REGIONS_COUNTS_ENTRY_ID);
  const tractsCountsInputSchema = inputSchemaFor(LAND_TRACTS_COUNTS_ENTRY_ID);
  const volumeInputSchema = inputSchemaFor(LAND_VOLUME_ENTRY_ID);
  const landResourcesOwnedInputSchema = inputSchemaFor(LAND_RESOURCES_OWNED_ENTRY_ID);
  const landResourcesRichlistInputSchema = inputSchemaFor(LAND_RESOURCES_RICHLIST_ENTRY_ID);
  const landResourcesLeaderboardsInputSchema = inputSchemaFor(LAND_RESOURCES_LEADERBOARDS_ENTRY_ID);
  const landResourcesTaxesInputSchema = inputSchemaFor(LAND_RESOURCES_TAXES_ENTRY_ID);
  const landResourcesProductionRegionHarvestableInputSchema = inputSchemaFor(LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_ENTRY_ID);
  const landResourcesBalancesHistoryInputSchema = inputSchemaFor(LAND_RESOURCES_BALANCES_HISTORY_ENTRY_ID);
  const landResourcesBalancesHistoryCountInputSchema = inputSchemaFor(LAND_RESOURCES_BALANCES_HISTORY_COUNT_ENTRY_ID);
  const landResourcesTitlesInputSchema = inputSchemaFor(LAND_RESOURCES_TITLES_ENTRY_ID);
  const landResourcesTitlesAssignedInputSchema = inputSchemaFor(LAND_RESOURCES_TITLES_ASSIGNED_ENTRY_ID);
  const landResourcesRewardactionsInputSchema = inputSchemaFor(LAND_RESOURCES_REWARDACTIONS_ENTRY_ID);
  const landResourcesRewardactionsCountInputSchema = inputSchemaFor(LAND_RESOURCES_REWARDACTIONS_COUNT_ENTRY_ID);
  const landResourcesHistoryInputSchema = inputSchemaFor(LAND_RESOURCES_HISTORY_ENTRY_ID);
  const landResourcesFragmentHistoryInputSchema = inputSchemaFor(LAND_RESOURCES_FRAGMENT_HISTORY_ENTRY_ID);
  const landStakeAssetsInputSchema = inputSchemaFor(LAND_STAKE_ASSETS_ENTRY_ID);
  const landStakeDeedDetailsInputSchema = inputSchemaFor(LAND_STAKE_DEED_DETAILS_ENTRY_ID);
  const landStakeDecOverallInputSchema = inputSchemaFor(LAND_STAKE_DEC_OVERALL_ENTRY_ID);
  const landStakeDecRegionInputSchema = inputSchemaFor(LAND_STAKE_DEC_REGION_ENTRY_ID);
  const landStakeDecStakedInputSchema = inputSchemaFor(LAND_STAKE_DEC_STAKED_ENTRY_ID);
  const landStakeEvpPendingClaimInputSchema = inputSchemaFor(LAND_STAKE_EVP_PENDING_CLAIM_ENTRY_ID);
  const landLiquidityPoolsInputSchema = inputSchemaFor(LAND_LIQUIDITY_POOLS_ENTRY_ID);
  const landLiquidityPoolByIdInputSchema = inputSchemaFor(LAND_LIQUIDITY_POOL_BY_ID_ENTRY_ID);
  const landLiquidityPoolBySymbolInputSchema = inputSchemaFor(LAND_LIQUIDITY_POOL_BY_SYMBOL_ENTRY_ID);
  const landResourcesLiquiditySwapsInputSchema = inputSchemaFor(LAND_RESOURCES_LIQUIDITY_SWAPS_ENTRY_ID);
  const landLiquidityAllrewardsInputSchema = inputSchemaFor(LAND_LIQUIDITY_ALLREWARDS_ENTRY_ID);
  const landLiquidityQuoteInputSchema = inputSchemaFor(LAND_LIQUIDITY_QUOTE_ENTRY_ID);
  const landLiquidityResourcesInputSchema = inputSchemaFor(LAND_LIQUIDITY_RESOURCES_ENTRY_ID);
  const landLiquidityRegionInputSchema = inputSchemaFor(LAND_LIQUIDITY_REGION_ENTRY_ID);
  const cardsFindInputSchema = inputSchemaFor(CARDS_FIND_ENTRY_ID);
  const cardsGetDetailsInputSchema = inputSchemaFor(CARDS_GET_DETAILS_ENTRY_ID);
  const cardsHistoryInputSchema = inputSchemaFor(CARDS_HISTORY_ENTRY_ID);
  const cardsLoreInputSchema = inputSchemaFor(CARDS_LORE_ENTRY_ID);
  const cardsPackDataWaxInputSchema = inputSchemaFor(CARDS_PACK_DATA_WAX_ENTRY_ID);
  const cardsSkinsInputSchema = inputSchemaFor(CARDS_SKINS_ENTRY_ID);
  const cardsTrxLookupInputSchema = inputSchemaFor(CARDS_TRX_LOOKUP_ENTRY_ID);
  const playersItemDetailsInputSchema = inputSchemaFor(PLAYERS_ITEM_DETAILS_ENTRY_ID);
  const playerProfileInputSchema = inputSchemaFor(PLAYER_PROFILE_ENTRY_ID).required({ name: true });
  const playerCurrentRewardsInputSchema = inputSchemaFor(PLAYER_CURRENT_REWARDS_ENTRY_ID);
  const playerLastSeasonRewardsInputSchema = inputSchemaFor(PLAYER_LAST_SEASON_REWARDS_ENTRY_ID);
  const playerLastFocusRewardsInputSchema = inputSchemaFor(PLAYER_LAST_FOCUS_REWARDS_ENTRY_ID);
  const playerUnclaimedBalancesInputSchema = inputSchemaFor(PLAYER_UNCLAIMED_BALANCES_ENTRY_ID);
  const playerUnclaimedBalanceHistoryInputSchema = inputSchemaFor(PLAYER_UNCLAIMED_BALANCE_HISTORY_ENTRY_ID);

  server.registerTool(
    "land_deed_by_plot",
    {
      description: "Get a public deed by numeric plot_id or a region-tract-plot display label, padded or unpadded (for example 001-02-001 or 1-2-1). A label uses an observed candidate ID and verifies the returned coordinates before returning a deed. Empty or mismatched label resolution is explicitly unverified, not proof that the location does not exist. Successful populated responses include plot_reference with numeric ID, padded label and deed UID. Makes one logical GET request.",
      inputSchema: landDeedByPlotInputSchema,
    },
    async (params) => {
      const coordinates = typeof params.plot_id === "string" ? parsePlotLabel(params.plot_id)! : undefined;
      const plotId = coordinates ? candidatePlotId(coordinates) : params.plot_id;
      const bound = bindRequest(LAND_DEED_BY_PLOT_ENTRY_ID, { plot_id: plotId });
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (coordinates && !matchesPlotLabel(result.data, coordinates)) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "The display label could not be verified against the returned deed coordinates. No deed is presented as a match, and this does not establish that the location is nonexistent. Try its numeric map plot ID or the deed UID lookup." }],
          structuredContent: { kind: "plot_resolution_unverified", requested_label: params.plot_id, candidate_plot_id: plotId },
          _meta: provenanceMeta(result, bound.endpointTemplate, params),
        };
      }
      const identity = plotIdentityFromResponse(result.data);
      const structuredContent = {
        ...redactPlayer(result.data) as Record<string, unknown>,
        ...(identity ? { plot_reference: identity } : {}),
      };
      if (isEmptyResult(result.data)) {
        return emptyResult(structuredContent, `Splinterlands holds no land deed for plot ${String(params.plot_id)}.`, result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(structuredContent);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_deed_by_uid",
    {
      description: "Get the public land-deed record for one deed uid.",
      inputSchema: landDeedByUidInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_DEED_BY_UID_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      const structuredContent = redactPlayer(result.data) as Record<string, unknown>;
      if (isEmptyResult(result.data)) {
        return emptyResult(structuredContent, `Splinterlands holds no land deed for deed uid ${String(params.deed_uid)}.`, result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(structuredContent);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_deeds_owned",
    {
      description: "Return the per-region plot counts reported for one account; the tool name is historical, and the response contains region rows rather than individual land records. A successful response has {status, data}, where data is an array of {count, uid} rows and uid is the region identifier. data: null was observed for an unrecognised account; behaviour for a known account with no land was not captured. Query probes limit=2 and offset=5 returned bodies byte-identical to the no-query response, so those tried values had no effect.",
      inputSchema: ownedInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_DEEDS_OWNED_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "Splinterlands returned no owned-region records for the supplied player. This response cannot distinguish an unrecognized account from an account with no land.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_deeds_search",
    {
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: searchInputSchema.shape,
    },
    async (params) => {
      const variantKey = params.orderBy === undefined ? "limited" : "ordered";
      const limitationText = variantKey === "limited" ? SEARCH_LIMITATION_TEXT : ORDERED_SEARCH_LIMITATION_TEXT;
      const scope = requestSearchScope(params);
      if (scope === undefined) {
        return searchScopeRefusal();
      }
      const bound = bindRequest(LAND_DEEDS_SEARCH_ENTRY_ID, params, variantKey);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params, SEARCH_PAGING_TEXT, scope);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream search returned no rows for this request.", result, bound.endpointTemplate, params, limitationText, scope);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded, limitationText) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params, scope),
      };
    },
  );

  server.registerTool(
    "land_projects_active",
    {
      description: "Get the land project record the upstream reports as active for one deed uid. A deed with no active project is a successful answer with no record, not a failure.",
      inputSchema: projectsActiveInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_PROJECTS_ACTIVE_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "This deed has no active land project.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_projects_history",
    {
      description: `List the land project records the upstream returns for one deed uid. ${HISTORY_LIMITATION_TEXT}`,
      inputSchema: projectsHistoryInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_PROJECTS_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no land project records for this deed.", result, bound.endpointTemplate, params, HISTORY_LIMITATION_TEXT);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded, HISTORY_LIMITATION_TEXT, HISTORY_TRUNCATION_TEXT) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_projects_count",
    {
      description: "Get the count of land project records the upstream reports for one deed uid. This is one call and returns the upstream's count only, not the records. Whether that count covers exactly the records the history tool returns has not been verified.",
      inputSchema: projectsCountInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_PROJECTS_COUNT_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_projects_requirements",
    {
      description: "List the work requirement rows the upstream reports for one deed uid. Some deeds return no rows at all. A row's projected hours and projected end are the upstream's own values, and they can be far in the future: this repository observed rows carrying a projected end roughly five thousand years ahead. This server does not interpret those values and does not treat them as a schedule.",
      inputSchema: projectsRequirementsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_PROJECTS_REQUIREMENTS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no work requirement rows for this deed.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_regions_counts",
    {
      description: "List the 150 region count rows returned by GET /land/regions/counts. The unscoped call returns {status: \"success\", data: []}, an empty list. When a player is named, the response still carries all 150 regions rather than only that player's regions. Each row contains region.uid, region.name, region.region_number, for_sale, owned, listed, min_price and dec_stake. owned and dec_stake are the named player's fields. An unknown name returned the 150-row shape with owned and dec_stake zero; behaviour for a known account with no holdings was not captured.",
      inputSchema: regionsCountsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_REGIONS_COUNTS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no region count rows for this request.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_tracts_counts",
    {
      description: "List the tract count rows returned by GET /land/tracts/counts. The unscoped call returns {status: \"success\", data: []}, an empty list. A captured named-player response returned 36 rows, one per (region, tract_number) combination for which the account holds a deed. Each row contains region.uid, region.name, region.region_number, tract_number, owned and listed; all six row fields were present and non-null in every captured row. Whether any field is player-wide or player-scoped beyond this captured row shape is unmeasured, so this description makes no further absence claim.",
      inputSchema: tractsCountsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_TRACTS_COUNTS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no tract count rows for this request.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_volume",
    {
      description: "Get the two land volume figures the upstream returns for GET /land/volume: a sum and a count. This route takes no parameters. Both figures are the upstream's own values. They were observed to change between two captures about an hour apart, and to decrease, so this server does not present them as a cumulative total. When this server observed the route, both figures were returned as JSON strings rather than numbers; that was true of every observation so far, not a guarantee about every response. This server passes the response through unchanged and does not convert, round or combine the figures, and a change in that wire type would be reported as a malformed response rather than converted silently. What the two figures measure, and over what period, is not stated by the response and is not claimed here.",
      inputSchema: volumeInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_VOLUME_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no volume figures.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_owned",
    {
      description: LAND_RESOURCES_OWNED_DESCRIPTION,
      inputSchema: landResourcesOwnedInputSchema.shape,
    },
    async (params) => {
      if (params.player === undefined || typeof params.resource !== "string") {
        return {
          isError: true,
          content: [{ type: "text" as const, text: LAND_RESOURCES_OWNED_SCOPE_REFUSAL_TEXT }],
        };
      }
      const bound = bindRequest(LAND_RESOURCES_OWNED_ENTRY_ID, {
        player: params.player,
        resource: params.resource.toUpperCase(),
      });
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no resource-holding rows for this account and resource.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_taxes",
    {
      description: LAND_RESOURCES_TAXES_DESCRIPTION,
      inputSchema: landResourcesTaxesInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_TAXES_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_richlist",
    {
      description: LAND_RESOURCES_RICHLIST_DESCRIPTION,
      inputSchema: landResourcesRichlistInputSchema.shape,
    },
    async (params) => {
      if (params.region === undefined || typeof params.resource !== "string") {
        return {
          isError: true,
          content: [{ type: "text" as const, text: LAND_RESOURCES_RICHLIST_SCOPE_REFUSAL_TEXT }],
        };
      }
      const bound = bindRequest(LAND_RESOURCES_RICHLIST_ENTRY_ID, {
        ...params,
        resource: params.resource.toUpperCase(),
      });
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no resource-richlist rows for this region and resource.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_leaderboards",
    {
      description: LAND_RESOURCES_LEADERBOARDS_DESCRIPTION,
      inputSchema: landResourcesLeaderboardsInputSchema.shape,
    },
    async (params) => {
      if (typeof params.resource !== "string" || (params.region === undefined && params.territory === undefined)) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: LAND_RESOURCES_LEADERBOARDS_SCOPE_REFUSAL_TEXT }],
        };
      }
      const bound = bindRequest(LAND_RESOURCES_LEADERBOARDS_ENTRY_ID, {
        ...params,
        resource: params.resource.toUpperCase(),
      });
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no resource-leaderboard rows for this scope.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_production_region_harvestable",
    {
      description: LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_DESCRIPTION,
      inputSchema: landResourcesProductionRegionHarvestableInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_PRODUCTION_REGION_HARVESTABLE_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no harvestable resource rows for this account and region.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_balances_history",
    {
      description: LAND_RESOURCES_BALANCES_HISTORY_DESCRIPTION,
      inputSchema: landResourcesBalancesHistoryInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_BALANCES_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no resource-balance history rows for this request.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_balances_history_count",
    {
      description: LAND_RESOURCES_BALANCES_HISTORY_COUNT_DESCRIPTION,
      inputSchema: landResourcesBalancesHistoryCountInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_BALANCES_HISTORY_COUNT_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_titles",
    {
      description: LAND_RESOURCES_TITLES_DESCRIPTION,
      inputSchema: landResourcesTitlesInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_TITLES_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no title rows for this player.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_titles_assigned",
    {
      description: LAND_RESOURCES_TITLES_ASSIGNED_DESCRIPTION,
      inputSchema: landResourcesTitlesAssignedInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_TITLES_ASSIGNED_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no title-assignment rows for this title.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_rewardactions",
    {
      description: LAND_RESOURCES_REWARDACTIONS_DESCRIPTION,
      inputSchema: landResourcesRewardactionsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_REWARDACTIONS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no reward-action rows for this deed.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_rewardactions_count",
    {
      description: LAND_RESOURCES_REWARDACTIONS_COUNT_DESCRIPTION,
      inputSchema: landResourcesRewardactionsCountInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_REWARDACTIONS_COUNT_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_history",
    {
      description: LAND_RESOURCES_HISTORY_DESCRIPTION,
      inputSchema: landResourcesHistoryInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no resource-history rows for this transaction.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_resources_fragment_history",
    {
      description: LAND_RESOURCES_FRAGMENT_HISTORY_DESCRIPTION,
      inputSchema: landResourcesFragmentHistoryInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_FRAGMENT_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no fragment-history rows for this transaction.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_dec_overall",
    {
      description: LAND_STAKE_DEC_OVERALL_DESCRIPTION,
      inputSchema: landStakeDecOverallInputSchema.shape,
    },
    async (params) => {
      if (params.player === undefined) {
        return decPlayerScopeRefusal();
      }
      const bound = bindRequest(LAND_STAKE_DEC_OVERALL_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no DEC staking figure for this account.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_dec_staked",
    {
      description: LAND_STAKE_DEC_STAKED_DESCRIPTION,
      inputSchema: landStakeDecStakedInputSchema.shape,
    },
    async (params) => {
      if (params.player === undefined) {
        return decPlayerScopeRefusal();
      }
      const bound = bindRequest(LAND_STAKE_DEC_STAKED_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no DEC staking rows for this account.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_dec_region",
    {
      description: LAND_STAKE_DEC_REGION_DESCRIPTION,
      inputSchema: landStakeDecRegionInputSchema.shape,
    },
    async (params) => {
      if (params.player === undefined || params.region_uid === undefined) {
        return decRegionScopeRefusal();
      }
      const bound = bindRequest(LAND_STAKE_DEC_REGION_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no DEC staking record for this account and region.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_evp_pending_claim",
    {
      description: LAND_STAKE_EVP_PENDING_CLAIM_DESCRIPTION,
      inputSchema: landStakeEvpPendingClaimInputSchema.shape,
    },
    async (params) => {
      if (params.player === undefined) {
        return decPlayerScopeRefusal();
      }
      const bound = bindRequest(LAND_STAKE_EVP_PENDING_CLAIM_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no pending EVP claim record for this account.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_assets",
    {
      description: LAND_STAKE_ASSETS_DESCRIPTION,
      inputSchema: landStakeAssetsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_STAKE_ASSETS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no staking record for this deed.", result, bound.endpointTemplate, params);
      }
      const data = (result.data as { data?: unknown }).data;
      if (typeof data === "object" && data !== null && !Array.isArray(data)
        && Array.isArray((data as { cards?: unknown }).cards)
        && Array.isArray((data as { items?: unknown }).items)
        && (data as { cards: unknown[]; items: unknown[] }).cards.length === 0
        && (data as { cards: unknown[]; items: unknown[] }).items.length === 0) {
        return emptyResult(result.data, "No cards or items are staked to this deed.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(withLandWorkerView(result.data as Record<string, unknown>));
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_stake_deed_details",
    {
      description: "Includes plot_view with the public overview PRODUCTION / HR value (Total PP times efficiency, or unscaled with Runi; zero when explicitly unpowered), plus separately labelled reference PP and resource-output values. Missing inputs remain unknown; raw response and provenance are preserved. " + LAND_STAKE_DEED_DETAILS_DESCRIPTION,
      inputSchema: landStakeDeedDetailsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_STAKE_DEED_DETAILS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) {
        return outcomeResult(result, bound.endpointTemplate, params);
      }
      if (isEmptyResult(result.data)) {
        return emptyResult(result.data, "The upstream returned no staking record for this deed.", result, bound.endpointTemplate, params);
      }
      const bounded = boundedResult(withLandPlotView(result.data as Record<string, unknown>));
      return {
        content: [{ type: "text" as const, text: resultText(bounded) }],
        structuredContent: bounded.structuredContent,
        _meta: provenanceMeta(result, bound.endpointTemplate, params),
      };
    },
  );

  server.registerTool(
    "land_liquidity_pools",
    {
      description: LAND_LIQUIDITY_POOLS_DESCRIPTION,
      inputSchema: landLiquidityPoolsInputSchema.shape,
    },
    async () => {
      const bound = bindRequest(LAND_LIQUIDITY_POOLS_ENTRY_ID, {});
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, {});
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity-pool rows.", result, bound.endpointTemplate, {});
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, {}) };
    },
  );

  server.registerTool(
    "land_liquidity_pool_by_id",
    {
      description: LAND_LIQUIDITY_POOL_BY_ID_DESCRIPTION,
      inputSchema: landLiquidityPoolByIdInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_LIQUIDITY_POOL_BY_ID_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity pool for this id.", result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "land_liquidity_pool_by_symbol",
    {
      description: LAND_LIQUIDITY_POOL_BY_SYMBOL_DESCRIPTION,
      inputSchema: landLiquidityPoolBySymbolInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_LIQUIDITY_POOL_BY_SYMBOL_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity pool for this symbol.", result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "land_resources_liquidity_swaps",
    {
      description: LAND_RESOURCES_LIQUIDITY_SWAPS_DESCRIPTION,
      inputSchema: landResourcesLiquiditySwapsInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_RESOURCES_LIQUIDITY_SWAPS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity-swap rows for this player.", result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "land_liquidity_allrewards",
    {
      description: LAND_LIQUIDITY_ALLREWARDS_DESCRIPTION,
      inputSchema: landLiquidityAllrewardsInputSchema.shape,
    },
    async () => {
      const bound = bindRequest(LAND_LIQUIDITY_ALLREWARDS_ENTRY_ID, {});
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, {});
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity reward totals.", result, bound.endpointTemplate, {});
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, {}) };
    },
  );

  server.registerTool(
    "land_liquidity_quote",
    {
      description: LAND_LIQUIDITY_QUOTE_DESCRIPTION,
      inputSchema: landLiquidityQuoteInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_LIQUIDITY_QUOTE_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "land_liquidity_resources",
    {
      description: LAND_LIQUIDITY_RESOURCES_DESCRIPTION,
      inputSchema: landLiquidityResourcesInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_LIQUIDITY_RESOURCES_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity resource rows for this player and token.", result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "land_liquidity_region",
    {
      description: LAND_LIQUIDITY_REGION_DESCRIPTION,
      inputSchema: landLiquidityRegionInputSchema.shape,
    },
    async (params) => {
      const bound = bindRequest(LAND_LIQUIDITY_REGION_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      if (isEmptyResult(result.data)) return emptyResult(result.data, "The upstream returned no liquidity region rows for this player.", result, bound.endpointTemplate, params);
      const bounded = boundedResult(result.data as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: resultText(bounded) }], structuredContent: bounded.structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_collection",
    { description: CARDS_COLLECTION_DESCRIPTION, inputSchema: cardsCollectionInputSchema },
    async (params) => {
      const collectionParams = params as CardsCollectionParams;
      if ((collectionParams.staked === "plot") !== (collectionParams.stake_plot_id !== undefined)) {
        return { isError: true, content: [{ type: "text" as const, text: "Use staked=plot together with stake_plot_id; the numeric plot selector is only accepted with that mode." }], structuredContent: { kind: "invalid_input" } };
      }
      const bound = bindRequest(CARDS_COLLECTION_ENTRY_ID, { username: collectionParams.username });
      const cacheKey = collectionParams.username;
      const definitions = await loadCardDefinitions();
      if (!definitions.ok) return outcomeResult(definitions, "/cards/get_details", {});
      const requestKey = JSON.stringify([{...collectionParams, include_plot_references:undefined}, definitions.traceId]);
      const cached = collectionCache.get(cacheKey);
      let collection: ProjectedCollection;
      let result: Extract<HttpResult<ProjectedCollection>, { ok: true }>;
      const cacheHit = cached !== undefined && cached.requestKey === requestKey;
      if (cached !== undefined && cached.requestKey === requestKey) {
        const fetchedAt = Date.parse(cached.result.freshness.retrievedAt);
        result = {
          ...cached.result,
          freshness: {
            retrievedAt: cached.result.freshness.retrievedAt,
            ageMs: Number.isFinite(fetchedAt) ? Math.max(0, now() - fetchedAt) : cached.result.freshness.ageMs,
          },
        };
        collection = result.data;
      } else {
        const stakingObservedAt = now();
        const streamed = await client.requestStreaming(bound.hostname, bound.path, {}, {
          endpointTemplate: bound.endpointTemplate,
          timeoutMs: COLLECTION_TIMEOUT_MS,
          consume: (response) => parseCardsCollection(response, {
            ...(collectionParams.cursor === undefined ? {} : { cursor: collectionParams.cursor }),
            ...(collectionParams.limit === undefined ? {} : { limit: collectionParams.limit }),
            enrich: (card) => withCollectionStaking(joinCardDefinition(card, definitions.data), stakingObservedAt),
            matches: (card) => collectionCardMatches(card, collectionParams),
          }),
        });
        if (!streamed.ok) return outcomeResult(streamed, bound.endpointTemplate, collectionParams);
        result = streamed;
        collection = streamed.data;
        collectionCache.set(cacheKey, { requestKey, result: streamed }, COLLECTION_CACHE_TTL_MS);
      }
      const cursor = collectionParams.cursor ?? 0;
      const plotReferences = collectionParams.include_plot_references
        ? await collectionPlotReferences(client,collectionParams.username,collection.cards) : undefined;
      let cards = plotReferences?.cards ?? collection.cards;
      let nextCursor = cursor + cards.length < collection.total ? cursor + cards.length : null;
      const structuredContent = {
        player: collection.player,
        cards,
        next_cursor: nextCursor,
        total: collection.total,
        definition_missing_count: collection.definition_missing_count,
        cache: cacheHit ? "hit" : "miss",
        ...(plotReferences ? {plot_references:plotReferences.metadata} : {}),
      };
      while (utf8Bytes(structuredContent) > MAX_RESULT_BYTES && cards.length > 0) {
        cards = cards.slice(0, -1);
        nextCursor = cursor + cards.length;
        structuredContent.cards = cards;
        structuredContent.next_cursor = nextCursor;
      }
      if (cards.length === 0 && collection.cards.length > 0) {
        return { isError: true, content: [{ type: "text" as const, text: OVERSIZED_RECORD_TEXT }] };
      }
      const cacheText = cacheHit
        ? "This page came from the 60-second page cache."
        : "Cache miss: the full collection was streamed and only this projected page was retained in the 60-second page cache.";
      const pagingText = nextCursor === null
        ? "There is no next cursor."
        : `Request cursor ${nextCursor} for the next page.`;
      return {
        content: [{ type: "text" as const, text: `${JSON.stringify(structuredContent)} ${cacheText} A different page or filter re-streams the full collection; after cache expiry, this page does too. ${pagingText}` }],
        structuredContent,
        _meta: { ...provenanceMeta(result, bound.endpointTemplate, collectionParams), card_definitions: {
          endpoint: "/cards/get_details", traceId: definitions.traceId,
          freshness: { retrievedAt: definitions.freshness.retrievedAt, ageMs: Math.max(0, now() - Date.parse(definitions.freshness.retrievedAt)) },
        } },
      };
    },
  );

  server.registerTool(
    "cards_get_details",
    { description: CARDS_GET_DETAILS_DESCRIPTION, inputSchema: cardsGetDetailsInputSchema.shape },
    async (params) => {
      if (params.type === undefined) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "This server refuses an unfiltered GET /cards/get_details call before sending it: the measured unfiltered response is about 1.17 MB, above this server's 256 KB result bound, so its data would be dropped. Supply type, such as Summoner. This is a server-side choice based on the measured size, not an upstream rule." }],
        };
      }
      const bound = bindRequest(CARDS_GET_DETAILS_ENTRY_ID, params);
      const result = await executeCachedMetadata(metadataCache, now, CARDS_GET_DETAILS_ENTRY_ID, params, bound, client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_lore",
    { description: CARDS_LORE_DESCRIPTION, inputSchema: cardsLoreInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_LORE_ENTRY_ID, params);
      const result = await executeCachedMetadata(metadataCache, now, CARDS_LORE_ENTRY_ID, params, bound, client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_skins",
    { description: CARDS_SKINS_DESCRIPTION, inputSchema: cardsSkinsInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_SKINS_ENTRY_ID, params);
      const result = await executeCachedMetadata(metadataCache, now, CARDS_SKINS_ENTRY_ID, params, bound, client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_pack_data_wax",
    { description: CARDS_PACK_DATA_WAX_DESCRIPTION, inputSchema: cardsPackDataWaxInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_PACK_DATA_WAX_ENTRY_ID, params);
      const result = await executeCachedMetadata(metadataCache, now, CARDS_PACK_DATA_WAX_ENTRY_ID, params, bound, client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_history",
    { description: CARDS_HISTORY_DESCRIPTION, inputSchema: cardsHistoryInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "cards_find",
    { description: CARDS_FIND_DESCRIPTION, inputSchema: cardsFindInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_FIND_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "players_item_details",
    { description: PLAYERS_ITEM_DETAILS_DESCRIPTION, inputSchema: playersItemDetailsInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYERS_ITEM_DETAILS_ENTRY_ID, params);
      const result = await executeCachedMetadata(metadataCache, now, PLAYERS_ITEM_DETAILS_ENTRY_ID, params, bound, client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "player_avatar",
    {
      description: "Resolve one player's legacy profile image link, which may be RUNI artwork and is not the avatar-builder character. Reads the official avatar endpoint once logically, inspects its HTTP 302 Location without following it, and returns avatar_url, image_url and redirect_status. Only HTTPS Splinterlands-domain image destinations are accepted. No image bytes are downloaded; the current image URL may change. A returned avatar does not prove the account exists. No credentials or game writes.",
      inputSchema: inputSchemaFor("api.players.avatar"),
    },
    async (params) => {
      const bound = bindRequest("api.players.avatar", params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_custom_avatar",
    {
      description: "Read the saved custom avatar-builder settings from the official player_avatar endpoint. Returns numeric level separately as data alongside appearance selections and badges. Set render=true to compose the official artwork layers into a PNG; metadata-only calls download no images. Rendered art excludes level text, badges and exemplar level frame/gem overlays. Level text must not be automatically added to artwork; any client level label is separate. Use this for the custom character, not the legacy RUNI/profile image redirect. No credentials or game writes.",
      inputSchema: inputSchemaFor("api.players.custom-avatar").extend({ render: z.boolean().optional().default(false) }),
    },
    async (params) => {
      const bound = bindRequest("api.players.custom-avatar", { name: params.name });
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      if (params.render) {
        try {
          const artwork = await renderAvatar(structuredContent);
          const data = { ...structuredContent, artwork: artwork.metadata };
          return { content: [{ type: "text" as const, text: JSON.stringify(data) },
            { type: "image" as const, data: artwork.png.toString("base64"), mimeType: "image/png" }],
          structuredContent: data, _meta: provenanceMeta(result, bound.endpointTemplate, { name: params.name }) };
        } catch (error) {
          const message = error instanceof AvatarArtworkError ? error.message : "Avatar rendering failed.";
          return { isError: true, content: [{ type: "text" as const, text: message }], structuredContent };
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_profile",
    { description: PLAYER_PROFILE_DESCRIPTION, inputSchema: playerProfileInputSchema },
    async (params) => {
      const bound = bindRequest(PLAYER_PROFILE_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_current_rewards",
    { description: PLAYER_CURRENT_REWARDS_DESCRIPTION, inputSchema: playerCurrentRewardsInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYER_CURRENT_REWARDS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_last_season_rewards",
    { description: PLAYER_LAST_SEASON_REWARDS_DESCRIPTION, inputSchema: playerLastSeasonRewardsInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYER_LAST_SEASON_REWARDS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_last_focus_rewards",
    { description: PLAYER_LAST_FOCUS_REWARDS_DESCRIPTION, inputSchema: playerLastFocusRewardsInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYER_LAST_FOCUS_REWARDS_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_unclaimed_balances",
    { description: PLAYER_UNCLAIMED_BALANCES_DESCRIPTION, inputSchema: playerUnclaimedBalancesInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYER_UNCLAIMED_BALANCES_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "player_unclaimed_balance_history",
    { description: PLAYER_UNCLAIMED_BALANCE_HISTORY_DESCRIPTION, inputSchema: playerUnclaimedBalanceHistoryInputSchema.shape },
    async (params) => {
      const bound = bindRequest(PLAYER_UNCLAIMED_BALANCE_HISTORY_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const bounded = boundedArrayResult(result.data as unknown[]);
      return { content: [{ type: "text" as const, text: arrayResultText(bounded) }], structuredContent: { data: bounded.rows }, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );
  server.registerTool(
    "cards_trx_lookup",
    { description: CARDS_TRX_LOOKUP_DESCRIPTION, inputSchema: cardsTrxLookupInputSchema.shape },
    async (params) => {
      const bound = bindRequest(CARDS_TRX_LOOKUP_ENTRY_ID, params);
      const result = await bound.execute(client);
      if (!result.ok) return outcomeResult(result, bound.endpointTemplate, params);
      const structuredContent = result.data as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent, _meta: provenanceMeta(result, bound.endpointTemplate, params) };
    },
  );

  server.registerTool(
    "list_endpoints",
    {
      description: "List every catalogued endpoint and the evidence-backed dimensions known about it. This tool is offline and makes no upstream request.",
      inputSchema: {},
    },
    async () => {
      const structuredContent = { ...listEndpoints(CALLABLE_ENDPOINT_IDS), additionalReadTools: { ...HIVE_TOOL_ROUTES, ...SCENARIO_TOOL_ROUTES } };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    "describe_endpoint",
    {
      description: "Describe one catalogued endpoint, its parameters, result contract, evidence dimensions, and provenance. This tool is offline and makes no upstream request.",
      inputSchema: {
        entryId: z.string().min(1),
      },
    },
    async ({ entryId }) => {
      try {
        const structuredContent = describeEndpoint(entryId, CALLABLE_ENDPOINT_IDS);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
          structuredContent,
        };
      } catch {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "The requested catalogue entry is not known." }],
        };
      }
    },
  );

  registerPlayerCompletion(server, client);
  registerInventory(server, client);
  registerRankings(server, client);
  registerMarket(server, client);
  registerBattles(server, client);
  registerTournaments(server, client);
  registerGuilds(server, client);
  registerGameMetadata(server, client, now);
  registerConflictsProposals(server, client);
  registerVapiMarket(server, client);
  registerRentals(server, client);
  registerDelegations(server, client);
  registerPowerCoreReads(server, client);
  registerCollector(server, client);

  return server;
}
