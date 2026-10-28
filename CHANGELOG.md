# Changelog

## 1.2.0 - 2026-10-26

This update answers two questions that used to take dozens of calls: which of my cards are maxed, and how much Land PP a card reaches at max level. It also adds a first read of a Hive account itself. Everything is additive: existing tools keep their inputs and outputs, so updating from 1.1.0 needs no other change. The server remains read-only and requires no game login.

### Do I need to update?

Yes, if you plan Land lineups, look for maxed or over-levelled cards, or want a Hive account's post count, reputation or voting mana. Otherwise nothing changes for you.

### What you can do now

- **See at once which cards are maxed.** Every `cards_collection` row, including the compact `all: true` rows, now carries `rarity`, `max_level`, the BCX needed for max level (`bcx_max`), `maxed`, `overlevelled` and `excess_bcx`. The thresholds are the game's own combine rates, chosen by the card's `card_set` (Alpha, Beta, Foundations or the modern sets), never by the numeric `edition`. Example: finding every maxed card in an 8,125-card collection used to mean paging the whole collection and joining card definitions by hand, about 82 calls; now one filtered call returns them.
- **Filter by maxed state across the whole collection.** `maxed: true` or `maxed: false` is applied to the full collection before paging. Combined with `min_land_base_pp`, two calls answer "all maxed cards, plus non-maxed cards at 1,000 PP or more".
- **Over-levelled cards are handled.** A copy combined past max level counts as maxed, is flagged `overlevelled` and shows its surplus as `excess_bcx`. Black foils always count as maxed.
- **Look up a card's Land PP at max level.** The new offline tool `cards_max_land_pp` takes a `card_set`, rarity and foil and returns the base Land PP at max level, for planning which prints reach a target before you buy or combine. Collection rows add the same value as `max_land_base_pp`. Cards without Land PP (`no_pp`) return 0.
- **Read a Hive account.** The new `hive_account` returns one account's post count, reputation (raw and the usual score), creation date, vote status and current voting mana, regenerated to the time of the call. It never returns keys, balances or profile text.

### Limits to keep in mind

- **Unknown stays unknown.** If a card's definition or set rule can't be resolved, `rarity`, `max_level`, `maxed` and the PP reference are `null` with a warning, never a guess or `false`.
- **Max-level Land PP is a planning reference, not an official table.** Alpha, Beta and Untamed multipliers come from the official Land documentation; the baseline for later sets was measured from maxed copies. Gold foils of some prints, black foils and sets without a known rule return `null`. A few maxed copies show a different current Land PP than the reference; their own `land_base_pp` is always kept and takes precedence on the row.
- **Voting mana is an estimate** from the node's last update and the five-day regeneration rule, not a consensus measurement.
- No login, signing, trading or other account-changing feature was added.

### Verification

The update passed typecheck, lint, the full privacy scan and **623 tests across 85 files** on Node.js 24; hosted CI repeats them on Node.js 22 and 24.

Every new or changed tool was checked on 2026-10-26 against live public data through the server:

- **`cards_collection` maxed fields:** on an 8,125-card collection, `maxed: true` returned 982 cards in 10 pages and `maxed: false` with `min_land_base_pp: 1000` returned 84 more. An independent implementation of the same rules, used by a separate Land tool, counted exactly the same 982 maxed cards, including 32 over-levelled ones.
- **`max_land_base_pp`:** across all 8,125 cards it matched that independent formula wherever both had a rule. Every card the server reported at 0 really has 0 Land PP.
- **`hive_account`:** a live account was found and its voting mana computed; nothing private was printed.

The package dry run contains the executable and public evidence, with no tests or work files bundled. npm is not updated by this release.

## 1.1.0 - 2026-10-21

### Changed

- `land_resources_balances_history` retains its original inputs, description and VAPI response envelope. A positive offset was measured not to page conventionally. The separate `land_resources_balances_history_window` tool provides bounded, count-checked timestamp windows and explicitly reports incomplete coverage.

### Added

- `land_income_daily` summarizes up to 14 completed UTC days of raw resource balance movements, with no DEC valuation. For oversized same-millisecond groups it reads one bounded row, then uses a cached, budget-counted catalogue transaction lookup for recognized `land_operation` / `harvest_all` results. It reports `basis`, group/matched/unmatched row counts, and keeps unmatched days incomplete while showing transaction-derived production, gross, tax and consumption. See the dated redacted observation in `library/observations/land-income-harvest-transaction-2026-10-21.md`. The separate `current_rate_per_day` uses current deed `total_work_per_hour × 24` and is an estimate, not historical income.
- Upstream date filters are closed at millisecond precision. Internal half-open windows send `endDate` one millisecond before the exclusive end, so midpoint and day-boundary rows are read once. Bulk transaction totals deduplicate by `trx_id`; resource row counts are reported per resource.

### Known limits and verification

- Dense days use count-matched leaves (25 rows by default) and expanded bounded read budgets. For an oversized same-millisecond group, the tool attempts transaction-based harvest accounting from one bounded row and the catalogue lookup. Unmatched rows, failed lookups, upstream timeouts and count mismatches remain incomplete with a reason. The two requested production days could not be live-verified in this run because the daily MCP request timed out after 240 seconds without returning a result. Check `complete` before using totals.

## 1.0.7 - 2026-10-11

A security maintenance release. It updates third-party packages that had published security advisories. The tools, their inputs and their outputs are unchanged, so updating from 1.0.6 needs no other change. `npm audit` now reports no known vulnerabilities, where 1.0.6 reported eight.

### Do I need to update?

Yes, but none of these advisories was a realistic risk for this server as normally run. It talks to its client over standard input and output, opens no network port, sends no credentials and decodes only WebP images. Updating removes the warnings and keeps the server safe if that ever changes.

### What was fixed

- **Image rendering (`sharp` 0.35.5).** The image library's bundled SVG decoder had a vulnerability ([GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)). `player_custom_avatar` with `render: true` uses this library, but it accepts only WebP layers from Splinterlands, so the SVG decoder was never reached.
- **MCP SDK (`@modelcontextprotocol/sdk` 1.32.1).** Older versions could let an MCP server steer a client's OAuth credentials to an authorization server of its choosing ([GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h)). That affects MCP clients that sign in with OAuth, not this server. 1.32.1 is now the minimum version.
- **Packages the SDK depends on** (#67, contributed by a community developer):
  - `proxy-addr` 2.0.8: trusted-proxy checks could be fooled by IPv4-mapped IPv6 addresses ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), critical).
  - `ip-address` 10.7.3: subnet checks across address families, and long-input slowdowns.
  - `hono` 4.13.13: unescaped text in one JSX rendering path.
  - `fast-uri` 3.1.8: inconsistent host-name normalization.

  The first three serve the SDK's HTTP server mode, which this server does not use. `fast-uri` belongs to the SDK's JSON Schema validator, and the flaw affects only comparisons of web addresses.
- **Development tools only.** These do not ship to users:
  - `brace-expansion` 5.0.12 and `source-map-js` 1.2.2, both denial-of-service fixes.
  - Routine patch updates to `eslint`, `typescript-eslint`, `tsx`, `vitest` and `@types/node`.

### How it was checked

- Typecheck, lint, the full privacy scan and all 597 tests pass on Node.js 22 and 24.
- The built server was started and checked live: it registered 186 tools, read current game data and rendered an avatar PNG with the new image library.
- An independent review confirmed that the dependency lockfile matches `package.json` and that no package moved back to a vulnerable version.

## 1.0.6 - 2026-10-11

[Plain-language release notes](library/release-notes-v1.0.6.md).

### Added

- Added a dated offline card-edition resource and clarified that `card_set` on collection and find rows names each copy's main set; numeric editions describe print identities.
- Added the explicit main-set/sub-set hierarchy, normalized `main_set`, `main_set_label`, `print_class` and `sub_set` card fields, and local collection filters for main set and print class. Unknown editions are flagged.
- Added `land_deeds_bundle`: every deed for one player or region from one streamed read, with staking and worksite state joined, paged from a 120-second cache.
- Added ownership, delegation, rental, market-listing and lock fields to `cards_collection` rows; a field the upstream omits is listed in `ownership_unknown`.
- Added a 120-second collection index so every `cards_collection` cursor and filter reuses one upstream read, plus a compact `all` projection and the index age on every page.
- Added an `include` selector to `land_plot_snapshot`; its follow-up reads now run in parallel.

### Corrected

- `transaction_inspect` now reads every game record of a multi-operation transaction (`<trx_id>`, `<trx_id>-1`, …) and reports a combined `batch_status`; it previously read only the first.
- Accepted game transaction records whose `result` is null, which `transaction_lookup` had refused as malformed.

## 1.0.5 - 2026-09-29

[Plain-language release notes](library/release-notes-v1.0.5.md).

### Added

- Added public did-you-know, daily-update, burn-event player and prize reads, and a no-vesting Land liquidity read.
- Added a verified four-request plot snapshot with all-or-nothing 256 KiB output.
- Surfaced marketplace purchase listing-item IDs and list-operation item IDs in Hive summaries.

### Corrected

- Preserved the public deed owner field, and documented current listing fields separately from purchase history.
- Documented sampled buyer and seller market activity, tested broken offsets, accepted market asset names and nested balance-history token legs.
- Retained bounded local Hive history filtering after an inconclusive server-side cursor probe.



## 1.0.4 - 2026-09-24

### Added

- Included the public card name and an explicit name-lookup status beside each owned skin's existing `active` flag.
- Added optional local `skin` and `active` filters to `player_skins`, with continuation positions over the matching rows.

### Fixed

- Accepted documented four-field `fragment_roll` objects in reward-action rows while retaining numeric field checks.
- Returned complete `player_skins` inventories when they fit the 256 KiB bound, with local `start_index` continuation for larger results.

## 1.0.3 - 2026-09-18

### Added

- Added the public `prices_current` token-to-USD feed through the fixed `prices.splinterlands.com` host, with a five-minute success cache.
- Added read-only ranked-draw and frontier-draw status, history, entry, prize-overview, available-prize and recent-mint tools with sanitized live-observation fixtures and bounded responses.
- Added public card mint-history, pack jackpot overview and card gold-reward read tools with measured contracts, sanitised fixtures and bounded responses.

## 1.0.2 - 2026-09-18

### Added

- Added officially sourced Land Aura and Research production rates plus harvest-tax, tax-claim, grain-cost and Trade Hub fee rule data.

## 1.0.1 - 2026-09-18

### Fixed

- Accepted guild-less player profiles and profiles with nullable avatar, reward-block and crest-decal fields.
- Included bounded rows alongside truncation notices for list responses.
- Reported upstream HTTP-200 error messages as upstream errors, including unknown-player responses.
- Activated the documented environment-controlled request rate and corrected cache and redirect documentation.
- Added an outgoing-commit privacy check to the pre-push hook.

## 1.0.0 - 2026-09-18

Initial GitHub release. npm registry publication is separate.

### Documentation

- Rewrote the opening README overview in plain language and moved detailed request behavior to a linked reference, preserving the tool table and later sections.
- Corrected the README release version and Node.js requirements, added a plain-language starting point with Codex explicitly listed, and recorded verified maintenance status.

### Added

- Saved custom avatar settings and opt-in PNG artwork composition, with level metadata separate from image art. Legacy RUNI profile portraits and other observed artwork variants are documented separately.

- Read-only MCP stdio server with 163 tools, six resources and a 190-entry endpoint catalogue. The catalogue distinguishes callable endpoints from dated exclusions.
- Public Land deed, plot, staking, resource, production, liquidity, project and inventory reads, with verified plot references and bounded account scope.
- Card collection streaming and projected pages with memory limits, metadata joins, staking-state filters, cooldown states, Land abilities and production figures.
- Offline Land lineup estimation and comparisons covering production caps, terrain and element modifiers, abilities, Runi, Power Cores, food and optional regional DEC recomputation. A bounded lineup snapshot supplies dated inputs and explicit unknown states.
- Public player, ranking, market, rental, delegation, collector, battle, tournament, guild, conflict, proposal and global game information reads.
- Bounded Hive account history, complete signed transaction lookup and combined chain/game evidence, with explicit partial-history limitations and a sourced transaction-limit resource.
- Fixed upstream hosts and read-only methods, request budgets, rate and concurrency limits, bounded retries, circuit breaking, streamed response caps, in-memory caching and explicit truncation.
- Nightly endpoint drift issues, weekly specification-review PRs and monthly sanitized fixture-review PRs. Maintenance includes four account-role secrets, complete-coverage templates and offline configuration validation.
- Privacy checks, pinned CI actions, Node 22/24 validation and dependency update PRs.

### Corrected during pre-release verification

- Valid empty/populated account sample changes preserve fixtures and are reported as maintenance coverage gaps rather than API failures; intentionally empty nightly samples are explicit.

- HTTP deadlines cover response-body consumption as well as headers; stalled bodies terminate within the bounded retry policy.
- TTL caches evict old entries at fixed capacities, preventing unbounded growth across unique collection queries. HTTP identification uses the public package metadata.

- Wrapped upstream errors, authentication gates, blocked requests, malformed results and ambiguous empty responses remain distinct.
- Observed query parameters, nullable fields and route-specific pagination are represented without overstating specification accuracy.
- Plot labels, numeric plot references and deed identifiers retain verified relationships and observation times.
- Land production calculations preserve cap order, supported terrain modifiers, powered-worker state, ability activation and raw precision.
- Actual MCP callbacks enforce request budgets while preserving bounded retry behavior and concurrent-call isolation.
- Maintenance baselines prefer measured access tiers. Specification changes cannot silently promote unverified endpoints or authentication declarations.
- Package contents include the public evidence library so documentation links remain usable after installation.
