# Collection index, ownership fields, plot snapshot and deed bundle — 2026-10-11

Live public reads on 2026-10-11, without authentication.

## GET /cards/collection/{username}

- A collection row carried 60 fields. Every sampled row (8,073, 1,889 and 6,948 cards across three accounts)
  included `player`, `delegated_to`, `delegation_tx`, `rental_type`, `rental_date`, `rental_days`,
  `next_rental_payment`, `market_id`, `market_listing_type`, `market_listing_status`, `lock_days`,
  `unlock_date` and `last_transferred_date`, as either a value or null.
- The row's `player` is the owning account. A renter's collection includes rented-in cards whose `player` is
  the owner: one sampled card appeared in both the owner's and the renter's collection with the same
  `player`, `delegated_to` = renter, `rental_type` "daily", `rental_days` 615, `market_listing_type` "RENT"
  and `market_listing_status` 3.
- `rental_type` and `market_listing_type` were also set on cards that were listed but not rented
  (95 `season` listings, only 32 cards with a `rental_date`). Listing fields do not prove a rental.
- Types: `rental_days`, `lock_days` and `market_listing_status` are integers or null; the dates are ISO
  timestamps or null; the rest are strings or null. `cards_collection` projects these fields, renaming
  `player` to `owner`, and lists any absent field in `ownership_unknown`.
- About 410 bytes of heap per projected card were measured (125,000 synthetic copies ≈ 49 MiB). The
  collection index therefore holds at most 25,000 cards per username and 40,000 in total, for 120 seconds, so held and in-flight indexes stay under the 128 MiB parse guard.
- Through the built server: the first page of an 8,073-card collection took 12.4 s, one upstream read. The
  remaining 80 compact pages took 319 ms together, and a gold filter answered from the same index (694 cards).

## GET /land/deeds

- `region_number=65&limit=1000` returned 1,000 deeds in 3,608,198 bytes (2.5 s), and a player query with `limit=1000`
  returned 131 deeds in 518,266 bytes. Both exceed the general 2 MB cap, so `land_deeds_search` could not
  return their data. `offset=1000` for region 65 returned `{deeds: [], worksite_details: null, staking_details: null}`.
- `data` is `{deeds, worksite_details, staking_details}`. In region 65 there were 998 staking rows and
  778 worksite rows for 1,000 deeds, joined by `deed_uid`; every deed had at most one worksite row.
- `land_deeds_bundle` makes one such read through the streaming client, buffered up to an 8 MiB limit and parsed whole, projects it and pages it from a 120-second cache:
  region 65 gave 1,000 rows in 10 pages with one upstream GET, with 2 deeds missing a staking row.

## land_plot_snapshot

- Plot 065-01-001: the full snapshot (four GETs, follow-ups in parallel) took 1,418 ms;
  `include: ["deed", "stake_details"]` made two GETs in 326 ms.
