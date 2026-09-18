# Technical capability notes

[Return to the README](../README.md). This reference preserves the detailed request limits and observed API behavior behind the introductory overview. Plain file paths below are relative to the repository root.

**Version: 1.0.3.** 179 tools are registered (`src/server.ts` and its registration modules).
66 call `vapi.splinterlands.com`: 40 Land routes covering deeds, projects,
counts, staking, resources and liquidity pools, plus seven market reads, ten delegation-rental reads, three delegation reads, five collector configuration/account reads and the health root. 105 call
`api.splinterlands.com`: eleven card tools, one item-metadata tool, and 30
player and ranking tools, plus 15 market and purchase-read tools, three battle reads, ten tournament reads, six guild reads, five game metadata reads, and eleven conflict/proposal reads.
One tool calls `prices.splinterlands.com`: `prices_current` reads the public token-to-USD feed and uses a five-minute success cache because prices move.
Three tools work offline: `list_endpoints` and `describe_endpoint` report the catalogue's 206 endpoints and their evidence; `land_lineup_estimate` evaluates supplied lineup snapshots and comparisons. See
`library/endpoint-knowledge-tools.md` for the evidence model.

The ranked-draw and frontier-draw families expose current status, completed
draws, completed-entry rows, prize overviews, available prizes and recent
mints. Status accepts an optional explicit username; entries require an
explicit numeric draw id. Prize overviews and available-prize metadata use the
24-hour metadata cache. The upstream list responses are unbounded, so the
server returns at most 100 rows and 256 KiB with an explicit truncation notice;
the normal 2 MiB upstream response cap still applies.

A sixth offline resource, `splinterlands://hive/transaction-limits`, explains source-dated transaction limits and terminology. Three additional tools provide bounded Hive history, full transactions and combined game evidence; see [Hive transaction evidence](hive-transaction-evidence.md).

Five offline JSON resources provide dated public Land rules: splinterlands://land/rules/terrain (14 terrains by six elements), splinterlands://land/rules/production (baseline output and food rates), splinterlands://land/rules/cap (worksite cap and Runi exception), and splinterlands://land/rules/card-abilities (edition-19 level tables for five observed cards, activation and stacking rules), plus splinterlands://land/rules/screen-fields (public-client worker screen labels, cap allocation order and power slots). Discover them with resources/list and read them with resources/read; they make no API calls. Sources and scope are included. The offline lineup estimator uses these reference rules. Snapshot reads verify their baseline against current backend values before returning estimator inputs; this does not establish eligibility for a proposed change.

The 13 standard plot-scoped tools accept exactly one `plot_id` (a numeric ID or a
display label such as `001-02-001` / `1-2-1`) or `deed_uid`. Routes with
the original `deedUID` spelling still accept it. Shared resolution verifies
the deed before requesting project, staking or resource data and may use two
logical GET requests. The collection metadata join permits two GETs, or three when include_plot_references is explicitly enabled. The additional compound tool described below permits ten; other game tools retain the one-request budget. Verified
results include `plot_reference` with numeric ID, padded label and deed UID;
resolution and target freshness are reported separately. Empty or mismatched
resolution is unverified, not proof that the location does not exist. See
`library/observations/plot-labels-2026-09-12.md`.

`land_lineup_snapshot` accepts an explicit player and one plot reference, plus candidate card IDs or UIDs. It gathers current workers, regional power, production, candidates, verified available location labels and Power Core facts within ten logical GETs. The collection is streamed once, at most 100 matching cards are retained, and there is no automatic pagination. Only an agreeing backend baseline is returned for the offline estimator; reads are non-atomic and candidate cooldown/eligibility caveats remain visible. Use its baseline and selected candidate workers in a second `land_lineup_estimate` call. The two-call snapshot and estimator workflow has been verified against a populated Grain plot. Other scenarios still require their own agreeing baseline. Land stake changes are per plot; these tools perform no changes.

`cards_collection` streams the complete upstream collection and retains at most
100 projected cards for the requested local page. Optional include_plot_references adds verified reported_stake_plot_reference (padded label, numeric ID and deed UID) through one account-scoped deed search limited to 200 rows. Missing, conflicting or unavailable references remain null with separate status and freshness; there is no per-card lookup or pagination loop. A cooling card’s retained reference describes its former plot. Toggling only this option reuses the projected collection cache and reads plot references afresh. Card definitions add name, primary/secondary color and subtype; color and sub_type filters match case-insensitively before paging. The definition map is cached for 24 hours with separate provenance. Missing definitions are counted and retain the instance without invented metadata. Returned cards retain land_base_pp as the upstream decimal string when present; min_land_base_pp filters numerically before paging. Missing power does not count as zero. A later cursor re-streams
the collection; an identical page request can use the 60-second page cache.
The route has a 90-second timeout, a 128 MiB heap guard, and a 358 MiB RSS
ceiling instead of a fixed response-byte ceiling. The largest measured live
response was 155 MiB; the separate synthetic memory measurements and their
limits are recorded in
`library/observations/collection-streaming-memory-2026-09-08.md`.

The card mint tools read three public circulation routes. Mint history requires
card_detail_id and foil, preserves the optional total_minted field, and does
not use a success cache; jackpot overview and gold rewards use the 24-hour
metadata cache. Jackpot rows and gold-reward rows are locally bounded to 100
rows and 256 KiB, while mint-history mints are bounded within their object;
the by_date mint-history form is documented but not exposed as a variant.

The player tools include profiles, balances, rewards, quests, skins,
public authority assignments, recent teams, purchase information, airdrop
records, and delegation history. Each account tool requires its own explicit
selector. `player_dec` instead reports global DEC accounting and has no player
selector. `player_balances` accepts `players` and optional `token_type`;
`player_archived_balances` also requires `players`, despite the upstream error
text incorrectly asking for `username`. `player_profile` uses `name`, and
`player_recent_teams` uses `player`.

The fourteen additional player tools make one logical GET each and do not
auto-fetch continuation pages. Array results are locally bounded to 100 rows
and 256 KiB, with truncation stated in text and metadata. Oversized object
responses or single rows are refused without returning partial records.
`player_lp_claim_history` repeated the same rows with `offset=1`;
`player_reward_delegation_history` returned an empty array with that offset.
Neither behaviour establishes a working next page. The recent-teams tool
does not accept decryption keys. Dated evidence and capture limits are in
`library/observations/player-completion-2026-09-12.md` and
`library/observations/player-routes-2026-09-08.md`.

The ranking tools distinguish upstream top lists from complete rankings.
`player_richlist` exposes a measured `limit` for leading rows; its tested
offsets repeated the same accounts, so no offset is exposed. The regular
leaderboard ignored both tested paging parameters. Burn-event and presale
tools bound their named list fields while retaining totals and any separately
requested player record. In particular, presale leaders are now callable:
the list can be shortened without dropping its surrounding fields. Every
local cut is reported; the server does not claim to return a full ranking.
`player_season` reads `GET /season` with a required id.
See `library/observations/rankings-2026-09-12.md`.

The three land-count and volume tools add separate catalogue-derived views for
region counts, tract counts, and the upstream's volume figures. Captured
named-player responses contain 150 populated region rows and 36 populated tract
rows, respectively. Their captured row fields are recorded in the catalogue
and in `tests/evidence/land-result-contract-evidence.json`; unscoped captures
returned successful empty envelopes.

The two staking tools return the upstream's per-asset rows and deed-level
staking record separately. A deed with nothing staked is a successful answer
with empty asset arrays on one route and a fully present zeroed record on the
other. The routes report equivalent figures with different JSON wire types,
and this server converts neither. They also differ on a bad deed uid: one
returns an error and the other returns a successful empty answer.

The four DEC staking tools return the upstream's overall figure, per-region
rows, region figures, and pending claim figure separately. The overall route
returns a bare JSON number, while the region route returns either a record or
an empty array for an incomplete request; a valid no-stake region returns a
zero-valued record. All four tools refuse a call without an account because
the upstream answers such a call with a plausible zero or empty result. This
server never adds one figure to another.

The four land-project tools expose separate active, history, count, and
requirements responses. History is returned in one upstream response and is
also bounded locally to 100 rows and 256 KB. The recorded history probes were
bare, `offset=1`, `limit=2`, and `limit=2&offset=2`: `limit=2` returned the
leading two rows, while `offset=1` and `offset=2` did not reach later rows in
those requests.

`land_deeds_search` makes one logical upstream request per call and does not
auto-fetch a continuation. Its limited response is bounded by a 256 KB
serialized-result limit and is all-or-nothing if oversized; request a smaller
`limit` rather than expecting partial data. The recorded probes were
`offset=0`, `offset=5`, `limit=10000`, three calls omitting all parameters, and
`orderBy=desc`: `offset=0` returned zero rows, `offset=5` returned the first
four rows of the omitted-offset response, and no offset value tried reached
later rows. `limit=10000` returned 10000 rows; the three omitted-parameter
calls returned zero bytes; and `orderBy=desc` returned an empty data array.
No total or has-more field was observed, so this response is not evidence of a
complete listing or count.
The tool requires either `player` or a place selector (`tract_id` or
`region_number`); a bare search is refused before any upstream request. This is
a project policy for honest scope reporting, not a requirement declared by the
upstream specification. Each upstream result records whether the request used
an explicit account or explicit geography; it never records an account value.
