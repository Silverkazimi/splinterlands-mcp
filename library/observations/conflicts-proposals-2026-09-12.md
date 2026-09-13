# Conflict and proposal observations — 2026-09-12

Official declarations: https://api2.splinterlands.com/doc/swagger-ui-init.js, SHA-256 5186c675fb53a13c14c852803b2638232ad111796fb67991e7591224fde4f9ab. Serial unauthenticated GETs used a 20-second timeout, 2 MiB consumed-body cap and 300 ms pauses. No voting, claiming, staking or submission operation was called.

| Probe | Route | HTTP | Bytes | Shape |
|---|---|---|---|---|
| seasons | `/conflicts/seasons` | 200 | 17439 | 24 rows |
| season-one | `/conflicts/seasons` | 200 | 575 | id, starts, ends, season_group, reset_block_num, card_detail_id, card_amount, card_guaranteed_chances, cards_awarded, card_chance_per_entry, card_gold_chance, card_boosted_gold_chance, alchemy_potions_to_boost, card_black_chance, card_boosted_black_chance, midnight_potions_to_boost, cards_to_guarantee_one_gold, cards_to_guarantee_one_gold_full_potions, voucher_cost_to_boost, verification_data |
| conflict-players | `/conflicts/players` | 200 | 356 | reward_point_threshold, players |
| players-conflict | `/conflicts/players` | 200 | 356 | reward_point_threshold, players |
| conflict-airdrop | `/conflicts/airdrop_distribution` | 200 | 54 | distribution |
| airdrop-conflict | `/conflicts/airdrop_distribution` | 200 | 818 | conflict, distribution |
| conflict-leaderboard | `/conflicts/leaderboard` | 200 | 241961 | leaderboard, totals, leaderboard_prizes |
| conflict-leaderboard-player | `/conflicts/leaderboard_with_player` | 200 | 1391 | player |
| conflict-status | `/conflicts/status` | 200 | 49519 | config, conflict, stats, player, wagons |
| conflict-status-config | `/conflicts/status` | 200 | 49519 | config, conflict, stats, player, wagons |
| status-config-one | `/conflicts/status` | 200 | 125 | config |
| status-wagons-one | `/conflicts/status` | 200 | 48316 | stats, wagons |
| status-no-wagons | `/conflicts/status` | 200 | 1239 | config, conflict, stats, player |
| conflict-wagon | `/conflicts/wagon` | 200 | 453 | player, wagon_uid, cards, updated_date, total_cp, damaged |
| wagon-unknown | `/conflicts/wagon` | 200 | 2 |  |
| eligible | `/conflicts/wagon_eligible_cards` | 200 | 1363 | total_cards, groups |
| eligible-one | `/conflicts/wagon_eligible_cards` | 200 | 1174 | total_cards, groups |
| proposals | `/proposals/` | 200 | 2077 | 2 rows |
| proposal-page2 | `/proposals/` | 200 | 1153 | 2 rows |
| proposal-first4 | `/proposals/` | 200 | 3229 | 4 rows |
| proposal-count | `/proposals/pending_proposal_count` | 200 | 11 | value |
| proposal-votes | `/proposals/votes` | 200 | 2045 | 2 rows |
| votes-page2 | `/proposals/votes` | 200 | 1207 | 2 rows |
| votes-first4 | `/proposals/votes` | 200 | 3251 | 4 rows |

## Measured contracts and selectors

Seasons returned 24 rows without id and one object for id=22. Players scoped to the captured account and conflict 22 returned one reward-point row under players plus reward_point_threshold. Both id and conflict selected it. Airdrop distribution for conflict 1 returned one prize-count row; using conflict instead of id added a conflict metadata object. Those extra fields remain intact.

The leaderboard returned 200 rows plus totals and ten leaderboard_prizes records. leaderboard_with_player instead returned only a player object; it is not described as a complete leaderboard. Rank and total_contribution retained their string types.

Full status included config, conflict, stats, player and 110 wagons. only_config=true did not alter it. only_config=1 returned only config; only_wagons=1 returned wagons and a smaller stats object containing only total_wagon_cp; exclude_wagons=1 retained every other section. Omitted sections remain omitted. Each wagon is kept intact when the list is bounded. The wagon lookup returned its owner, UID, five cards, timestamp, contribution and damage flag. Unknown uid returned an empty object, which does not pass the successful wagon contract.

Eligible cards returned total_cards=248 with twelve groups. max_group_size=1 versus 2 changed the UID sample per group, while qty remained the total per group. These sampled UIDs must not be represented as a complete inventory or used to infer that unlisted cards are ineligible.

Proposal pages limit=2,offset=0 and limit=2,offset=2 concatenated to the exact IDs from limit=4,offset=0: 7525,7393,7294,7261. The same voter-identity comparison passed for proposal 7525. This establishes the tested paging behavior, not a transactional snapshot across concurrent votes or all filter combinations. Vote weights and thresholds remain decimal strings. Pending count requires an explicit username by tool policy.

Fixtures retain three root or named-list rows with surrounding fields unchanged; partial status and singular season captures are retained separately. Output stays within 100 rows and 256 KiB. Other declared filter semantics remain unverified unless explicitly stated above.

## Built transport verification

All eleven conflict/proposal tools passed fifteen built-stdio MCP calls, covering singular seasons and three partial status shapes. Discovery returned 128 tools. Leaderboard and wagon truncation retained independent totals, configuration and requested sections. See [live summary](conflicts-proposals-live-2026-09-12.json). The full suite passed 215 tests across 24 files. Strengthened essential-field checks for returned status sections then passed seven focused contract/generation tests and a fresh build; these use total_wagon_cp, the field present in both full and wagon-only stats. Typecheck, lint, full privacy and diff checks passed.
