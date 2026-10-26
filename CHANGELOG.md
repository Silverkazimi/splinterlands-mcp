# Changelog

## 1.2.0 - 2026-10-26

### Added

- `cards_max_land_pp` supplies an offline max-level base Land PP reference by card set, rarity and foil; `cards_collection` adds `max_land_base_pp` to each row. Unknown print rules remain null and `no_pp` cards yield zero, supporting Land planning. See [the rule evidence](library/observations/max-land-pp-2026-10-26.md).
- `hive_account` reads one explicit public Hive account, returning post count, raw and log-scale reputation, creation time, vote status and regenerated voting mana without keys, balances or free-text metadata. See [the account evidence](library/observations/hive-account-2026-10-26.md).
- `cards_collection` now reports rarity, maximum level, required BCX, whether each copy is maxed, and any excess BCX, including compact pages. It accepts `maxed=true` or `maxed=false` and applies that filter across the full collection before paging, so callers can find maxed copies without fetching every page. A second call with `maxed=false, min_land_base_pp=1000` finds higher-power non-maxed copies. Missing definitions or uncertain caps remain null and are explained by a warning. See [the rule evidence](library/observations/collection-maxed-rules-2026-10-26.md).

### Should you update?

- Yes if you plan Land lineups or need to know which copies are maxed. All changes are additive: existing tools keep their inputs and outputs; new fields and tools are optional.

### Known limits and verification

- Max-level and maxed rules follow the published combine thresholds, keyed on `card_set` (not the numeric edition). Over-levelled copies count as maxed and report `overlevelled` and `excess_bcx`; black foils always count as maxed. Unknown prints stay null rather than guessed.
- Later-set max-level Land PP comes from a measured reference, not an official table; a few maxed copies can show a current Land base PP that differs from the reference, so treat `max_land_base_pp` as a planning reference.
- Verified with typecheck, lint, the full test suite, the full privacy scan and a packed-artifact check, plus a live read of a large real collection: the maxed count matched an independent implementation of the same rules exactly, and max-level Land PP matched it wherever both had a rule.

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
