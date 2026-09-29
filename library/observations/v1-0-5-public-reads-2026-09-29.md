# Public read checks for v1.0.5 (2026-09-29)

These observations were re-derived through fresh, unauthenticated requests from this repository on 2026-09-29. The [main API](https://api.splinterlands.com/doc/) and [VAPI](https://vapi.splinterlands.com/) publish their specifications. Account names, deed identifiers and transaction identifiers are omitted from this public record.

| Route or workflow | Captured result | Scope |
| --- | --- | --- |
| `GET /players/dyk/{locale}` | Public tips and lore arrays | One locale; no claim for every locale |
| `GET /players/daily_updates` | Public enabled, announcement and did-you-know fields | One current response |
| `GET /players/burn_event_player?username=…` | Public player record | Explicit username required; omission gave HTTP 400 |
| `GET /players/burn_event_prizes?username=…` | Public prize summary | Explicit username required; omission gave HTTP 400 |
| `GET /land/liquidity/pools/{player}/all-no-vesting` | Public `data.all.positions` and fee fields | One player; route absent from sampled VAPI Swagger |
| `land_plot_snapshot` | Deed by plot, active project, stake details and stake assets | One verified plot; null active project valid; reads are not atomic |

All six tools above were exercised through a local MCP client backed by live public `fetch`. The plot snapshot made four upstream requests; each other tool made one. The snapshot returns no partial result and caps its combined answer at 256 KiB.

A live deed detail response contained `data.player`, now preserved as owner at read time. Listing fields describe the current listing state and do not establish purchase history. Sampled market activity returned buyer-matched purchases for `types=purchase`, seller-matched sales for `types=sale`, and both for `types=purchase,sale`. This does not establish complete indexing. Omitted `offset` returned five rows; explicit `offset=0` and `offset=1` returned empty rows. Rows included transaction, item and detail identifiers and USD value. Market landing accepted `PACKS`, `LAND` and `DEEDS` in sampled reads.

A public Land balance-history row contained nested token legs with token, amount, type, counterparty and transaction suffix fields. Public Hive `sm_marketplace_purchase` operations contained listing-item identifiers, while `sm_marketplace_list` contained listed item identifiers. A purchase listing identifier alone does not identify a sold deed.

The official [Hive condenser API](https://developers.hive.io/apidefinitions/condenser-api.html) documents `operation_filter_low`. A live filtered call returned old matching rows even with a recent start cursor. Server-side filtering remains excluded until cursor behavior is understood; the existing bounded local filter remains. A bounded sample of 20 reward-action transaction lookups for one currently owned deed did not establish a previous seller. The proposed no-scan seller recipe remains unverified.

## Lead disposition for this candidate

| Lead | Result |
| --- | --- |
| Market activity indexing and `types` | Corrected to the sampled buyer and seller behavior; tested offsets remain unreliable. |
| Deed owner | Public `player` preserved as owner at read time; listing fields describe current state. |
| Reward-action actor | Rows have transaction references but no actor; no prior-seller inference is exposed. |
| Hive server-side operation filter | Excluded because the sampled cursor behavior did not preserve a clear bounded window. |
| Market asset names | `PACKS`, `LAND` and `DEEDS` accepted in fresh public landing reads. |
| Marketplace operations | Purchase listing IDs and listing item IDs decoded in summaries, with synthetic malformed-shape tests. |
| Nested Land balance legs | Observed in a public history row and added as optional typed result fields. |
| Main-API coverage | Four newly observed public reads added. Existing catalogue exclusions remain documented in the README; unmeasured selector effects are not advertised. |
| VAPI coverage | The four public deed-project routes were already callable. One live-only liquidity route added; existing exclusions remain documented. The production-overview refactor needs a separate investigation. |
| Previous deed seller | The proposed bounded recipe was not reproduced in the 20-transaction sample; no seller tool added. |

Other route and selector candidates in the lead list need separate measured disposition. Authentication, signing, action routes and unrestricted chain scans remain outside this read-only candidate.
