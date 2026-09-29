# Leads 2026-09-29 — market and land reads

Status: **partly checked; unresolved portions remain leads.** Each item below came from outside this repository's clean-room process. Per
`CONTRIBUTING.md` and `library/index.md`, none of it is a fact here until it is re-derived by a fresh, dated call from
this project and covered by a test. Checked portions and corrections are recorded in `observations/v1-0-5-public-reads-2026-09-29.md`. Work them in order; record each result in `endpoint-observations.json` /
`observations/` with synthetic placeholders only.

Maintainer rule for this batch: every change is fully tested and live-verified, and the results are shown to the
maintainer **before** anything is pushed, tagged or released.

## 1. `vapi_market_player_activity` — seller-indexed feed and `types` behaviour
- Lead: sales appear in the **seller's** feed with `trxId`, `buyer`, `seller`, `itemId`, `detailId`, `price`,
  `currency`, `usdValue`, `purchaseSource`, `createdDate`, including land deeds (`itemId` = deed uid). A buyer's own
  query did not return that same purchase (`types=purchase` returned no rows for a buyer with a known recent purchase).
- Lead: `types=purchase,sale` returned rows where `types=sale` alone returned none for the same seller.
- Lead: for a land deed sale, `detailId` carried the deed's `item_detail_id` (e.g. `"295"`), `currency` was DEC or
  CREDITS, and `usdValue` matched the purchase's `total_usd` in `transactions/lookup`.
- To verify: pick a public recent deed sale (e.g. via a deed whose owner changed), call the feed for seller and for
  buyer with `purchase`, `sale`, `purchase,sale`; record which rows each returns. Then correct the tool description
  (it currently calls deed rows unconfirmed) and document the indexing and `types` behaviour.

## 2. `land_deed_by_uid` — current owner field
- Lead: `GET vapi /land/deeds/details/{deed_uid}` returns `player` (the current owner) and market fields
  (`listed`, `market_listing_id`); the tool's returned record did not include `player`.
- To verify: compare the raw upstream body with the tool output for one deed; if `player` is present upstream, expose
  it (documented as "owner at read time") with a test.
- Lead: the deed record's `market_updated_date` / `market_listing_id` did NOT change when the deed was bought (both
  stayed null after a completed purchase); they describe an active listing only. Document that they are not purchase
  history.

## 3. `land_resources_rewardactions` — rows carry no actor
- Lead: rows have `trx_id` but no player; `transaction_lookup` of that `trx_id` gives the acting account. For a deed
  that changed hands, the newest row signed by someone other than the current owner identifies the previous owner.
- To verify: for one deed, chain the two tools and confirm the actor; decide between documenting the pattern and an
  optional, bounded enrichment flag (one extra GET per row, capped).

## 4. `hive_account_history` — server-side operation filter
- Lead: condenser `get_account_history` accepts `operation_filter_low` (custom_json = bit 18, value `262144`), which
  returns only matching operations at the node instead of filtering locally after fetching every operation.
- To verify: against the pinned openhive-network source and one live call, confirm the parameter, its interaction with
  `start`/`limit`, and the result-size limits; if confirmed, pass it through when `operation_type`/`custom_json_id`
  is supplied, keeping the existing bounds.

## 5. Market asset names
- Lead: `vapi_market_landing` accepts `PACKS` and `LAND`; the on-chain marketplace listing operation uses
  `assetName: "DEEDS"` for land deeds; `POST /market/listing-items` rejected `assetName: "DEED"` with "Invalid assetName".
- To verify: capture the accepted names from the spec / a landing read; record them in the relevant tool descriptions.
  (Do not call the POST route here — see "Not in this batch".)

## 6. Market operation shapes for decoding
- Lead: custom_json ids and shapes seen on chain:
  - `sm_marketplace_purchase`: `{"items":[{"listingItemId":<n>,"quantity":1,"currency":"DEC","estimatedCost":<n>}],"market":"<site>","app":"<app>"}` (Active authority).
  - `sm_marketplace_list`: `{"assetName":"DEEDS","currency":"USD","items":[{"quantity":1,"price":<usd>,"itemId":"<deed uid>"}],"app":"<app>"}`.
  - `sm_marketplace_cancel` exists (shape not captured).
  - Game `transactions/lookup` for a purchase: `type: "marketplace_purchase"`, `result` `{"purchaser","num_items","total_usd","totals_by_currency":{…},"fees_by_currency":{…}}` — no item uid.
- To verify: decode one public example of each from `hive_transaction` / `transaction_lookup`; teach
  `transaction_inspect` / `hive_account_history` summaries to report listed `itemId`s and purchase listing ids.

## 7. `land_resources_balances_history` — nested token legs
- Lead: each row carries a `balance_history` array of token legs (e.g. DEC and LP-share legs for swaps and liquidity
  adds) with `type`, `counterparty` and per-leg `trx_id` suffixes (`<trx>-1`, `-2`).
- To verify: capture one swap and one add-liquidity row; document the nested array in the tool description and result
  contract.

## 8. api2 spec coverage (spec unchanged since the 2026-09-13 drift baseline: 105 paths, 106 operations)
- Not catalogued, public reads: `/players/burn_event_player`, `/players/burn_event_prizes`, `/players/daily_updates`,
  `/players/dyk/{locale}`. (Also not catalogued, correctly out of scope: `POST /battle/battle_tx`,
  `/players/v2/login`, `/players/v2/logout`.)
- Catalogued without a tool, public-read candidates: `/cards/stats`, `/players/details_by_id`,
  `/tournaments/crown_pot`, `/tournaments/frays`, `/purchases/status` (an earlier probe returned empty). The other
  toolless entries `/players/referral_users` and `/players/referral_payments` returned public data in recorded
  probes and remain no-login candidates. `/battle/history`, `/battle/history2`, `/battle/battle_teams_info`,
  `/players/history`, and `/players/balance_history` are deferred under the login-dependent task;
  `/battle/submit_ptr` is excluded as an action route.
- Spec parameters missing from catalogued public entries: `/players/unclaimed_balance_history` (`limit`, `offset`,
  `types`), `/players/inventory` (`type`, `username`), `/players/details_by_id` (`format`, `id`, `season`,
  `season_details`), `/players/recent_teams` (`decrypt_key`).
- To verify: catalogue the four public routes with dated observations; for each toolless public entry decide tool vs
  documented exclusion; add the missing parameters with measured effect (forwarded, ignored or refused).

## 9. vapi spec coverage (spec unchanged since the 2026-09-13 drift baseline: 100 paths)
- Not catalogued, public-looking reads: `/land/projects/deed/{deedUid}/active`, `/land/projects/deed/{deedUid}/list`,
  `/land/projects/deed/{deedUid}/list/count`, `/land/projects/deed/{deedUid}/requirements`. (The `/collector/me/*`
  routes are account-private and stay out of scope; `POST /market/listing-items` is under "Not in this batch".)
- Catalogued without a tool: `/land/deeds/details/id/{plotId}`, `/land/liquidity/landpools`,
  `/land/liquidity/voucherpool`, `/land/liquidity/pool/rewards/{token}/{poolId}`, `/land/liquidity/pools/{player}/{token}`,
  `/land/resources/balances/history/{player}/{regionuid}` (+ `/count`), `/land/resources/liquidity/history/swaps/{pool}/{player}`,
  `/land/resources/titles/assigned/{player}`, `/land/stake/cards/{stakeTypeUid}/available`,
  `/land/stake/cards/{stakeTypeUid}/grouped`, `/collector/{player}/stickers/for_sale`, `/delegation-rental/bids`,
  `/delegation-rental/v3/offers/pending/{player}`; `/land/resources/production/overview` and
  `/land/resources/production/region/overview` (previously observed 401). The two `/market/debug/*` routes stay excluded.
- Spec parameters missing from catalogued entries: `/land/deeds` (`status`),
  `/land/resources/balances/history/{player}/{regionuid}` (`startDate`, `endDate`, `resource`, `limit`, `offset`) and its
  `/count` (`startDate`, `endDate`, `resource`).
- To verify: same as item 8; note that the spec declares token authentication on the `/land/resources/*` and `/land/liquidity/*`
  families while many answer without it — record per route what was measured.

## 10. Composed read: who sold a deed, and to whom (no chain scan)
- Lead: the buyer's side never names the bought item (the purchase names only a listing id). A fully public chain did:
  deed -> `land_resources_rewardactions` (newest rows) -> `transaction_lookup` of a row whose actor is not the current
  owner -> that actor's `vapi_market_player_activity` (`types=purchase,sale`) -> the row whose `trxId` equals the
  purchase and whose `itemId` is the deed. Current owner confirmed by the deed record (item 2).
- To verify: reproduce on one public deed sale; then decide between documenting the recipe (knowledge tool) and a
  bounded composite tool (fixed call cap, every link required, returns null when any link is missing).

## Deferred login-dependent reads (dedicated future task)
- No login, access token, authenticated probes, or signing work belongs to this batch.
- Confirmed unauthenticated 401: main API `/players/history`, `/players/balance_history`,
  `/battle/history`, `/battle/history2`, `/battle/battle_teams_info` (measured request shape),
  and `/dailies/progress`; VAPI `/land/resources/production/overview` and
  `/land/resources/production/region/overview`.
- Token authentication declared by VAPI, runtime not probed: `/collector/me`, `/collector/me/stickers`,
  `/collector/me/binders/{binderId}`. The main API `/players/v2/login` and
  `/players/v2/logout` are auth lifecycle routes, outside the read-only batch.
- The public `/cards/collection/{username}` route returned null `last_used_date` in the
  unauthenticated sample. Whether authentication unlocks that field is unverified.
- Do not infer access from a host-wide or family-wide authentication declaration. In particular,
  `/players/referral_users` and `/players/referral_payments` returned public data in recorded
  probes; they are not deferred for login.

## Not in this batch (need a maintainer decision first)
- `POST /market/listing-items` (active listing items by asset and filters; returns `listingItemId`, `itemId`, `player`,
  price): would need an exception to the GET-only transport.
- Authenticated `/players/history` and `/players/balance_history`: out of scope by the runtime boundary (no credentials).
- No official route was found for: listing id -> item of a **sold** listing, external withdrawal / swap settlement
  status, incoming transfers by account.
