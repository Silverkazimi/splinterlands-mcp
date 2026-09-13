# Tournament observations — 2026-09-12

Official source: https://api2.splinterlands.com/doc/swagger-ui-init.js (SHA-256 5186c675fb53a13c14c852803b2638232ad111796fb67991e7591224fde4f9ab). Serial unauthenticated GET captures used a 20-second timeout, 2 MiB consumed-body cap and 300 ms pauses. No join, entry, prize claim or credential operation was issued.

| Probe | Route | HTTP | Bytes | Shape |
|---|---|---|---|---|
| battles-group-one | `/tournaments/battles` | 200 | 111236 | 21 rows |
| battles-group | `/tournaments/battles` | 200 | 2 | 0 rows |
| battles-player | `/tournaments/battles` | 200 | 32301 | 6 rows |
| battles-username | `/tournaments/battles` | 200 | 2 | 0 rows |
| battles | `/tournaments/battles` | 200 | 2 | 0 rows |
| brawl-current | `/tournaments/find_brawl` | 200 | 35921 | id, format, sub_format, start_date, status, data, players, guilds |
| brawl-no-guild | `/tournaments/find_brawl` | 200 | 87 | error |
| brawl | `/tournaments/find_brawl` | 200 | 35921 | id, format, sub_format, start_date, status, data, players, guilds |
| cancelled | `/tournaments/cancelled` | 200 | 378878 | 200 rows |
| completed-paging | `/tournaments/completed` | 200 | 355724 | 200 rows |
| completed | `/tournaments/completed` | 200 | 355724 | 200 rows |
| crown-active | `/tournaments/crown_pot` | 200 | 81 | error |
| crown-current | `/tournaments/crown_pot` | 200 | 69 | error |
| crown-upcoming | `/tournaments/crown_pot` | 200 | 81 | error |
| crown | `/tournaments/crown_pot` | 200 | 69 | error |
| find-no-id | `/tournaments/find` | 200 | 45 | error |
| find-upcoming | `/tournaments/find` | 200 | 55383 | id, created_by, created_date, created_block, name, description, start_date, status, current_round, sponsor_name, sponsor_logo_url, min_entrants, max_entrants, entry_fee, total_prizes_usd, data, sponsor_logo_url_med, sponsor_logo_url_lg, payment, sponsor_url, checkin_msg_sent, format, payment_data, password_pub_key, sub_format, require_kyc, approved, allow_lite, stretch_background, players, rounds, num_players, total_rounds, qualifiers |
| find | `/tournaments/find` | 200 | 21557 | id, created_by, created_date, created_block, name, description, start_date, status, current_round, sponsor_name, sponsor_logo_url, min_entrants, max_entrants, entry_fee, total_prizes_usd, data, sponsor_logo_url_med, sponsor_logo_url_lg, payment, sponsor_url, checkin_msg_sent, format, payment_data, password_pub_key, sub_format, require_kyc, approved, allow_lite, stretch_background, players, rounds, num_players, total_rounds, qualifiers |
| frays | `/tournaments/frays` | 200 | 745 | frays, fray_counts, frays_filled_by_guild, is_player_spying |
| in_progress | `/tournaments/in_progress` | 200 | 15502 | 8 rows |
| mine-creator | `/tournaments/mine` | 200 | 342041 | 200 rows |
| mine-player | `/tournaments/mine` | 200 | 2 | 0 rows |
| mine | `/tournaments/mine` | 200 | 2 | 0 rows |
| prizes | `/tournaments/prizes` | 200 | 35 | awarded, upcoming |
| profile-current | `/players/details` | 200 | 4030 | public profile used only to refresh guild and brawl selectors |
| upcoming | `/tournaments/upcoming` | 200 | 107328 | 58 rows |
| upcoming_official | `/tournaments/upcoming_official` | 200 | 107328 | 58 rows |

## Selector and state evidence

Upcoming and upcoming_official returned identical 58-row captures. Completed and cancelled returned 200 rows. Completed with undocumented limit=2 and offset=2 was unchanged; these observed-only inert inputs are not callable. No complete-archive claim follows from the default row count.

Mine returned 200 rows for a creator found in the public listing, but empty arrays for two player accounts including a known entrant. The tool therefore reports the upstream mine listing without calling it participation history.

Find requires id by tool policy. The no-id request returned an error. An upcoming detail call with player_limit=2 returned 19 players and num_players=19, so the declared filter remains forwardable but is recorded inert. Players are locally bounded with surrounding fields retained. Both upcoming and completed detail shapes contributed to the contract.

Find_brawl with id and guild_id returned a completed brawl; omitting guild_id returned an error. Frays with tournament_id and guild_id returned HTTP 200 containing a nested authentication error in frays, alongside fray_counts and other public fields. It remains excluded, with no credential path added. The initial username was absent; no claim is made that an authenticated roster was retrieved or that public counts constitute one.

Battles with id and round=1 returned empty, as did swiss_group=0 and username alone. swiss_group=1 returned 21 matchups; player set to a captured entrant returned six. Nested battle references and participant records are preserved intact, and the local bound counts matchups.

Crown pot rejected the known brawl due to status. Refreshing the public guild profile supplied the same current brawl, and the result repeated. Ordinary upcoming and in-progress tournaments were rejected as not brawls. A successful contract needs a publicly discoverable eligible brawl and remains unverified. This is a state limitation, not a claim of authentication gating.

Fixtures retain three root rows or three players, preserving other nested fields. Full objects are refused if their unbounded summary cannot fit 256 KiB; no partial group, round or guild record is manufactured. Other declared optional filters remain unverified unless stated above.

## Built transport and validation

All ten tournament tools passed live built-stdio MCP calls; discovery returned 105 tools. See [live summary](tournaments-live-2026-09-12.json). Typecheck, lint, build and full privacy checks passed. The complete suite passed 200 tests with one fixture-depth audit failure; the corrected audit and new payout regression passed all eight tests in that file. All 202 tests therefore have passing evidence. The correction checks actual wire bodies, exact observed path coverage and zero truncation; production depth remains eight. Diff whitespace checks passed.
