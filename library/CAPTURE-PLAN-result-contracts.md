# Capture Plan for the 14 Empty Result Contracts

Plan basis: catalogue manifest SHA-256 `e769af80dc4789216cad6d922afd5cf28deb5b65cbfaf7aeae7dc24235d1358b` on 2026-09-04. This is a read-only planning artifact. The planning pass made no network request, captured no payload, and does not claim any unobserved response shape.

## 1. Authority, evidence boundary, and exact split

The repository's clean-room rule allows API facts from Splinterlands' official Swagger/OpenAPI material and support site, while behavior that is only knowable from the live API must be re-derived by a fresh call from this repository (`library/index.md:3-24`; `CONTRIBUTING.md:7-22,53-56`). The catalogue model permits only seven `valueClass` values and represents a result contract as an envelope, a fingerprint, and required key paths (`src/catalogue/schema.ts:7-16,34-52`). When the input manifest omits `resultContract`, generation creates an object-shaped VAPI envelope with an empty fingerprint and no required paths (`scripts/gen-catalogue.ts:21-35`).

The repository has no retained Swagger snapshot or endpoint table. Its paths came from the repository brief, and its decision is to keep response fingerprints empty until an official specification or a repository-made observation supports them (`library/decisions.md`, “catalogue is generated data,” second paragraph). The manifest itself contains populated fingerprints for eight routes and omits `resultContract` for the 14 listed below. A repository-wide file listing and response-evidence search at plan time found no held-response artifact for any of those 14; the only response observation found was for the already-populated by-plot route. Because an external OpenAPI declaration is not a response and no such snapshot is retained here, the strict three-way classification for **each of the 14 is “no held response at all.”** The categories “only an OpenAPI declaration retained as response evidence” and “incomplete held real response” contain zero of these 14.

The already-populated by-plot fingerprint includes a `name`-classed player, categorical state, identifiers, timestamps, and numeric fields (`scripts/catalogue-input.json:2091-2219`). “Populated” therefore means only that some field evidence exists; it does not establish that one sample exhausted every optional or nullable state. This is why the recipes below use stratified multi-sampling.

### Populated contracts: 8

| Endpoint id | GET path | Required parameters | Check |
|---|---|---|---|
| `vapi.land.deeds.search` | `/land/deeds` | none; `limit`, `offset`, `orderBy`, `resource_symbol`, and `territory` are optional query parameters | Declaration at `scripts/catalogue-input.json:3-39`; populated variant/default contracts begin at lines 40 and 1400. |
| `vapi.land.deeds.by-plot` | `/land/deeds/{plot_id}` | path `plot_id`: integer | `scripts/catalogue-input.json:2078-2093`; fingerprint continues through line 2219. |
| `vapi.land.deeds.owned` | `/land/deeds/owned/{player}` | path `player`: string, player name | `scripts/catalogue-input.json:2252-2267`; fingerprint continues through line 2293. |
| `vapi.land.projects.deed-active` | `/land/projects/deed/{uid}/active` | path `uid`: string | `scripts/catalogue-input.json:2296-2311`; fingerprint continues through line 2441. |
| `vapi.land.stake.deeds-assets` | `/land/stake/deeds/{uid}/assets` | path `uid`: string | `scripts/catalogue-input.json:2486-2501`; fingerprint continues through line 2741. |
| `vapi.land.stake.cards-available` | `/land/stake/cards/{code}/available` | path `code`: string | `scripts/catalogue-input.json:2759-2774`; fingerprint continues through line 2788. |
| `vapi.land.stake.cards-grouped` | `/land/stake/cards/{code}/grouped` | path `code`: string | `scripts/catalogue-input.json:2791-2806`; fingerprint continues through line 2820. |
| `vapi.land.stake.items-available` | `/land/stake/items/{code}/available` | path `code`: string | `scripts/catalogue-input.json:2823-2838`; fingerprint continues through line 2865. |

### Empty contracts: 14

Every row below has evidence state **no held response at all**. The manifest (SHA-256 recorded above) has no `resultContract` for these rows, so the generator supplies the empty contract described above. No required query parameter is declared for any row.

| Endpoint id | Exact GET path | Required parameters | Where absence was checked |
|---|---|---|---|
| `vapi.land.deeds.details-by-uid` | `/land/deeds/details/{deed_uid}` | path `deed_uid`: string | Manifest declaration and omission at `scripts/catalogue-input.json:2222-2234`; repository evidence rule in `library/decisions.md`, “catalogue is generated data,” paragraph 2. |
| `vapi.land.deeds.details-by-id` | `/land/deeds/details/id/{plotId}` | path `plotId`: integer | `scripts/catalogue-input.json:2237-2249`; same evidence rule. |
| `vapi.land.projects.list` | `/land/projects/list` | none | `scripts/catalogue-input.json:2444-2448`; same evidence rule. |
| `vapi.land.projects.list-count` | `/land/projects/list/count` | none | `scripts/catalogue-input.json:2451-2455`; same evidence rule. |
| `vapi.land.projects.requirements` | `/land/projects/requirements` | none | `scripts/catalogue-input.json:2458-2462`; same evidence rule. |
| `vapi.land.regions.counts` | `/land/regions/counts` | none | `scripts/catalogue-input.json:2465-2469`; same evidence rule. |
| `vapi.land.tracts.counts` | `/land/tracts/counts` | none | `scripts/catalogue-input.json:2472-2476`; same evidence rule. |
| `vapi.land.volume` | `/land/volume` | none | `scripts/catalogue-input.json:2479-2483`; same evidence rule. |
| `vapi.land.stake.deed-details` | `/land/stake/deed/details/{uid}` | path `uid`: string | `scripts/catalogue-input.json:2744-2756`; same evidence rule. |
| `vapi.land.stake.items-grouped` | `/land/stake/items/{code}/grouped` | path `code`: string | `scripts/catalogue-input.json:2868-2880`; same evidence rule. |
| `vapi.land.stake.dec-overall` | `/land/stake/dec/overall` | none | `scripts/catalogue-input.json:2883-2887`; same evidence rule. |
| `vapi.land.stake.dec-region` | `/land/stake/dec/region` | none | `scripts/catalogue-input.json:2890-2894`; same evidence rule. |
| `vapi.land.stake.dec-staked` | `/land/stake/decstaked` | none | `scripts/catalogue-input.json:2897-2901`; same evidence rule. |
| `vapi.land.stake.evp-pending-claim` | `/land/stake/evp/pending-claim` | none | `scripts/catalogue-input.json:2904-2908`; same evidence rule. |

### Reconciliation note (2026-09-07)

Later named-player captures returned 150 populated region rows and 36 populated tract rows for `vapi.land.regions.counts` and `vapi.land.tracts.counts`, respectively. See `tests/evidence/land-result-contract-evidence.json:1014-1018` and `:1039-1043`; corresponding catalogue entries are at `:1899` and `:3406`. This note records the later evidence without altering the dated plan-time list above.

## 2. Capture gate that applies before any endpoint request

The network-enabled executor must perform these steps in order. A failed step stops only the affected endpoint; it never licenses a guess.

1. Fetch the current official VAPI Swagger/OpenAPI document starting from `https://vapi.splinterlands.com/`, following the Swagger UI's declared specification link mechanically. Save the specification's SHA-256, retrieval timestamp, final specification URL, and byte count. The official source is identified at `library/index.md:7-15`.
2. For all 14 operations, compare host, method, path, path/query parameter names, primitive types, and required flags with the catalogue. Do not call a route whose required parameter semantics cannot be resolved. Record a `catalogue_metadata_mismatch` if the official operation differs.
3. Treat `{code}` as account-sensitive unless the official parameter description explicitly proves a non-account meaning. The manifest currently labels it a non-player field (`scripts/catalogue-input.json:2870-2877`), but the repository contains no evidence explaining what it denotes. Silence is not proof.
4. Run every request through the no-name quarantine in section 4. Do not use a command whose argv contains a sensitive value; do not enable verbose HTTP, access, trace, or redirect logging.
5. Count a sample only when it is a distinct retrieval event with HTTP 2xx and a usable success payload. An empty body, an HTML/WAF body, a VAPI error envelope, or a gated response is an attempt, not a successful sample.
6. Normalize every array index to `[]` when deriving key paths. Record every path's presence, null state, JSON type, and semantic-class evidence per sample before attempting a contract.

The catalogue binder derives a strict input schema from declared path/query parameters and sends the resolved symbolic host, branded path, query values, and selected validator to the GET client (`src/catalogue/index.ts:120-131,160-194`). Capture tooling must use the same catalogue declaration as its request metadata source, while keeping sensitive runtime values in quarantine. It must **bypass result-contract validation for raw capture**: populated neighbor contracts are exact and may reject the deliberately diverse seed/preflight responses. Capture datum means HTTP status plus parsed JSON; a 2xx envelope whose success/error meaning is ambiguous is retained in quarantine as unresolved and does not count as success.

## 3. Exact capture recipes and sample requirements

All requests use HTTPS GET against `vapi.splinterlands.com`; no authentication or credential may be added. `T0`, `T0+6h`, and `T0+24h` mean separate retrieval events no earlier than those offsets. The field lists below are **variation targets, not predeclared response fields**.

### 3.1 Deed-specific routes

First make a fresh quarantined dependency capture of the populated `GET /land/deeds?limit=100&offset=N`, with `N = 0, 100, 200, 300, 400` until the four strata below are found. The populated search contract establishes `data.deeds[].deed_uid` and `data.deeds[].plot_id` as result paths (`scripts/catalogue-input.json:1435-1439,1503-1507`). Keep the selected IDs only in the capture process's volatile state; parameter values and resolved request URLs never enter evidence.

Deduplicate the combined five-page candidate set by `deed_uid`, then sort by numeric `plot_id` ascending and `deed_uid` lexicographically as the tie-breaker. Select four distinct records mechanically, in this order:

1. first record where `listed === false`, `is_construction === false`, `castle === null`, and `keep === null`;
2. first record where `listed === true`;
3. first record where `is_construction === true`;
4. first record where `castle !== null || keep !== null` (a non-null branch target, not a semantic claim about the value).

If a record qualifies for two strata, use it only for the earlier stratum and continue for a distinct record. If five pages do not supply all strata, record `coverage_shortfall` with the missing stratum and leave the affected contract empty. These states are required because a random deed sample can leave listing, construction, and castle/keep branches null or absent, which would not establish their populated types.

| Endpoint | Exact request and parameter source | Required successful samples | Why / expected variation |
|---|---|---:|---|
| `vapi.land.deeds.details-by-uid` | `GET /land/deeds/details/{deed_uid}` once for each of the four selected records. Obtain each real `deed_uid` from that record's fresh search result; never type or copy an identifier into a recorded command. | 4 distinct deed UIDs | Listed, construction, castle/keep, idle, market, unlock-date, resource, worksite, and nullable branches may differ. Do not borrow the by-plot shape. |
| `vapi.land.deeds.details-by-id` | `GET /land/deeds/details/id/{plotId}` once for each of the same four records. Obtain each integer `plotId` from `data.deeds[].plot_id` in memory. | 4 distinct plot IDs | Same state coverage, but this endpoint must be fingerprinted independently; matching identifiers do not prove matching envelopes or fields. |
| `vapi.land.stake.deed-details` | `GET /land/stake/deed/details/{uid}` for four distinct search-harvested deed UIDs. Preflight candidate UIDs through the already-populated deed-active and deeds-assets calls, then select: first active-project deed, first with a non-empty cards array, first with a non-empty items array, and first with both asset arrays empty. Reuse no UID across strata. | 4 distinct UIDs | Project state, card/item branches, owner/manager fields, rates, amounts, and nullable timing fields are expected to vary. If four strata cannot be found in five search pages, record `coverage_shortfall` and leave empty. |

Preflight responses are supporting evidence only. A populated neighbor endpoint may supply or validate an identifier, but its response shape must never be donated to an empty endpoint.

### 3.2 Project/configuration routes

| Endpoint | Exact request and parameter source | Required successful samples | Why / expected variation |
|---|---|---:|---|
| `vapi.land.projects.list` | `GET /land/projects/list`; no parameters. Capture at `T0`, `T0+6h`, `T0+24h`. | 3 | Project types/states, record count, progress, resource IDs, rates, timestamps, nullable branches, and array occupancy may change. Inspect every element, not only the first. |
| `vapi.land.projects.list-count` | `GET /land/projects/list/count`; no parameters. Capture immediately after each projects-list sample in the same three batches. | 3 | Paired counts/aggregates can vary with the list. Pairing supplies a consistency check without assuming an equality not documented by the API. |
| `vapi.land.projects.requirements` | `GET /land/projects/requirements`; no parameters. Capture at `T0` and `T0+24h`. | 2 | A likely configuration collection can expose row heterogeneity in one response; the second retrieval detects deployment-time omission or shape drift. Project/resource categories and quantities are only hypotheses until observed. |

### 3.3 Global count and volume routes

| Endpoint | Exact request and parameter source | Required successful samples | Why / expected variation |
|---|---|---:|---|
| `vapi.land.regions.counts` | `GET /land/regions/counts`; no parameters. Capture at `T0`, `T0+6h`, `T0+24h`. | 3 | Counts, per-region records, category occupancy, and timestamps may vary; inspect all elements. |
| `vapi.land.tracts.counts` | `GET /land/tracts/counts`; no parameters. Capture at the same three batch times. | 3 | Counts, per-tract records, category occupancy, and timestamps may vary; inspect all elements. |
| `vapi.land.volume` | `GET /land/volume`; no parameters. Capture at the same three batch times. | 3 | Totals, rolling windows, amount representation, nullability, and timestamps may vary. |

### 3.4 Grouped item route

The meaning and source of `{code}` must be settled from the freshly fetched official operation before any request. Apply this deterministic branch:

- If the official description says account/player identifier, the operator supplies five real candidate values they control or have explicit permission to use through five hidden-input/runtime slots. Run the already-populated items-available endpoint in quarantine for all five, order candidates by observed `data.ids` length with input ordinal as the tie-breaker, and select the minimum, median, and maximum.
- If the official description says a non-account code, obtain five valid values from an official enum/example or from the exact official source endpoint named by that description, preflight through items-available, and select minimum/median/maximum by the same rule.
- If the specification does not establish the meaning and valid source, make zero speculative grouped calls. Record `undocumented_parameter` and leave the contract empty.

If fewer than five authorized/documented candidates are available, record `input_coverage_shortfall`, make no grouped request, and leave the contract empty. Operator familiarity, an undocumented value copied from a UI, or a value guessed from another endpoint is not an acceptable source.

Then make `GET /land/stake/items/{code}/grouped` once for each of the three selected values: **3 distinct successful samples**. Three inventory sizes are required to expose empty, sparse, and diverse grouping branches. Expected variation includes group count, item arrays, IDs, quantities, and possibly account-valued leaves, but none is predeclared.

### 3.5 DEC and pending-claim routes

| Endpoint | Exact request and parameter source | Required successful samples | Why / expected variation |
|---|---|---:|---|
| `vapi.land.stake.dec-overall` | `GET /land/stake/dec/overall`; no catalogue parameters. Capture at `T0`, `T0+6h`, `T0+24h`. | 3 | Balance/stake aggregates, quantities, and timestamps may vary. |
| `vapi.land.stake.dec-region` | `GET /land/stake/dec/region`; no catalogue parameters. Capture in the same three batches. | 3 | Region group occupancy, IDs, quantities, and timestamps may vary. |
| `vapi.land.stake.dec-staked` | `GET /land/stake/decstaked`; no catalogue parameters. Capture in the same three batches. | 3 | Staked amounts, grouping, nullability, and timestamps may vary. |
| `vapi.land.stake.evp-pending-claim` | `GET /land/stake/evp/pending-claim`; no catalogue parameters. Capture in the same three batches. | 3 | Pending amounts/status, empty-vs-non-empty state, and timestamps may vary; this route may instead prove permission-gated. |

If the fresh official spec declares a required player/account query parameter that the catalogue omits, stop before the call, record `catalogue_metadata_mismatch`, and correct request metadata in a separately reviewed lane. Do not silently add a query parameter to the recorded recipe.

## 4. Absolute no-account-name capture rule

`CONTRIBUTING.md:61-81` is absolute: no account name may enter this repository in content, path, filename, URL, example, default, or a list of forbidden names. The present leak checker is explicitly not sufficient assurance until both content and filename failures are proved (`CONTRIBUTING.md:83-89`). Therefore a green leak-check is only a supplementary check, never the evidence that this protocol succeeded.

### 4.1 Supplying a player/account parameter without recording it

1. The capture launcher accepts sensitive values only from a hidden interactive stdin/file descriptor or inherited process environment populated outside the repository. Use ordinal labels such as `CAPTURE_SUBJECT_1`; never use the value in a filename, `.env` file, default, example, shell command, or shell history.
2. The launcher constructs the URL inside its own process. The sensitive value must not appear in argv or in a child process list. Disable echo, verbose mode, redirect following, request/response tracing, access logs, exception dumps containing URLs, and shell xtrace.
3. The launcher records only `pathTemplate`, parameter name, primitive type, and source label such as `hidden-input-1`. It never records the expanded URL or parameter value.
4. Raw response bytes remain outside the repository boundary in a mode-0700 quarantine directory, or preferably only in memory. Compute the raw SHA-256 in the capture process. No raw body, log, cache, crash dump, or temp filename may be created under the repository.
5. Before any repository write, parse, classify, pseudonymise/redact, serialize canonically, scan the candidate content **and candidate path**, then write. Replace every `freetext` string with the exact constant `[redacted]`. Any failure destroys the candidate and leaves the contract empty.

This rule applies to the declared `{player}` dependency endpoint and to every `{code}` route until official documentation proves that `code` is not an account identifier.

### 4.2 Name paths and automatic pseudonymisation

Normalize arrays to `[]`. Every account-valued leaf is `valueClass: name` and every distinct real account value is replaced consistently within the entire endpoint evidence set by clearly synthetic `__synthetic_player_a__`, `__synthetic_player_b__`, and so on. The replacement map remains only in quarantine and is never committed.

The already established account paths that any reusable capture/pseudonymisation machinery must know are:

- `data.deeds[].player` and `data.staking_details[].manager` on deed search;
- `data.player` on by-plot;
- `data.cards[].player` and `data.items[].player` on staked deed assets.

The catalogue confirms those declarations (`scripts/catalogue-input.json:1498-1502,2138-2141,2613-2617,2705-2709`).

For each new payload, automatically taint as `name`:

- any string equal to a sensitive input value;
- any string at a leaf whose exact semantic key is `player`, `owner`, `manager`, `account`, `username`, `delegated_to`, `delegated_from`, `renter`, `seller`, or `buyer`;
- any alias that the current official schema explicitly describes as a player/account identity;
- any string equal to a value already tainted as `name` elsewhere in the same capture set.

This is a semantic-key list, not a list of account values. Do not class every `*.name` as `name`: a card, item, project, map, region, or resource name can be an enum, identifier label, or freetext rather than an account.

No exact target-response `name` path is known for any of the 14 before capture. Likely account paths such as `data.player` on the two empty deed-detail routes, and `data.player`, `data.manager`, `data.cards[].player`, or `data.items[].player` on the empty staked-deed route, are **quarantine candidates only**, not declarations. They become contract paths only if observed. For every endpoint, store the exact discovered name-path list and pseudonym count in the sanitized manifest; never store the original/replacement map.

Every string leaf must match one evidence-backed rule in section 5 before serialization. A string matching none is `unclassified`; reject the whole endpoint evidence set. `opaque` is not a safe fallback for an unclassified string.

## 5. `valueClass` assignment and its honest limits

JSON `type` comes only from parsed live values. The following table controls semantic classing; field spelling is a lead, not proof.

| Observed key-path/value semantics | Class | Mechanical evidence required |
|---|---|---|
| Object, array, or null structural node | `opaque` | Direct JSON type. A null establishes only null in that sample, not the eventual non-null type. |
| Splinterlands account identity | `name` | Official field semantics, equality to a tainted input, a semantic account key, or equality to another proven name leaf. Pseudonymise before ingress. |
| Human-authored prose, message, description, or note | `freetext` | Official semantics identify unbounded prose. Replace the value with one fixed redaction token before ingress. Error messages are failure evidence, not success-contract fields. |
| Date/time instant | `timestamp` | Official date/time schema, or all non-null samples parse the documented timestamp format and semantics establish an instant. Durations and block numbers are not timestamps. |
| Boolean or finite categorical domain | `enum` | Boolean type, or an official finite enum. A small set of observed strings alone does not prove an enum. |
| Entity/transaction/foreign-key identity | `id` | Official semantics or equality with an independently established identifier. An `_id`/`uid` spelling alone is insufficient. |
| Count, amount, price, rate, duration, coordinate, measurement, or other arithmetic quantity | `numeric` | Official semantics or cross-sample arithmetic behavior. Preserve actual JSON type; numeric-looking strings remain strings. |
| Non-sensitive machine token/hash/blob with deliberately uninterpreted semantics | `opaque` | Official semantics prove it is machine data and rule out account identity/freetext. Never use this as the generic “unknown” class. |

### Endpoint-specific class expectations

These rules are deliberately conditional because none of the 14 has a held response:

- All 14: if an observed top-level `status` is documented as a finite API status, class it `enum`; if `data` is an object/array/null container, class that node `opaque`. Neither path is predeclared until observed.
- The two deed-detail routes: observed deed, plot, region, tract, resource, market, transaction, and foreign-key values are `id` only after the identifier relationship is established; observed ownership/account leaves are `name`; dates/unlock instants are `timestamp`; counts/rates/amounts/durations are `numeric`; documented finite deed/resource/rarity/worksite states are `enum`. Structured strings analogous to `land_stats` or `stats` remain unresolved until decoded rather than being guessed from their string type.
- Project list/count/requirements: proven project/resource IDs use `id`; finite project/resource/status categories use `enum`; counts, progress, rates, and required quantities use `numeric`; instants use `timestamp`; any account fields use `name`; prose descriptions use `freetext`. Exact paths remain unknown until capture.
- Region/tract counts: proven region/tract keys use `id`; finite category labels use `enum`; counts use `numeric`; account identities, if any, use `name`. Region/tract display text is not automatically an account `name` class.
- Volume and three DEC routes: balances, totals, volumes, rates, and counts use `numeric`; proven region/asset IDs use `id`; finite window/status/unit labels use `enum`; instants use `timestamp`; account identities use `name`.
- Staked-deed details: proven deed/card/item/project IDs use `id`; card/item/project/resource categories use `enum` only with finite-domain evidence; power, rates, quantities, and durations use `numeric`; instants use `timestamp`; all owner/player/manager identities use `name`; human prose uses `freetext`.
- Grouped items: proven item/group IDs use `id`; quantities use `numeric`; official finite item/group categories use `enum`; account identities use `name`; containers and proven machine tokens use `opaque` under the table above.
- Pending claim: claim/reward IDs use `id` only with identity evidence; amounts/counts use `numeric`; finite claim status uses `enum`; instants use `timestamp`; account fields use `name`; any human-authored message uses `freetext`.

If several samples do not settle a path, record it as `unclassified` in quarantine and do not emit a fixture or contract. A wrong class can either leak an identity or destroy useful data through redaction; it is worse than an empty contract.

## 6. Contract derivation and representability gate

For each endpoint, the generator—not an editor—must derive:

1. the union of observed normalized key paths, with a per-sample presence bitmap;
2. every observed JSON type per path, including null;
3. the evidence supporting every semantic class;
4. candidate required paths as the intersection of paths present in all successful samples;
5. a canonical candidate contract and its SHA-256 only if current schema/matcher semantics can represent every observed response.

Contract and fixture paths are separate representations. Contract paths normalize array indexes to `[]`. Each committed sample must be its own fixture envelope, and its `valueClasses` keys must expand the normalized declaration to every concrete indexed leaf (`data.ids[].uid` becomes `data.ids[0].uid`, `data.ids[1].uid`, and so on) because the current fixture guard walks concrete `[index]` paths (`scripts/leak-check.ts:457-520`). If the future evidence layout cannot perform that expansion, it must wait for a separately approved fixture-guard/schema change rather than land a fixture the guard cannot validate.

The current matcher does more than check `requiredKeyPaths`: it computes the whole observed fingerprint and exact-compares it with the declared fingerprint, while an empty fingerprint accepts any correctly shaped envelope (`src/catalogue/fingerprint.ts:101-117`). Consequently, a path absent in one sample, an empty array that hides child paths, or a string/null type variation cannot be honestly represented as a single exact fingerprint. In any such case, retain the sanitized evidence and mark `not_representable_current_contract`; leave the catalogue contract empty until the owner settles the model. Do not use an intersection-only fingerprint, because an extra observed path would still fail exact matching.

## 7. Dependency and execution order

The later session must use this order:

1. **Official-spec gate:** fetch/hash the current VAPI spec; validate all 14 operation declarations and resolve `{code}` semantics.
2. **Identifier seed:** capture paged `/land/deeds` in quarantine and select four state-stratified `deed_uid`/`plot_id` pairs. Search unlocks both deed-detail routes. The same deed UID is a candidate `uid` for the staked-deed route, but must be cross-checked through deed-active/deeds-assets rather than assumed.
3. **Deed chain:** capture details-by-uid and details-by-id; run populated deed-active/deeds-assets only as preflights; capture stake.deed-details after its four strata are selected.
4. **Independent `T0` batch:** projects list, list-count, requirements, regions counts, tracts counts, volume, DEC overall/region/staked, and pending claim.
5. **`code` chain:** preflight five hidden runtime values whose semantics and source were established by the official operation through populated items-available; capture items-grouped for selected minimum/median/maximum inventory sizes. No evidence supports treating `data.ids[].uid` from items-available as a request `code`, so never make that inference.
6. **`T0+6h` batch:** repeat every three-snapshot no-parameter route.
7. **`T0+24h` batch:** repeat every time-series route, including requirements' second sample.
8. **Sanitize and generate:** apply name/freetext transformations in quarantine, write only sanitized ordinal evidence, derive the candidate contract, run the representability gate, and update either the contract or the explicit empty-contract status.

## 8. Evidence that proves the contract was not invented

For each endpoint, the later step creates sanitized ordinal sample files whose names contain only endpoint ID and sample ordinal, plus one generated evidence manifest. No filename contains a parameter value. The manifest must contain:

- `endpointId`, `method`, symbolic host, and unexpanded `pathTemplate`;
- parameter names/types and source labels such as `search-result-ordinal-2` or `hidden-input-3`, never values;
- official specification URL, full SHA-256, fetched-at UTC timestamp, and byte count;
- capture-tool version and repository commit used;
- required successful sample count, achieved successful count, attempt count, and coverage strata;
- per attempt: ordinal, UTC retrieval timestamp, HTTP status, content type, byte count, raw-body SHA-256 computed in quarantine, and canonical sanitized-payload SHA-256 when a safe payload exists;
- per successful sample: normalized path/type table and presence bitmap;
- exact `name` key paths, number of distinct pseudonyms, exact `freetext` key paths, and redaction count—never original values or the replacement map;
- derivation algorithm/version, generated contract SHA-256, and `representable` boolean;
- terminal status: `captured`, `coverage_shortfall`, `input_coverage_shortfall`, `unclassified_value`, `not_representable_current_contract`, `undocumented_parameter`, `catalogue_metadata_mismatch`, `not_in_spec`, `not_found`, `unavailable_at_capture`, `removed`, `requires_auth`, `blocked`, or `temporarily_unavailable`.

Commit sanitized sample bodies alongside the manifest when and only when every leaf is safely classified. The existing fixture guard expects a provenance envelope with a source/timestamp plus a `valueClasses` declaration for every data leaf (`scripts/leak-check.ts:473-531`); the future artifact must meet that floor, but the manifest above is intentionally stronger.

The contract must be regenerated byte-for-byte from the committed sanitized samples. The later verifier recomputes every **sanitized-sample** digest and the contract digest, confirms the successful sample count and strata, and rejects a hand-edited contract whose bytes do not match. A raw-body digest and capture timestamp are attestations by the capture runner, not independently reproducible proof after raw bytes are destroyed. Reproducible derivation from committed sanitized samples proves that the contract matches the declared evidence; stronger proof that the network retrieval occurred requires an owner-approved trusted/signed runner or retained encrypted raw evidence outside the repository.

The current catalogue `live-observation` provenance stores only one `observedAt` timestamp (`src/catalogue/schema.ts:72-81`), so sample counts and checksums cannot be represented there today. Until the owner chooses a schema extension, the network session should generate the full manifest in quarantine and land it only in the owner-approved evidence location.

## 8.1 M13 retained evidence and validators

The first retained result-contract evidence is in `tests/evidence/land-result-contract-evidence.json`, with sanitised bodies in `tests/fixtures/`. Its four recipes establish the following call-specific contracts:

- `/land/deeds/{plot_id}` with an existing plot returns the Deed object directly under `data`; the wrapper arrays are absent. A missing plot returns HTTP 200 with `data: null`, which remains an empty success result under the ruling in `library/decisions.md`.
- `/land/deeds?limit=3` returns an object under `data` with `deeds`, `worksite_details`, and `staking_details` arrays.
- `/land/deeds?orderBy=desc` returns a VAPI envelope whose `data` value is a bare empty array.

The source validators require every measured key on every row: 41 Deed keys, 58 worksite-detail keys, and 56 staking-detail keys. The seven null-only fields are kept in observed paths and excluded from typed fingerprints: `castle`, `keep`, `segments`, `completed_date`, `destroyed_date`, `hours_to_completion`, and `projected_end`. The validators preserve the three measured traps: `tax_rate` is a string, `stats` and `land_stats` are not parsed, and an empty `worksite_type` is a string distinct from null.

The default unparameterized search contract remains empty because both attempts timed out without an HTTP status or response body. `land_deeds_owned` also remains empty: it was not queried and no sibling response shape was borrowed. The limited contract does not declare child paths below the captured empty `resource_recipe` arrays because those paths were not observed.

## 9. Undocumented, removed, permission-gated, or failed endpoints

Failure never produces a plausible contract.

- **Missing from current official spec:** make no speculative request unless the support article gives the exact public GET path and parameter semantics. Record `not_in_spec`, the spec hash/timestamp, and the support citation checked. Leave fingerprint `{}` and required paths `[]`.
- **HTTP 404 or 410:** attempt at `T0`, `T0+6h`, and `T0+24h`. Record `not_found` or `unavailable_at_capture` with statuses, timestamps, safe body hashes, seed source, and achieved/required sample counts. A parameterized 404 may mean a stale/wrong seed, and repeated 404/410 alone does not prove removal. Use `removed` only when the current official specification/support material explicitly marks removal or deprecation. Leave empty.
- **HTTP 401, 403, login/cookie challenge, or API-key requirement:** do not add credentials. The server is permanently credential-free (`CLAUDE.md:14-16`; `CONTRIBUTING.md:45-49`). Record `requires_auth` for 401/login requirements or `blocked` for consistent 403 policy blocking, with timestamp/status evidence. Leave empty.
- **5xx, WAF, DNS, timeout, or network interruption:** make the same three scheduled attempts, record `temporarily_unavailable`, and leave empty. This is not evidence of removal.
- **Required parameter undocumented, only empty/error payloads, unsafe unclassified string, insufficient state diversity, or cross-sample type/presence conflict:** record the exact terminal status, missing strata or unresolved paths, and achieved versus required samples. Leave empty.

The status manifest is mandatory even when no sanitized success body can be committed. It makes emptiness an explicit evidence-backed outcome rather than an oversight. Catalogue notes should point to that manifest only after its repository location is owner-approved. Never synthesize a response, copy a sibling shape, or promote an error envelope into a success contract.

Each logical capture event may use only the existing HTTP client's transport retries; those retries remain one event and one attempt record. For each of the four deed seeds and three grouped-item seeds, a failed `T0` event is repeated with the **same seed** at `T0+6h` and `T0+24h`. Successful strata may be retained as partial sanitized evidence, but no contract lands unless all four deed strata or all three grouped-item samples succeed. Three-snapshot no-parameter routes require all three scheduled successes. Requirements may use the same three-event retry window but needs two successful snapshots at least six hours apart. A scheduled failure is never replaced by an immediate extra sample or a different convenient seed.

## WHAT THIS PLAN CANNOT SETTLE

These are owner decisions rather than facts a capture can establish:

1. Whether to extend result contracts/matching to represent optional paths, empty arrays, and union JSON types, or to keep exact fingerprints and leave affected contracts empty. Live samples can reveal the need but cannot choose the semantics.
2. Whether multi-sample provenance belongs in an expanded catalogue `LiveProvenance` schema or in a separate public evidence-manifest schema, and the final repository location for sanitized evidence. The current schema cannot carry the required checksum/sample set.
3. If official documentation remains silent about `{code}`, whether the catalogue should redefine it as a player-name parameter. The safe operational default is to treat it as sensitive, make no speculative request, and leave the contract empty.
4. Whether the proposed `T0`/`T0+6h`/`T0+24h` observation window is acceptable as ongoing release policy, and how long quarantined raw bytes may be retained outside the repository. Until decided, raw bytes should be destroyed immediately after safe derivation.
5. Whether a consistently permission-gated or removed endpoint stays catalogued with an updated access/status note or is removed from the catalogue. Capture records the fact; the owner decides product surface.
6. Whether capture-runner attestations are sufficient provenance or stronger proof is required through a trusted/signed capture runner or encrypted raw evidence retained outside the public repository.
