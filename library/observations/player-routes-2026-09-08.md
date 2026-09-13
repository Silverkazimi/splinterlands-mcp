# Player route observations — 2026-09-08

## What was measured

Two unauthenticated probe passes on `api.splinterlands.com`, roughly 175 GET
requests in total, no token, header or cookie sent. The declaration was fetched
live rather than transcribed. Subjects were the accounts `vugtis`, `azircon`
and `bji`, one implausible name, and, for each route, one call with the player
selector omitted. No request was rate limited.

Every route below was probed individually. Nothing here is inferred from a
sibling route, because access on this host has already been measured not to
follow from any property of a route.

## The profile route is not in the declaration

`/players/details?name=<account>` is absent from the published declaration and
answers unauthenticated with a full profile payload. It is the profile route.
The declared `/players/details_by_id` takes a numeric id, and every
username-shaped value was rejected as not found.

This is the second route found to be both undeclared and open. The declaration
is a starting point for discovery here, not a boundary of it.

## Selectors differ across the family, and one error message misnames its own

Five different parameter names select a player, established from live responses
rather than from the declaration text:

| Selector | Routes |
|---|---|
| `username` | most of the family |
| `players` | `archived_balances`, `authorities`, `balances` |
| `player` | `recent_teams`, `richlist`, `richlist_ranking` |
| `name` | `details` (undeclared) |
| `id` | `details_by_id` (numeric) |

`players` is plural and accepts a comma-separated list: one call with two
accounts returned rows for both.

**`/players/archived_balances` misnames its own selector when it refuses.**
Omitting the parameter returns `"username" is required`, but `username` does
not work on that route — supplying it returns a 500 HTML error page. The
working selector is `players`. A caller following the error text is sent to a
parameter that fails.

## Gated versus open, each established individually

Gated, returning 401 naming the account: `/players/history` and
`/players/balance_history`. Both were re-confirmed live in this pass.

Open with real data, unauthenticated, including every route this project needs
for profile, rewards and referrals: `details` (undeclared), `current_rewards`,
`last_season_rewards`, `last_focus_rewards`, `unclaimed_balances`,
`unclaimed_balance_history`, `referral_users`, `referral_payments`,
`archived_balances`, `authorities`, `balances`, `lp_claim_history`,
`reward_delegation_history`, `reward_delegations`, `quests`, `inventory`,
`recent_teams`, `leaderboard`, `leaderboard_with_player`, `richlist`,
`richlist_ranking`, `skins`, `voucher`, `dec`, `card_airdrop`,
`energy_purchase_information`, `pack_purchases`, `daily_updates`, and the
burn-event routes.

`unclaimed_balances` and `unclaimed_balance_history` require `token_type`
alongside `username`; an earlier refusal on these was a missing parameter, not
a route limitation. `leaderboard_with_player` requires a real `season` value.

## Two further shapes of broken paging

Both were measured on two accounts, not one.

- `lp_claim_history` honours `limit` and **silently ignores `offset`**:
  `offset=0` and `offset=5` returned the identical rows.
- `reward_delegation_history` honours `limit` alone, but the **mere presence of
  `offset` collapses the answer to an empty array** — at any value, including
  `0`.

These are different failures, and neither reports an error.

## Bodies larger than this server's bound

`/players/inventory` returned about 986 KB for one account and
`/players/rebellion_presale_leaders` about 665 KB for every account tried. Both
exceed this server's 256 KB result bound. Neither was truncated upstream; the
bound is this server's own.

## What this does not establish

- **`details_by_id` with a genuine numeric id.** No numeric player id appears
  anywhere in the profile payload — it carries a UUID, a cosmetic avatar index
  and a guild hash, none of which is a player id. An id would have to come from
  outside this API to test the route.
- **Whether the referral routes honour `page` and `page_size`.** All three
  probed accounts have zero referral rows, so two page values returned the same
  empty envelope. Nothing about paging follows from that.
- **The `before_block` cursor on `/players/history`.** The route answers 401
  before producing a body, so the cursor cannot be measured without a token.
- **Whether anything truncates above 256 KB.** Two oversized bodies arrived
  whole; no request was built to provoke truncation.
- **`limit` and `offset` on the rest of the family.** Only the two routes above
  were paging-tested. `unclaimed_balance_history` declares both and was not
  tested; `balance_history` is gated.
- **`leaderboard` values** other than the default and `survival`.
