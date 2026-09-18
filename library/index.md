# library index

Splinterlands API facts use its published specifications, support documentation and bounded public observations. Hive-specific facts use official Hive developer documentation and pinned openhive-network source. The transports and evidence scopes remain distinct.

## Official sources

- `https://vapi.splinterlands.com/` — swagger spec for the `vapi` host
  (Land, market, delegation/rental, collector endpoints).
- `https://api.splinterlands.com/` — swagger spec for the main game API
  (cards, players, battles, tournaments, guilds, game meta).
- `https://prices.splinterlands.com/prices` — official public token-to-USD price feed.
- Splinterlands' support site (`support.splinterlands.com`) — the Land
  APIs article, referenced for endpoints and conventions not fully
  captured by the swagger spec.

## How facts get into this repo

Per `CONTRIBUTING.md`'s clean-room test: anything read directly off the
official spec is cited by its endpoint path and host. Anything that can
only be learned by calling the live API (a filter the server silently
ignores, a 200 response wrapping an error, an undocumented field) is
re-derived by a fresh call made from this project, dated, and covered by a
test — never carried over from an outside observation.

## Repository hygiene

Public files use synthetic placeholders and contain no private identities or session attribution. New
fixtures and observations must preserve that boundary while retaining enough provenance for their claims
to be checked.

## Decisions

`library/decisions.md` records design decisions as they are made (tool
grouping, safety defaults, the auth-degradation contract, the release
order, and so on). It records the current catalogue, validation, and
read-only transport rules; see it before changing those boundaries.

`library/account-scope-contract.md` records the public distinction between
account and geography requests, the refusal of genuinely unscoped search, and
the rule that client-side filtering is not a substitute for an upstream
account selector.

`library/endpoint-knowledge-tools.md` documents the `list_endpoints` and
`describe_endpoint` offline tools and the five evidence dimensions they
report for each catalogued endpoint.

`library/observations/by-plot-2026-09-04.md` records the first-party live
capture of `GET /land/deeds/{plot_id}` behind `land_deed_by_plot`.

`library/observations/land-deeds-search-details-2026-09-07.md` records the
three-array `data` shape (`deeds`, `worksite_details`, `staking_details`)
returned by `land_deeds_search`, measured at the M24 checkpoint gate.

`library/observations/land-stake-availability-2026-09-07.md` records the 14
live requests across the four stake-availability/grouped routes, none of
which returned a populated response — the evidence behind their exclusion
from the tool set.

`library/observations/land-projects-2026-09-06.md` records the measured
responses and request-shape observations for the four land-project tools.

`library/observations/main-host-declaration-2026-09-08.md` records the main host's
official declaration with its fetch URL, timestamp and SHA-256, and the measured
finding that the declaration is not a guide to access: it marks all 105 paths
JWT-gated, while 22 of 36 probed routes return real data with no token. Two
hypotheses about which routes are gated were tested and both falsified, so each
route needs its own probe.

`library/observations/collection-streaming-memory-2026-09-08.md` records the
collection route's eight-account size range, forced-GC diagnosis, production-
path memory runs, and the limits of those measurements.

`library/observations/player-routes-2026-09-08.md` records the player family's
undeclared profile route, the five different player selectors and the one error
message that misnames its own, which routes are gated, two further shapes of
broken paging, and what the probes did not establish.

`library/observations/land-regions-2026-09-07.md` records the measured
responses and request-shape observations for the region-counts, tract-counts,
and volume tools.

`library/observations/land-stake-2026-09-07.md` records the blank and populated
responses, route-specific wire types, and bad-uid behaviour for the two staking
tools.

`library/observations/land-stake-dec-2026-09-07.md` records the scalar,
object-or-array, row, and pending-claim responses for the four DEC staking
tools, including the distinction between incomplete region requests and a
valid no-stake region.

`library/CAPTURE-PLAN-result-contracts.md` and `library/FINDING-capability-failures.md`
are dated planning and diagnosis records for the endpoint-capture and
capability-failure work; later amendments are marked in place rather than
rewritten.

`library/observations/player-completion-2026-09-12.md` records the additional public player routes, selector probes, history limitations, and avatar redirect exclusion.

`library/observations/rankings-2026-09-12.md` records ranking sizes, top-N limits, repeated-offset results, season-id discovery, and the bounded presale capability.

- [Market and purchase observations](observations/market-2026-09-12.md)

- [Battle observations](observations/battles-2026-09-12.md)

- [Tournament observations](observations/tournaments-2026-09-12.md)

- [Guild observations](observations/guilds-2026-09-12.md)

- [Game metadata observations](observations/game-metadata-2026-09-12.md)

- [Conflict and proposal observations](observations/conflicts-proposals-2026-09-12.md)

`library/observations/vapi-market-2026-09-12.md` records public market metadata, asset filtering, output bounds and debug exclusions.

`library/observations/rentals-2026-09-12.md` records public V3 offers, bids, lowest prices, paging, quantity filters and decimal-price rejections.

`library/observations/collector-2026-09-12.md` records the complete public configuration and three explicitly authenticated exclusions.

`library/observations/plot-labels-2026-09-12.md` records live coordinate boundaries and the evidence constraints on a display-label resolver.

[Collection Land metadata replay](observations/collection-land-metadata-replay-2026-09-12.json) verifies selected-level abilities and normalized elements against the captured public definition catalogue; it does not verify collection instance or staking fields.

[Land stake availability client evidence](observations/land-stake-availability-client-2026-09-12.json) records the public editor's Power Core item queries and updates the earlier limited-bundle absence finding; populated upstream responses remain unverified.

[Player inventory evidence](observations/player-inventory-2026-09-12.json) records measured Land type narrowing, retained Token rows and Power Core coverage limits.

[Account market evidence](observations/vapi-market-account-2026-09-12.json) covers populated activity/listings/stats and the observed nonstandard offset behavior.

- [Hive transaction evidence](hive-transaction-evidence.md) — bounded history, full transaction and game reconciliation; dated limits resource.

- [Rental, delegation and collector evidence](observations/account-families-2026-09-13.md) — route disposition, bounded filters and drift-fixture repair.

- [Maintainer updates and specification review](maintenance.md)
\n- [Releases and updates](releasing.md) — audited initial history, release checks, canonical checkout and recovery.\n
