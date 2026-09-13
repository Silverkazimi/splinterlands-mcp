# Rental, delegation and collector completion evidence — 2026-09-13

Sources: the official VAPI Swagger at https://vapi.splinterlands.com/swagger/swagger-ui-init.js and bounded anonymous GET observations. Account selectors were discovered from public market records or collector featuredAccounts; no credentials were used.

## V3 rentals

Four player/role routes returned populated records. On each, two pages of two transaction IDs matched the first four records exactly. Amount ascending and descending produced ordered low/high slices. This is a bounded paging observation, not snapshot isolation.

Player offer/bid status=filled returned qtyAvailable=0. Offer numeric status remained1, so status alone does not establish whether the offer is filled. Rental status=pending and active returned numeric0 and1 respectively in the sample. Borrower/lender path and query roles were checked in both directions; the matching borrower and lender views returned the same rental IDs. Counterparty substring matched the expected borrower; an unmatched selector returned an empty list. Other sort keys and status values remain unmeasured.

Public offer/bid lists were also checked with combined player, amount ascending, maxPrice=1, minQuantity=1000 and maxQuantity=4500; returned rows matched the account and quantity bounds. Opposite participant filters produced empty lists. The prior decimal-price HTTP400 finding stands; prices are never rescaled silently.

Pending offers returned empty lists for three public participants. The specification declares a distinct PendingOfferResponse, but no populated wire result was observed. It is catalogued as an unverified exclusion, not exposed as a callable tool or described as authentication-gated.

## Delegations

Outgoing records name recipients; incoming records name delegators. A positive directed pair matched both directions' list views, including amount and transaction ID. Reversing that pair returned HTTP404. Another pair returned a dated object with amount0, so object presence does not imply a currently positive delegation. Nullable manual dates, decimal amount strings and rental-origin fields are retained. Outgoing two-page identity agreement was verified; incoming pagination and sort effectiveness remain qualified.

## Collector

The tradeable route returned26 and49 rows for two public featured accounts. Every captured row had isTradeable=true; original flags, IDs and relative cosmetic asset paths are retained. Results remain locally bounded. The sale route returned empty lists for both accounts and remains a dated unverified exclusion.

## Verification

Rental additions:53 focused tests and four built-stdio live reads passed. Delegations:39 focused tests and three built-stdio live reads passed. The full family regression run passed360/362; the two failures identified missing drift fixture bindings. A new regression additionally reproduced wrapped fixtures producing body-prefixed baseline paths. The generator now extracts the response body, all new fixtures are mapped, and the three drift plus three tradeable tests pass. Final combined checks are recorded in the next checkpoint.

Current interface:158 tools,189 catalogue entries,152 bound GET entries,37 exclusions and six resources. Read-only and unpublished.

Final family checkpoint: all eight new tools passed built-stdio live checks. Typecheck/lint/full privacy scan417 files with zero hits passed. Combined suite362/363 passed; the sole binary startup timeout passed unchanged in isolation. The final whole-suite gate remains after ongoing Land changes.
