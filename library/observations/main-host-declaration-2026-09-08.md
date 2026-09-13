# The main host's declaration, audited and measured against — 2026-09-08

The Tier 3 catalogue audit. Two findings matter more than the inventory: the
official declaration is **not** a guide to access on this host, and **no
property of a route predicts whether it is open**.

## The declaration

Fetched independently, not transcribed:

| | |
|---|---|
| Source | `https://api2.splinterlands.com/doc/swagger-ui-init.js` |
| Fetched | `2026-09-08T08:30:33Z`, HTTP 200 |
| SHA-256 | `5186c675fb53a13c14c852803b2638232ad111796fb67991e7591224fde4f9ab` |
| Shape | Swagger 2.0, host `api.splinterlands.com`, basePath `/` |
| Size | **105 distinct paths, 106 operations** — 104 GET, `/players/v2/login` declared GET *and* POST, and `POST /battle/battle_tx` |

The embedded document was extracted with a brace-balanced parser rather than a
regex. The method count was taken fresh; it matches the architecture plan's 104
GET exactly.

## What the declaration says about access, and why it cannot be used

Global security is `{"jwt":[]}`. **All 106 operations were checked for a
per-operation override. There are none.** Read literally, every route on this
host requires a token.

**Measured, that is decisively wrong.** Across two unauthenticated probes
covering 36 routes:

- **5 are gated**: `/battle/history`, `/battle/history2`, `/players/history`,
  `/players/balance_history`, `/battle/battle_teams_info` — each returning an
  identical 401 naming the account.
- **22 answered 200 with real, substantive data**, including every
  "obviously personal" route tried: `/players/balances`, `/authorities`,
  `/inventory`, `/quests`, `/current_rewards`, `/recent_teams`.
- **`/cards/collection/{username}` is absent from the declaration entirely and
  is wide open**, returning real holdings.

## No property of a route predicts access

Two hypotheses were tested and both failed:

- **"Personal data gated, reference data open."** Falsified — most personal
  routes are open.
- **"History-shaped routes are gated."** Falsified from both directions:
  `/players/lp_claim_history`, `/players/reward_delegation_history` and
  `/market/history` are open, while the non-history `/battle/battle_teams_info`
  is gated.

**The declaration's own per-route signal is no better.** Six paths carry an
optional `authorization` parameter. One of those is gated; three are wide open.

**So each main-host route needs its own live probe before it can be marked open
or gated.** On ~105 paths that is a real cost. It is also the only honest
option: the alternative is a catalogue whose access classifications are guesses
formatted as measurements.

## Two constraints this audit was run under, and what they caught

**"No spec omission proves a legacy route disappeared."** `/cards/collection/
{username}` is absent from the declaration and was recorded as *absent from the
declaration*, not as gone. It then measured wide open — so absence from the
document predicts nothing about access either.

**"Correct method counts rather than importing historical totals."** The count
was retaken and the plan's figure held. What the plan does not carry:
`/players/v2/login` is declared GET as well as POST.

## Other findings

- The declaration has **zero non-empty `description` fields**. The plan's
  characterisations of `/battle/history` as 401, `/battle/submit_ptr` as a write
  in GET clothing, and `/players/daily_updates` and `/players/dyk/{locale}` as
  marketing copy are **reasonable readings, not spec-stated facts**.
- **No query parameter is declared required anywhere on this host**; only two
  path segments are.
- **`/settings` carries no response schema at all**, which supports the plan's
  *"fetched live, never transcribed"* instruction by omission rather than by
  statement.
- **Two declared routes are missing from the architecture inventory**:
  `/players/burn_event_player`, `/players/burn_event_prizes`.
- One inventory entry implies `/players/season`; the declared path is top-level
  **`/season`**.
- Ambiguous and recorded as such, not resolved: `/market/status?id=1`,
  `/battle/battle_queue`, `/cards/trx_lookup`, `/market/rental_history` and
  `/tournaments/battles` returned 200 with an empty array or a 200-wrapped
  validation error. On this API that means *not confirmed as delivering data*,
  which is not the same as gated.

## Scope of these claims

36 routes of 105 were probed. **Any statement about the other 69 is an
inference, not a measurement**, and is not recorded here as one.
