# splinterlands-mcp

Connect Codex, Claude Desktop, Claude Code, or another
[Model Context Protocol](https://modelcontextprotocol.io) (MCP) client to
[Splinterlands](https://splinterlands.com). Your assistant can then look up
public game data to answer questions about your Land, cards, account, and
transactions.

The server is read-only. It never asks for your private keys and cannot sign
transactions, spend funds, move cards, or change anything in your account.

Version `1.0.0` requires
a current Node.js 22 or 24 LTS patch release, with 22.13 as the minimum.

## Start here

After [installing the server](#install) and connecting your assistant, try
questions such as:

- Which workers are on this Land plot, and how much are they producing?
- Which cards in my collection are currently staked on Land?
- Show my custom avatar and tell me its level.
- What happened in this Hive transaction?
- How would replacing a worker affect this plot's production and food use?

Give the assistant the account name, plot, or transaction you want it to
inspect. It can use the available tools to gather the relevant facts and
explain the result.

## Land and worker comparisons

You can look up plots, workers, staking, DEC power, resources, projects, and
liquidity pools. Plot lookups accept the familiar region-tract-plot label,
such as `001-02-001`, as well as internal plot and deed identifiers.

For worker comparisons, the server can gather a plot's current setup and
calculate alternatives. Estimates account for supported terrain effects,
production caps, abilities, Runi, Power Cores, food use, and regional DEC
power. The current estimator covers Grain, Wood, Stone, and Iron worksites;
Castles, Keeps, SPS, and Research are outside its scope.

These are planning tools. A production estimate does not establish that a
card is available to stake or that the game will accept a proposed change.
The snapshot tool checks its starting figures against the game, and reports
missing information or disagreements rather than filling in guesses. Its
combined snapshot-and-estimate workflow has been verified on a populated
Grain plot; other setups still need an agreeing starting point.

## Cards, players, and markets

Collection tools can find cards by characteristics such as element, subtype,
Land power, and staking state. They can also attach verified plot references
where available. A card in cooldown may still refer to its former plot, so
that reference is not proof that it is working there now.

Account tools cover public profiles, balances, rewards, quests, skins,
delegations, and other game records. Market tools provide sale and rental
listings, prices, activity, and status. There are also reads for battles,
tournaments, guilds, conflicts, proposals, and rankings.

For avatars, ask for the custom avatar-builder character. The server can
compose its artwork and report the level separately, without drawing the
level onto the image. The legacy profile-image tool is different and may
return RUNI artwork.

## Transactions and game rules

The Hive tools can look up a signed transaction, inspect its operations, and
compare it with Splinterlands' record of what happened. They can also search
a limited window of an account's Hive history. A transaction appearing on
the blockchain does not, by itself, prove that every game operation
succeeded.

The server includes reference information for Land production rules and
Hive transaction limits. Each reference states its sources and scope.
These references help explain results; they do not replace checks against
current game data.

## Understanding the results

Some Splinterlands endpoints return only part of a list, ignore paging
parameters, or return different kinds of empty responses. The server
reports those limits. A short result is not automatically your entire
collection, history, or ranking, and an empty response is not proof that
an asset or account does not exist.

Requests have time, size, and rate limits to keep reads manageable. Some
results are cached, and their freshness is reported. Related reads can
also happen at slightly different times, so they should not be treated
as one perfectly synchronized view of the game.

The reference below lists all 164 tools. For request budgets, exact
parameters, cache behavior, and recorded API quirks, see the
[technical capability notes](library/capability-notes.md) and
[safety boundaries](#what-it-is-and-what-it-will-never-do).

## Tools and upstream routes

This table is the complete registration-to-route mapping in `src/server.ts`,
matched to `pathTemplate` in `src/catalogue/catalogue.json`. The two knowledge
tools are local and make no upstream request.

| Tool | Upstream route |
| --- | --- |
| `vapi_market_player_asset_detail_stats` | `GET /market/player/asset-detail-stats` |
| `vapi_market_player_all_listings` | `GET /market/player/all_listings` |
| `vapi_market_player_listings` | `GET /market/player/listings` |
| `vapi_market_player_activity` | `GET /market/player/activity` |
| `player_inventory` | `GET /players/inventory` |
| `battle_queue` | `GET /battle/battle_queue` |
| `battle_result` | `GET /battle/result` |
| `battle_status` | `GET /battle/status` |
| `cards_collection` | `GET /cards/collection/{username}` |
| `cards_find` | `GET /cards/find` |
| `cards_get_details` | `GET /cards/get_details` |
| `cards_history` | `GET /cards/history` |
| `cards_lore` | `GET /cards/lore` |
| `cards_pack_data_wax` | `GET /cards/pack_data_wax` |
| `cards_skins` | `GET /cards/skins` |
| `prices_current` | `GET /prices` |
| `cards_trx_lookup` | `GET /cards/trx_lookup` |
| `collector_stickers_tradeable` | `GET /collector/{player}/stickers/tradeable` |
| `collector_config` | `GET /collector/config` |
| `collector_player` | `GET /collector/{player}` |
| `collector_binder` | `GET /collector/{player}/{binderRef}` |
| `collector_stickers` | `GET /collector/{player}/stickers/all` |
| `conflict_airdrop_distribution` | `GET /conflicts/airdrop_distribution` |
| `conflict_eligible_cards` | `GET /conflicts/wagon_eligible_cards` |
| `conflict_leaderboard` | `GET /conflicts/leaderboard` |
| `conflict_player_rank` | `GET /conflicts/leaderboard_with_player` |
| `conflict_players` | `GET /conflicts/players` |
| `conflict_seasons` | `GET /conflicts/seasons` |
| `conflict_status` | `GET /conflicts/status` |
| `conflict_wagon` | `GET /conflicts/wagon` |
| `describe_endpoint` | Offline; reads the local endpoint catalogue |
| `game_last_block` | `GET /last_block` |
| `game_maintenance` | `GET /maintenance_schedule` |
| `game_settings` | `GET /settings` |
| `game_vapi_health` | `GET /` |
| `guild_brawl_records` | `GET /guilds/brawl_records` |
| `guild_brawl_sps_rewards` | `GET /guilds/brawl_sps_rewards` |
| `guild_contributions` | `GET /guilds/contributions` |
| `guild_find` | `GET /guilds/find` |
| `guild_list` | `GET /guilds/list` |
| `guild_members` | `GET /guilds/members` |
| `land_deed_by_plot` | `GET /land/deeds/{plot_id}` |
| `land_deed_by_uid` | `GET /land/deeds/details/{deed_uid}` |
| `land_deeds_owned` | `GET /land/deeds/owned/{player}` |
| `land_deeds_search` | `GET /land/deeds` |
| `land_liquidity_allrewards` | `GET /land/liquidity/allrewards` |
| `land_liquidity_pool_by_id` | `GET /land/liquidity/pools/{id}` |
| `land_liquidity_pool_by_symbol` | `GET /land/liquidity/poolsbysymbol/{symbol}` |
| `land_liquidity_pools` | `GET /land/liquidity/pools` |
| `land_liquidity_quote` | `GET /land/liquidity/quote/{poolId}` |
| `land_liquidity_region` | `GET /land/liquidity/region/{player}` |
| `land_liquidity_resources` | `GET /land/liquidity/resources/{player}/{token}` |
| `land_projects_active` | `GET /land/projects/deed/{deed_uid}/active` |
| `land_projects_count` | `GET /land/projects/deed/{deed_uid}/list/count` |
| `land_projects_history` | `GET /land/projects/deed/{deed_uid}/list` |
| `land_projects_requirements` | `GET /land/projects/deed/{deed_uid}/requirements` |
| `land_regions_counts` | `GET /land/regions/counts` |
| `land_resources_balances_history_count` | `GET /land/resources/balances/history/{player}/count` |
| `land_resources_balances_history` | `GET /land/resources/balances/history/{player}` |
| `land_resources_fragment_history` | `GET /land/resources/fragment_history/{trx_id}` |
| `land_resources_history` | `GET /land/resources/history/{trx_id}` |
| `land_resources_leaderboards` | `GET /land/resources/leaderboards` |
| `land_resources_liquidity_swaps` | `GET /land/resources/liquidity/swaps/{player}` |
| `land_resources_owned` | `GET /land/resources/owned` |
| `land_resources_production_region_harvestable` | `GET /land/resources/production/region/harvestable` |
| `land_resources_rewardactions_count` | `GET /land/resources/rewardactions/{deedUID}/count` |
| `land_resources_rewardactions` | `GET /land/resources/rewardactions/{deedUID}` |
| `land_resources_richlist` | `GET /land/resources/richlist` |
| `land_resources_taxes` | `GET /land/resources/taxes/{deedUID}` |
| `land_resources_titles_assigned` | `GET /land/resources/titles/assigned` |
| `land_resources_titles` | `GET /land/resources/titles` |
| `land_power_core_available` | `GET /land/stake/items/{stakeTypeUid}/available` |
| `land_power_core_grouped` | `GET /land/stake/items/{stakeTypeUid}/grouped` |
| `land_stake_assets` | `GET /land/stake/deeds/{deedUid}/assets` |
| `land_stake_dec_overall` | `GET /land/stake/dec/overall` |
| `land_stake_dec_region` | `GET /land/stake/dec/region` |
| `land_stake_dec_staked` | `GET /land/stake/decstaked` |
| `land_stake_deed_details` | `GET /land/stake/deed/details/{deedUid}` |
| `land_stake_evp_pending_claim` | `GET /land/stake/evp/pending-claim` |
| `land_tracts_counts` | `GET /land/tracts/counts` |
| `land_volume` | `GET /land/volume` |
| `land_lineup_snapshot` | Bounded compound GETs; at most ten logical requests |
| `land_lineup_estimate` | Offline; calculates a supplied Land lineup |
| `hive_account_history` | Read-only RPC: condenser_api.get_account_history |
| `hive_transaction` | Read-only RPC: condenser_api.get_transaction |
| `transaction_inspect` | Read-only Hive transaction RPC + GET /transactions/lookup |
| `list_endpoints` | Offline; reads the local endpoint catalogue |
| `market_active_rentals` | `GET /market/active_rentals` |
| `market_active_status` | `GET /market/active_status` |
| `market_completed_status` | `GET /market/completed_status` |
| `market_for_rent_grouped` | `GET /market/for_rent_grouped` |
| `market_for_sale_grouped` | `GET /market/for_sale_grouped` |
| `market_for_sale_packages` | `GET /market/for_sale_packages` |
| `market_history` | `GET /market/history` |
| `market_query_by_card` | `GET /market/market_query_by_card` |
| `market_query_grouped` | `GET /market/market_query_grouped` |
| `market_rental_history` | `GET /market/rental_history` |
| `market_status` | `GET /market/status` |
| `market_volume` | `GET /market/volume` |
| `player_archived_balances` | `GET /players/archived_balances` |
| `player_authorities` | `GET /players/authorities` |
| `player_balances` | `GET /players/balances` |
| `player_burn_event_full_leaderboard` | `GET /players/burn_event_full_leaderboard` |
| `player_burn_event_leaderboard` | `GET /players/burn_event_leaderboard` |
| `player_card_airdrop` | `GET /players/card_airdrop` |
| `player_current_rewards` | `GET /players/current_rewards` |
| `player_dec` | `GET /players/dec` |
| `player_energy_purchase_information` | `GET /players/energy_purchase_information` |
| `player_last_focus_rewards` | `GET /players/last_focus_rewards` |
| `player_last_season_rewards` | `GET /players/last_season_rewards` |
| `player_leaderboard_with_player` | `GET /players/leaderboard_with_player` |
| `player_leaderboard` | `GET /players/leaderboard` |
| `player_lp_claim_history` | `GET /players/lp_claim_history` |
| `player_pack_purchases` | `GET /players/pack_purchases` |
| `player_presale_leaders` | `GET /players/rebellion_presale_leaders` |
| `player_avatar` | `GET /players/avatar/{name}` |
| `player_custom_avatar` | `GET /players/player_avatar/{name}` |
| `player_profile` | `GET /players/details` |
| `player_quests` | `GET /players/quests` |
| `player_recent_teams` | `GET /players/recent_teams` |
| `player_reward_delegation_history` | `GET /players/reward_delegation_history` |
| `player_reward_delegations` | `GET /players/reward_delegations` |
| `player_richlist_ranking` | `GET /players/richlist_ranking` |
| `player_richlist` | `GET /players/richlist` |
| `player_season` | `GET /season` |
| `player_skins` | `GET /players/skins` |
| `player_unclaimed_balance_history` | `GET /players/unclaimed_balance_history` |
| `player_unclaimed_balances` | `GET /players/unclaimed_balances` |
| `player_voucher` | `GET /players/voucher` |
| `players_item_details` | `GET /players/item_details` |
| `proposal_list` | `GET /proposals/` |
| `proposal_pending_count` | `GET /proposals/pending_proposal_count` |
| `proposal_votes` | `GET /proposals/votes` |
| `purchase_settings` | `GET /purchases/settings` |
| `purchase_stats` | `GET /purchases/stats` |
| `purchase_uniswap_reward` | `GET /purchases/check_uniswap_reward` |
| `rental_bids_lowest_price` | `GET /delegation-rental/v3/bids/lowest-price` |
| `rental_bids` | `GET /delegation-rental/v3/bids` |
| `rentals_by_player` | `GET /delegation-rental/rentals/player/{player}` |
| `rentals_by_bid` | `GET /delegation-rental/rentals/bid/{bid}` |
| `rental_offers_lowest_price` | `GET /delegation-rental/v3/offers/lowest-price` |
| `rental_offers_by_player` | `GET /delegation-rental/v3/offers/player/{player}` |
| `rental_bids_by_player` | `GET /delegation-rental/v3/bids/player/{player}` |
| `rentals_v3_by_player` | `GET /delegation-rental/v3/rentals/player/{player}` |
| `rentals_v3_by_role` | `GET /delegation-rental/v3/rentals/player/{player}/{role}` |
| `delegations_outgoing` | `GET /delegation/outgoing/{player}` |
| `delegations_incoming` | `GET /delegation/incoming/{player}` |
| `delegation_to_target` | `GET /delegation/delegation/{player}/{target}` |
| `rental_offers` | `GET /delegation-rental/v3/offers` |
| `tournament_battles` | `GET /tournaments/battles` |
| `tournament_cancelled` | `GET /tournaments/cancelled` |
| `tournament_completed` | `GET /tournaments/completed` |
| `tournament_find_brawl` | `GET /tournaments/find_brawl` |
| `tournament_find` | `GET /tournaments/find` |
| `tournament_in_progress` | `GET /tournaments/in_progress` |
| `tournament_mine` | `GET /tournaments/mine` |
| `tournament_prizes` | `GET /tournaments/prizes` |
| `tournament_upcoming_official` | `GET /tournaments/upcoming_official` |
| `tournament_upcoming` | `GET /tournaments/upcoming` |
| `transaction_lookup` | `GET /transactions/lookup` |
| `transaction_metrics` | `GET /transactions/metrics` |
| `vapi_market_asset_metadata` | `GET /market/meta/asset/{assetName}` |
| `vapi_market_estimated_price` | `GET /market/estimated-price` |
| `vapi_market_landing` | `GET /market/landing` |

## Worked example

Question: “Show me `<ACCOUNT_NAME>`’s land plots, and which of them are
producing the most.” This is a two-call example.

1. Call `land_deeds_owned` with `player: "<ACCOUNT_NAME>"`. Its response gives
   the account’s per-region plot counts.
2. Call `land_deeds_search` with `player: "<ACCOUNT_NAME>"` and a suitable
   `limit`. Its limited response contains `deeds`, `worksite_details`, and
   `staking_details` arrays. Join rows from all three arrays on their shared
   `deed_uid`; rank the deeds by `staking_details[].total_work_per_hour`.

The second response is bounded by a 256 KB serialized-result limit. If it is
too large, request a smaller `limit`; the server does not return partial data.
In the recorded probes, `offset=0` returned zero rows and `offset=5` returned
the first four rows of the omitted-offset response; no offset value tried
reached later rows. This ranks the returned page, not necessarily every plot
counted by the first call.

## What it is, and what it will never do

- **Read-only.** Catalogue endpoint tools wrap `GET` requests. The isolated Hive reader permits only two read-only JSON-RPC methods over POST. The two
  knowledge tools make no upstream request. Nothing in this server issues a
  write.
- **No keys, ever.** This server never asks for, stores, or transmits a
  Splinterlands account credential, a Hive posting/active key, or any other
  secret. If you need an endpoint that requires login, this is the wrong
  tool for that endpoint — it will tell you so rather than pretend to work.
- **Unsupported catalogue routes are excluded.** 34 of the 191 catalogued
  routes are not advertised as tools because their dated probes did not
  produce a usable, distinct, or honestly-selected response. The first group contains three Land routes classified 2026-09-07
  and six market, rental and collector routes classified 2026-09-12:

  | Upstream route | Why it is unsupported | Classified |
  | --- | --- | --- |
  | `GET /collector/{player}/stickers/for_sale` | Empty lists from two featured accounts; populated sale-list contract remains unverified. | 2026-09-13 |
  | `GET /collector/me` | Official specification explicitly requires authentication; not called. | 2026-09-12 |
  | `GET /collector/me/stickers` | Official specification explicitly requires authentication; not called. | 2026-09-12 |
  | `GET /collector/me/binders/{binderId}` | Official specification explicitly requires authentication; not called. | 2026-09-12 |
  | `GET /delegation-rental/v3/offers/pending/{player}` | Three public participants returned empty lists; populated pending-offer shape remains unverified. | 2026-09-13 |
  | `GET /delegation-rental/bids` | Two bounded anonymous reads timed out after 20 seconds; no usable body or auth determination. Distinct from working V3 bids. | 2026-09-12 |
  | `GET /market/debug/listing` | Diagnostic debug route outside public game-data scope; not called. | 2026-09-12 |
  | `GET /market/debug/listing-item` | Diagnostic debug route outside public game-data scope; not called. | 2026-09-12 |
  | `GET /land/deeds/details/id/{plotId}` | Probed with a real plot id, a real item id, and an implausible id; every request returned an empty success envelope rather than a deed record. | 2026-09-07 |
  | `GET /land/stake/cards/{stakeTypeUid}/available` | Across the tested query shapes, every request returned no usable rows or populated response; the route has never been observed to provide an availability result. | 2026-09-07 |
  | `GET /land/stake/cards/{stakeTypeUid}/grouped` | Across the tested query shapes, every request returned no usable rows or populated response; the route has never been observed to provide a grouped result. | 2026-09-07 |

  A further ten were classified 2026-09-08, across five distinct hazard kinds
  — gated, evidenced non-functional, functional-but-redundant, fabricates a
  plausible answer, and a parameter whose name misdescribes what it selects:

  | Upstream route | Why it is unsupported | Classified |
  | --- | --- | --- |
  | `GET /land/resources/production/overview` | Called without credentials as part of ~17 paced requests; every call returned HTTP 401. Gated. | 2026-09-08 |
  | `GET /land/resources/production/region/overview` | Called without credentials as part of ~17 paced requests; every call returned HTTP 401. Gated. | 2026-09-08 |
  | `GET /land/resources/balances/history/{player}/{regionuid}` | Called with real region uids, a numeric region number, and garbage inputs; every input returned HTTP 500, including real region uids. | 2026-09-08 |
  | `GET /land/resources/balances/history/{player}/{regionuid}/count` | Called with real region uids and invalid inputs; every input returned HTTP 500, including real region uids. | 2026-09-08 |
  | `GET /land/liquidity/landpools` | Pure duplicate of the land-resource subset of `GET /land/liquidity/pools`; its rows are byte-identical to rows already returned by `land_liquidity_pools`. | 2026-09-08 |
  | `GET /land/liquidity/voucherpool` | Pure duplicate of the voucher/SPS subset of `GET /land/liquidity/pools`; its rows are byte-identical to rows already returned by `land_liquidity_pools`. | 2026-09-08 |
  | `GET /land/resources/titles/assigned/{player}` | Functional but redundant: returns the same title, player, and created_date data as `GET /land/resources/titles?player=`, which is covered by `land_resources_titles` and enforces a better parameter contract. | 2026-09-08 |
  | `GET /land/resources/liquidity/history/swaps/{pool}/{player}` | Duplicates `land_resources_liquidity_swaps`, but its `days` parameter is inert — every tested value (including omitted, 0, negative, and non-numeric) returned the identical 682-row set. | 2026-09-08 |
   | `GET /land/liquidity/pools/{player}/{token}` | Fabricates content rather than being gated, broken, or redundant: a garbage player and garbage token are silently accepted and echoed into a synthesised `VESTING-{token}` entry with `balance: null`, indistinguishable from a genuine no-position response. | 2026-09-08 |
   | `GET /land/liquidity/pool/rewards/{token}/{poolId}` | The `{poolId}` path parameter's name misdescribes what it selects: it is matched against an individual reward-record id, not `liquidity_pool_id` — `DEC/69` returned a row whose actual pool was 1. A tool built around "this pool's rewards" would misrepresent every answer. | 2026-09-08 |
   | `GET /cards/stats` | The upstream returned a functional 481 KB array with no filter, so it cannot pass through this server's 256 KB result bound. This is a distinct server-bound classification, not an upstream failure or one of the five semantic hazard kinds above. | 2026-09-08 |

  Full evidence for the 2026-09-08 batch is in the generated catalogue
  (`src/catalogue/catalogue.json`, `notes` field per entry) and in
  `library/decisions.md`.
  These player routes are excluded based on the dated observations above:

  | Upstream route | Why it is unsupported | Classified |
  | --- | --- | --- |
  | `GET /players/history` | Unauthenticated probes returned HTTP 401. | 2026-09-09 |
  | `GET /players/balance_history` | Unauthenticated probes returned HTTP 401. | 2026-09-09 |
  | `GET /players/referral_payments` | All probed accounts returned zero rows; no populated response or paging behaviour was established. | 2026-09-09 |
  | `GET /players/referral_users` | All probed accounts returned zero rows; no populated response or paging behaviour was established. | 2026-09-09 |
  | `GET /battle/history` | Unauthenticated read returned HTTP 401. | 2026-09-12 |
  | `GET /battle/history2` | Unauthenticated read returned HTTP 401. | 2026-09-12 |
  | `GET /battle/battle_teams_info` | Unauthenticated read returned HTTP 401. | 2026-09-12 |
  | `GET /battle/submit_ptr` | Submission operation; never called or exposed by this read-only server. | 2026-09-12 |
  | `GET /tournaments/frays` | HTTP 200 contained a nested authentication error in frays; public counts do not establish an accessible roster. | 2026-09-12 |
  | `GET /tournaments/crown_pot` | Captured brawl status was ineligible; no successful crown-pot contract established. | 2026-09-12 |
  | `GET /purchases/status` | Only empty objects captured; no verified populated receipt contract or purchase ID. | 2026-09-12 |
  | `GET /players/inventory` | A measured response was about 986 KB, above this server's 256 KB result bound. | 2026-09-09 |
  | `GET /players/details_by_id` | A genuine numeric player id was not available in the profile response, so a successful lookup was not established. | 2026-09-09 |

- **No design hook for authentication.** There is no config field, no
  commented-out branch, and no environment variable this server reads to
  attach credentials to a request. Adding one is out of scope for this
  project, by design.

## Install

This package is not published to npm. From a checkout, use a current Node.js
22 or 24 LTS patch release (minimum 22.13), install dependencies, and build the executable:

```bash
npm ci
npm run build
```

## Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "splinterlands": {
      "command": "node",
      "args": ["<checkout>/dist/index.js"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add splinterlands -- node "<checkout>/dist/index.js"
```

## Safety toward Splinterlands' servers

The transport follows Splinterlands' [official API specification](https://api.splinterlands.com/)
and [vapi specification](https://vapi.splinterlands.com/). These defaults
apply process-wide, separately for each approved API host (`api.splinterlands.com`,
`vapi.splinterlands.com`, and `prices.splinterlands.com`):

| Control | Default |
| --- | --- |
| Request rate | 2 requests/second, burst 4; `SPLINTERLANDS_MCP_RATE` is capped at 5/second |
| Concurrent requests | 2 in flight per host |
| Timeout | 20 seconds |
| Retries | 3 total attempts for 408, 429, 500, 502, 503, and 504 only |
| Retry backoff | Exponential with jitter, starting at 1 second and capped at 8 seconds |
| Circuit breaker | 5 consecutive failures; open for 60 seconds |
| Response cap | 2 MB, streamed |
| Per-call budget | 1 logical upstream request; retries of that request are allowed |
| Cache | In-memory only; settings use a one-hour success cache, card details a 24-hour metadata cache, prices a five-minute success cache, collection pages a 60-second projected-page cache, and the auth tier a 15-minute cache |
| Access changes | 401 is cached for 15 minutes; 403 stops traffic across all approved hosts for 60 seconds |

Catalogue requests are HTTPS `GET`s to the three approved Splinterlands hosts, with redirects refused and URL
credentials rejected. The avatar route reads the `Location` header and never follows it. Responses include a trace ID and retrieval freshness.
Empty, malformed, upstream-error, gated, blocked, and temporarily unavailable responses remain
separate outcomes so a tool can explain what happened without making claims
about the account.

## Maintenance posture

Nightly response checks, weekly specification comparisons and monthly fixture renewal are implemented. The four account-role secrets and complete request recipes have offline validation commands in the maintenance runbook. Hosted CI and bounded nightly, weekly, and monthly maintenance checks were verified for 1.0.0. Workflow configuration and current run status are visible in the repository Actions tab.

- Run npm run drift:check with approved MCP_DRIFT_INPUTS to compare bounded endpoint reads. Changes update endpoint-specific issues; two blocked endpoints stop the sweep and produce one runner-blocked issue.
- Run npm run drift:spec to compare both official API specifications without GitHub writes. The hosted job prepares specification changes in a review PR, preserving verified runtime access rules.
- Run npm run drift:fixtures with approved MCP_FIXTURE_INPUTS to prepare sanitized captures. The hosted publish path validates changes before opening a review PR.
- Run npm run drift:baseline to regenerate the response baseline from reviewed fixtures.

A drift issue reports a dated API change; it does not by itself mean the server is down. Review the affected contract and evidence before changing code. Unknown response-key names are withheld until reviewed because map keys can identify accounts. Setup, limits and PR review steps are in [the maintenance runbook](library/maintenance.md).

GitHub can disable scheduled workflows in a public repository after 60 days without repository activity. Merging reviewed maintenance PRs provides activity, but an unchanged API does not guarantee a PR. If schedules stop, open the repository's Actions tab, select each disabled workflow and choose Enable workflow, then run it manually to verify configuration. See [GitHub's recovery instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows). No automatic empty commits are made.

If drift notifications prove noisy rather than useful, the maintainer can mark the repository unsupported in this README and disable its schedules.

## When Splinterlands changes something

The official API specifications are linked above, and the catalogue records
where each contract came from, using specification provenance and recorded
observations as applicable. Observed behaviour has repeatedly differed from
what a reader might expect—for example, some accepted parameters were inert.
For the measured project-history route, `offset=1` and `limit=2&offset=2` did
not reach later rows; for balance history, `limit=3&offset=1`, `offset=2` and
`offset=3` returned empty arrays; and for reward actions,
`limit=3&offset=3` and `limit=1&offset=1` returned empty arrays. This
repository captures response evidence and operational observations rather than
assuming declarations are complete. A
changed field or response shape is surfaced as a drift signal for review; it is
not automatically treated as an outage. If a route starts requiring
authentication, the server reports that access change, keeps the tool in the
tool list, and does not add credentials to make the request work.

## Provenance and recovery

Recorded observations and decisions live in `library/`; request evidence lives
in `tests/evidence/`; sanitised response fixtures live in `tests/fixtures/`.
When an upstream change makes a contract test fail, recapture the response,
review the new evidence and its classifications, and update the contract only
when the evidence supports it. Never widen a contract merely to make a test
pass.

## Contributing

See `CONTRIBUTING.md` — in particular the clean-room test that every claim
in this repository must pass.

## License

MIT — see `LICENSE`.

## Market reads

Fifteen market and purchase tools keep sale summaries, rental summaries, individual listings, grouped listings, current rentals, history and status separate. All are read-only. Status accepts exactly one of id or comma-separated ids; the upstream returns an object for a found singular ID and an array for plural IDs. Active rentals requires owner, renter or card_detail_id, observed selectors omitted from Swagger. Sale and rental grouped responses can exceed the local result bound and are explicitly truncated. Nested listing groups and card packages remain intact.

Active-rental offset and skip repeated the first page. They remain forwardable declared parameters, but do not provide working pagination. Rental-history offsets produced empty results despite a populated unoffset response; this does not establish the end of history. Seasonal listing queries used type=rent and rental_type=season. See [market observations](library/observations/market-2026-09-12.md) for exact limits and captures.

## Battle reads

`battle_queue` reads an explicit username's existing queue records. `battle_status` and `battle_result` require a queue transaction id. These tools do not submit teams or join queues. Battle details, settings, team and reward fields retain their captured wire types, including JSON-encoded strings. HTTP 200 error strings from unknown IDs are errors. Oversized replays are refused without returning partial rounds. See [battle observations](library/observations/battles-2026-09-12.md).

## Tournament reads

Ten tools cover tournament lists, details, brawls, matchups and prize aggregates. Lists are bounded without treating them as complete archives. Detail tools preserve rounds, guilds and totals while bounding the player list. The tested player_limit did not bound entrants upstream. Tournament battles require id, round and either player or swiss_group; the captured group 1 worked, while group 0 and username alone did not. The mine route is not proven to list an account's participation history. See [tournament observations](library/observations/tournaments-2026-09-12.md).

## Guild reads

Six tools cover scoped guild search, details, members, building contributions, brawl records and global brawl SPS rewards. Guild search requires a name because the unfiltered response exceeded the 2 MiB transport cap. Member rows are not assumed active: status=active reduced the captured 230 rows to 30. Contributions require a building type. Reward include flags use the string 1 and select totals and cycle records independently; the total is global even when cycle filters narrow records. See [guild observations](library/observations/guilds-2026-09-12.md).

## Game metadata

Settings come from live API responses and use a one-hour success cache keyed by exact supplied query, capped at 32 entries. Freshness retains the original retrieval time and advances the reported age. Matching version/config_version returned the full body, not a delta. Block, maintenance, transaction and health reads do not use this settings cache. Transaction metrics requires explicit metric names and a from date; each series stays intact under the output bound. See [metadata observations](library/observations/game-metadata-2026-09-12.md).

## Conflicts and proposals

Eight conflict tools cover seasons, player reward points, recorded airdrops, rankings, status, wagons and eligible card groups. Conflict status flags use the string 1 and preserve omitted sections; wagon lists are bounded while returned totals and configuration remain intact. max_group_size limits sampled UIDs within eligible groups, not qty or total_cards. Three proposal tools read listings, counts and votes; no tool votes, claims an airdrop or stakes a wagon. Paired proposal and voter pages matched a four-row request in the capture. See [conflict and proposal observations](library/observations/conflicts-proposals-2026-09-12.md).

The land_stake_assets response includes worker_view with Base Production, Base PP after cap, Terrain Boost, Boostable Production and Total Production beside unchanged source cards/items. Values retain upstream precision and response freshness. Explicitly unpowered display values are zero; absent evidence stays unknown. The view uses no extra request and shares the result byte limit.

Collection staking filters: staked=yes selects active workers, staked=no selects explicitly unstaked cards, and staked=plot requires stake_plot_id (numeric). Optional staking dates and numeric stake_plot retain source values. Missing fields produce unknown state; cooling and pending cards are separate states. Cached pages retain staking_observed_at. Numeric references are not presented as verified padded plot labels. Field behavior is supported by public-client inspection, synthetic cases and a populated live collection check; returned staking references retain their observation time and do not establish current action eligibility.

land_lineup_estimate computes an ordered, explicitly supplied worker snapshot without API calls: Base/capped Base, Boostable, Total PP, gross resource/hour, food/hour and validity/ability checks. Core/Energized, Runi, cap order and strongest duplicate abilities are included. Supply source values, not bare UIDs. This initial estimator handles Grain/Wood/Stone/Iron worksites with neutral and dual-element selection and all 14 terrain assignments; Castles/Keeps and SPS/Research remain outstanding. Output is a dated client-preview estimate, not live ownership or backend verification. See library/observations/lineup-food-client-2026-09-12.json.

For worker-swap power estimates, supply regional_power with staked_dec, current_required_dec (including this plot) and current_plot_required_dec instead of plot.efficiency. Supply each ordinary worker’s raw land_dec_stake_needed before cap and Dark Discount. The estimator replaces this plot’s old demand, applies cap/discount/Runi rules, and reports new regional demand, efficiency and shortfall. Other plots are held fixed; moving a worker from another plot requires accounting for that change in the supplied regional snapshot. No balances are fetched. See library/observations/lineup-regional-power-2026-09-12.json.

Joined collection rows also expose normalized element/secondary_element and selected-level land_abilities with a known/level_missing status. The element filter matches either element. Raw land_dec_stake_needed is retained when supplied upstream; absent demand stays unknown. No Land-ability table means none in that definition; an unavailable level is not treated as an empty list. The estimator resolves known edition-19 abilities internally, so omit an abilities override for those cards. Other returned codes may remain unsupported by the estimator and must not be silently dropped.

The offline `land_lineup_estimate` tool accepts optional `comparisons`: up to ten
uniquely labelled `{ label, lineup }` entries alongside the ordinary baseline
fields. Each `lineup` contains a complete independent estimator input. This
evaluates several alternatives in one MCP call without HTTP; it does not gather
missing card, plot or power facts. Results preserve input order and each
alternative's validity. An invalid alternative marks the tool response as an
error while preserving valid results. Alternatives do not update one another's
regional balances, and the tool does not rank different resources.

The `land_stake_deed_details` response adds `plot_view`: the public overview's `PRODUCTION / HR` numeric value and separate reference values for raw/capped Base, Boostable, Total PP and resource output. Effective PP applies efficiency except with Runi. Reference labels are explanatory; they do not assert identical screen columns. Raw upstream data remains unchanged, and missing display inputs remain unknown.

`player_inventory` requires username and an upstream type filter. The observed `Land` filter still includes Token rows. Optional `item_detail_id` filters all received rows locally before the 100-row/256-KiB result bound; upstream_rows, matched_rows and truncated describe the scope. It does not infer staking eligibility or full holdings. See `library/observations/player-inventory-2026-09-12.json`.

Four account market tools read activity, per-asset listings, all-listing rows and owned/listed stats. Activity requires player, types and sort; the observed client defaults are `purchase,sale` and `desc`. `asc` returned older rows and `sale` selected sales. `offset=1` did not select the second unoffset record; do not assume conventional row-offset paging. The existing landing tool also returns player-specific numOwned when supplied. See `library/observations/vapi-market-account-2026-09-12.json`.

player_avatar resolves a legacy profile image redirect, which may return RUNI artwork rather than the custom character. It returns avatar_url, image_url and redirect_status without downloading the image.

player_custom_avatar returns saved avatar-builder settings, including numeric level as metadata. Set render=true to compose official artwork layers into a PNG image content block. The artwork contains no level numeral, badges or exemplar level frame/gem; those remain separate interface data. Unknown cosmetics and failed assets return an error instead of partial artwork. See [custom avatar data and artwork](library/avatar-artwork.md).
