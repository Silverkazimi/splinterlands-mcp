# Decisions

reviewed-by: an independent reviewer 2026-09-04
*(L3 first-tool approach reviewed PASS-WITH-CONDITIONS, 7 conditions; endpoint ruled `vapi.land.deeds.by-plot`. Two premises corrected: the eight so-called populated contracts disclaim their own response shapes, and `matchesResultContract` is an exact-equality gate.)*

## 2026-09-04 — catalogue is generated data

The endpoint catalogue lives in `src/catalogue/catalogue.json` and is produced by
`scripts/gen-catalogue.ts` from a JSON input manifest. `src/catalogue/index.ts` is the
small hand-written shell that validates entries, resolves symbolic hosts, builds branded
paths, and binds the declared predicate to the existing GET client. Keeping endpoint
values in data makes an upstream surface change reviewable as a value diff and keeps
future tool modules free of literal paths, hosts, and query names.

The repository does not contain a Swagger snapshot or an endpoint table. The initial
path set therefore records the explicit Tier-1 table in the governing L2 brief as
`repository-brief` provenance. It does not claim that the local repository supplied a
complete API source. Response contracts have empty fingerprints until an official spec
or a repository-made observation supplies fields whose semantic `valueClass` can be
reviewed by a human.

Request variants are named data values on an entry. The loader selects `default` or a
named variant and binds that variant's result contract to the existing response
validator. No authentication attempt is inferred from the classification field.

## 2026-09-06 — requiredness is an interim derived policy

The catalogue preserves `measuredRequired: null` when no live requiredness
measurement exists; null is evidence state, not a claim that a parameter is
optional. Until a measurement is available, request binding derives the
validation decision from `declaredRequired`. A measured `false` or `true`
therefore overrides the declaration, while null intentionally falls back to it.
This keeps the stored evidence honest while ensuring every bound request has a
deterministic required-or-optional schema. The current entries have no measured
requiredness values, so their declared values currently determine validation.

## 2026-09-06 — deeds search requiredness remains unmeasured

The public specification declares all seven `vapi.land.deeds.search` query parameters
required: `status`, `player`, `tract_id`, `region_number`, `limit`, `offset`, and
`orderBy`. The repository's own tests could not bind this entry without supplying seven
values. A measurement is what could later establish real optionality.

**Correction (2026-09-06):** The server accepted a request supplying only `limit=1`, so
`status`, `player`, `tract_id`, `region_number`, `offset`, and `orderBy` are not required
for acceptance. This does not establish that omitting them leaves the result set
unchanged; the effect of omission on result scope remains unmeasured.

## 2026-09-06 — absent metadata remains unmeasured

The current catalogue carries `null` for `tier`, `declared.authTier`, and
`declared.pagination` because this repository has no evidence for those fields.
The previous values were generator defaults rather than observations. `tier` is
not read at runtime. `provenance` is `null` for 20 of 22 entries for the same
reason: those defaults were not lost observations.

## 2026-09-04 — result contracts are tolerant projections

Result contracts validate the declared envelope, required paths, and the types of fields
whose types are established by their cited observation. They do **not** require exact key
set equality: unknown additive upstream fields are ignored. This is the default for later
tools because the upstream game can add fields without turning an otherwise useful,
well-formed response into `upstream_malformed`.

Each contract records `observedKeyPaths` separately from its typed fingerprint. A field
observed as `null` is recorded as observed but is neither a typed nor required field until
a sample establishes its non-null shape. The trade-off is deliberate: an unvalidated new
or null-only field could be semantically surprising, but treating a single null sample as
the field's schema would reject ordinary state changes such as market listings. The cited
`by-plot` observation has 42 observable leaf paths: `status`, 33 typed `data.*` paths, and
8 null-typed `data.*` paths. Its prose's count labels conflict with those explicit lists;
the contract follows the enumerated paths and fabricates none.

## 2026-09-05 — by-plot catalogue backfill

The by-plot manifest entry now carries the live-observed contract from the committed catalogue: 34 typed fingerprint paths, 35 required paths, 42 observed key paths, the generated entry's current notes state (no `notes` field), and `live-observation` provenance recorded at `2026-09-04T12:56:07Z`. The five typed paths gained are `data.created_block_num`, `data.created_tx`, `data.item_detail_id`, `data.land_stats`, and `data.stats`; the 33 gained required paths are the generated entry's required paths beyond `status` and `data`.

The manifest deliberately does not carry back `data: { type: "object", valueClass: "opaque" }`. An object declaration on `data` would reject both empty shapes: an absent `data` key fails the required-path check, while `data: null` is present but fails the object type comparison. Keeping that declaration dropped leaves the separate empty-result behavioural fix independent. The existing `data.resource_id` and `data.resource_symbol` declarations are present in both copies and are unchanged by this reconciliation.

The schema citation for the observed-path guard is `src/catalogue/schema.ts:47-62`: `ResultContractSchema` starts at line 47 and the fingerprint-path loop is at lines 58-62. A partial backfill that omits an observed path therefore refuses to load.

**WHEN THE DRIFT GUARD GOES RED, THE MANIFEST IS WHAT CHANGES — NEVER THE GENERATED FILE.**

Regeneration is always the shorter path and always the destructive one. Canonicality is about where edits are made, not about which copy is more true: the manifest is the canonical edit surface, and the generated catalogue is its checked-in derived output.

## 2026-09-05 — nullable leaf declarations

A declared leaf type may accept an observed null only when its declaration carries `nullable: true`.
The flag changes type acceptance, not presence: required paths remain required because a present null
still proves that the upstream sent the key. The by-plot declarations for `data.resource_id` and
`data.resource_symbol` therefore remain required and retain their non-null types.

The catalogue schema does not permit `type: "null"`, with or without the nullable flag. Null-only
observations stay observed paths without typed declarations. Existing null-typed declarations were
removed from the canonical manifest so the stricter schema remains loadable; their observed paths are
preserved.
For `vapi.land.deeds.search`, `resource_id` and `resource_symbol` were re-declared as typed nullable
leaves because their number/string types are known, while `castle` and `keep` remain undeclared because
their types are unknown.

## 2026-09-05 — plot identifier domain

The `plot_id` path parameter has a documented-in-this-repository lower bound of 1 and no upper bound.
This is repository-observed, not official documentation: observed plot identifiers are positive, and the
upstream treats negative identifiers as empty responses. No ceiling is inferred because a higher real
plot identifier has been observed and the map's upper limit is not established.

## 2026-09-06 — specification silence does not remove local constraints

A catalogue entry may carry a constraint the specification does not state when this repository documents
and justifies it. Specification silence is never grounds for removing an established constraint: the
`plot_id` lower bound of 1 was removed in error during a bulk alignment and has been restored.

## 2026-09-05 — status value remains uninterpreted

The by-plot result requires a string `status` field but does not require a particular string value.
No non-success HTTP 200 envelope has been observed, while an impossible plot still returned
`status: "success"`; interpreting the value now would manufacture an error contract without evidence.
The current matching behaviour is pinned by a test so changing it requires new evidence.

## 2026-09-05 — one definition of an empty result

A plot that does not exist is not a failure. The upstream answers HTTP 200 with a
success envelope and no rows, and the tool must say so in words rather than report
that the response was malformed — conflating "there is nothing there" with "we could
not ask" destroys the distinction the outcome vocabulary exists to draw.

`isEmptyResult` in `src/http/errors.ts` is now the single definition of that state, and
it accepts only shapes this repository has observed: an empty top-level array, a VAPI
envelope whose `data` is an empty array or `null`, and a VAPI envelope carrying `status`
with no `data` key at all. The last is the shape a non-existent plot returned on
2026-09-05; the `null` shape was observed on 2026-09-04 and still appears for a negative
identifier. An envelope with no `data` key counts as empty only when `status` is present,
so an arbitrary object cannot pass as an answer.

The result-contract validator (`src/catalogue/fingerprint.ts`) and the tools import that
one function. The validator previously carried its own empty-array exception, which meant
validation and empty recognition could disagree: a shape one called empty the other could
call malformed. They cannot now drift apart, because there is only one of them. The
required-path and fingerprint checks are unchanged for every non-empty body; the empty
exception still requires `status` to be present and to match its declared type.

The tools return the upstream body unchanged as structured content and put the absence in
the prose. No field is invented to mark emptiness, because no such field was observed.

Removed at the same time: a dead branch in `classifyResponse` that recognised emptiness and
then returned exactly the same successful result as the branch below it. It read as though
empty results were classified separately when they were not.

## 2026-09-06 — search scope is caller-supplied

The search tool has two accepted modes: an account selector travels in the
declared query position, or geography selectors such as tract or region
narrow the request by place. A genuinely unscoped search is refused before
binding and transport because the upstream response cannot be honestly
described as unscoped. The binder preserves every supplied selector and never
creates a default account. See `library/account-scope-contract.md` for the
caller-facing wording and the pagination rule.

The catalogue's `declaredRequired` value remains parameter-level evidence from
the upstream specification. Requiring a player or geography selector is a
separate project policy chosen to keep requested scope honest; the upstream
specification does not impose this tool-level refusal. The two claims must not
be conflated.

Fetching an unexplained broad result and filtering it locally is not equivalent
to requesting a named scope upstream: the request, returned data, and page
boundaries differ. Empty results and pagination continuations retain the
original requested scope; this tool exposes no continuation.

## 2026-09-06 — one non-empty rule for string parameters

**Corrected:** The earlier wording that all catalogue string parameters are
“trimmed and must contain at least one character” was inaccurate. Empty and
whitespace-only values are rejected, while every other supplied string is
preserved unchanged. Applying this rule in `schemaForParameter` gives path and
query parameters one validation path, so an empty value cannot be rejected in a
path while being copied into a query. The scope is deliberately every string
parameter rather than account selectors alone: the shared schema is the
correct single enforcement point, and the resulting widening is explicit.
The path substitution guard remains as defence in depth. The generated
catalogue needs no regeneration because this is binder logic, not catalogue
data.

## 2026-09-06 — result provenance lives in MCP metadata

The registered land tools keep the upstream body in `structuredContent`
without adding provenance or emptiness fields. Their result metadata lives in
MCP's separate `_meta.provenance` location with `endpoint`, `traceId`,
`freshness`, and `requestScope` members. `freshness.retrievedAt` is the
process's receipt clock; `traceId` is generated by this process; and
`requestScope` records the selectors actually
supplied by the caller. A player selector is recorded only as
`{ supplied: true }`, never as its value; other selectors retain their
supplied values. The same metadata is present for success, emptiness, and
failure (failure retains its existing classification in `structuredContent`).

The receipt clock is captured immediately after the transport returns a
response and its headers, before the response body is read or parsed. It is
not an upstream `Date` claim, and no origin timestamp is recorded. The
catalogue has no honest schema or contract version identifier, so the
provenance metadata deliberately has no version field.

## 2026-09-06 — caller result bounds and non-functional upstream paging

The transport's 2 MB response cap and the caller-facing result cap protect
different sides of the boundary. The 2 MB cap limits bytes consumed from the
upstream response while the fetch stream is read, protecting this process
from an unexpectedly large upstream body. After a successful response has
been parsed, the server's answer assembly limits caller-facing structured
content to at most 100 rows and at most 256 KB of UTF-8 JSON. The row and byte
limits are both enforced because a result can exceed the byte limit before it
reaches 100 rows. The answer is copied into a bounded envelope; the upstream
body is not mutated in place.

A bounded answer says: “This result was truncated to N rows; more may exist
upstream. The upstream endpoint provides no working continuation, so narrow
the request to retrieve other results.” `N` is the number of rows actually
returned. The message makes no claim about a total because the measured
upstream response supplies neither a total, a cursor, nor a has-more signal.
The empty-result rule remains separate: an upstream empty body is returned
unchanged in `structuredContent`, with absence stated only in prose.

A non-array record that exceeds the byte bound is a different case from a
row-list truncation. The caller is told, “This single record is too large to
return within the 256 KB result limit.” The bounded structured content keeps
the upstream `status` when present and omits the oversized `data` value; it
does not return a null placeholder or invent a marker field. The message does
not claim a row count or suggest narrowing a request that identifies one
record.

For `GET /land/deeds`, `limit` was observed to be honoured and unbounded to
at least 10,000, while a 10,000-row response was 32.9 MB and therefore hit
the transport cap. Explicit `offset=0` returned no rows, and `offset=5`
returned the first four rows again rather than advancing. The measured
upstream interface therefore provides no honest continuation mechanism. This
project does not create a cursor or offset-based token and does not fetch
additional pages to fill a bounded answer. A caller that needs more must
narrow the request instead. One tool call still performs one logical upstream
request; internal retries of that request remain the only repeated transport
attempts.

## 2026-09-06 — provenance uses endpoint templates

Provenance records the catalogue endpoint template rather than the substituted
request path. A substituted path can carry caller values; for the owned-deeds
endpoint, that value is an account name. The expanded path remains internal to
transport and request accounting, while caller-facing metadata and outcomes use
the template.

The `scripts/leak-check.ts` guard scans files on disk, so it cannot see a value
that appears only in a running tool's output. Runtime whole-result assertions
are therefore still needed for account-taking tools.

## 2026-09-06 — captured deed result contracts preserve call-specific shapes

The sanitised evidence in `tests/fixtures/` establishes five call-specific
shapes. A by-plot hit has one direct 41-field Deed under `data`; a by-plot miss
is HTTP 200 with `data: null`; a limited deed search has `data` as the object
containing `deeds`, `worksite_details`, and `staking_details` arrays; the
captured descending search has `data: []`; and the by-UID hit has one direct
39-field Deed under `data`. These are not success and failure variants of one
shape. **Correction (2026-09-06):** The earlier wording that the catalogue
“binds dedicated validators to the by-plot, by-UID, limited-search, and
ordered-search contracts” was inaccurate: hand-written validators cover
`land.deeds.by-plot`, `land.deeds.search.limited`, and
`land.deeds.search.ordered`, while `land.deeds.by-uid` uses the generic
fingerprint fallback to enforce required key paths and declared types. Both
mechanisms validate, so an entry without a dedicated validator is still
validated.

The measured key sets are complete observations, not exact requirements. The
validators require every typed, non-null-only key, allow unknown additive
upstream fields, and treat observed-null-only keys as optional while ignoring
them whether absent, null, or non-null. The two Deed fields `castle` and `keep`, plus the
five worksite fields `segments`, `completed_date`, `destroyed_date`,
`hours_to_completion`, and `projected_end`, therefore remain observed without
typed fingerprint declarations. `tax_rate` is a string despite its numeric
meaning; `stats` and `land_stats` remain embedded JSON strings; and an empty
`worksite_type` string is not treated as null.

The unparameterized search returned no HTTP response in either captured
attempt, so its default contract remains empty. The owned-deeds route remains
empty for the owner's no-individual-dataset evidence ruling; no sibling shape
is borrowed. Raw-response hashes, timestamps, byte sizes, row counts, recipes,
and uncertainty are retained in `tests/evidence/land-result-contract-evidence.json`.

The hand-written land-result predicates now follow the same tolerant projection
rule as the declarative contracts; see the 2026-09-04 ruling above. Requiring a
null-only field to remain `null` would type it as `null`, causing a deed with a
new market listing to be rejected as malformed. The null-only sets remain
hardcoded for now; deriving them from `observedKeyPaths` minus fingerprint keys
is a follow-up that would remove this class of drift and is not implemented here.

## 2026-09-06 — deed lookup routes are separate callable tools

The captured `GET /land/deeds/details/{deed_uid}` hit is exposed through
`land_deed_by_uid`, while `GET /land/deeds/{plot_id}` is exposed through
`land_deed_by_plot`. Each tool advertises a plain object schema derived from
its catalogue entry: by-plot requires only `plot_id` as an integer with a
minimum of 1, and by-UID requires only `deed_uid` as a non-empty string. The
route is selected by the tool name, so the other identifier cannot be supplied
to select a different path. Each handler binds its own catalogue entry and
result contract. The UID contract records 39 observed keys under `data`, with
`worksite_type` and `rarity_sort_value` absent rather than null, and records
the captured numeric wire types for `market_id`, `listing_price`,
`market_listing_id`, and `tax_rate`. The shared empty success envelope is
accepted and returned unchanged, with absence stated only in prose.

The same deed serialises differently across routes: by-plot and search emit
the four fields above as strings, while the UID route emits them as numbers
(`tax_rate` is `"0.10"` versus `0.1`). A consumer must not assume a field's
type is stable across lookup routes. Each route therefore retains its own
contract; the UID contract reuses none of the by-plot contract and invents no
absent or null-only field type. The fixture recipe, timestamp, byte size, and
pre-pseudonymisation response hash are recorded in
`tests/evidence/land-result-contract-evidence.json`.

The catalogue entry for `GET /land/deeds/details/id/{plotId}` remains
deliberately unexposed as of 2026-09-06. Three identifier spaces were tried —
the real plot id, the real item-detail id for the same deed, and an implausible
id — and every request returned the same 32-byte success envelope with
`data: null`. This does not establish what identifier the route accepts, or
whether the route works at all, so no hit contract, guessed id space, or tool
branch is added.

## 2026-09-06 — public game-region values in fixture JSON

The leak guard keeps the internal project-name pattern active everywhere, but
the owner's ruling permits the game's public land-region vocabulary when it
appears as a JSON string value in `tests/fixtures/*.json`. The exemption is
implemented only in that fixture-value scan: paths, filenames, prose, source
code, JSON keys, and all other deny patterns remain unaltered. This preserves
the guard's internal-name protection while allowing the four captured API
values that are ordinary public game data.

## 2026-09-06 — land projects share one record definition, and history returns a single page

The land-project family is exposed through four flat tools: active, history, count, and requirements. A
single enum-style tool was not used because each catalogue entry owns a different request schema and result
contract; merging them would either advertise parameters on routes that do not accept them or lose the
catalogue-derived schema at the MCP boundary.

The active and history routes share one 58-key project-record definition in the validators. Their null-only
sets are passed per route: the history list validates `segments` as an array, while both observed active
responses carried `segments: null`. A nullable-typed key remains required and accepts its observed type or
null; a null-only key has no type evidence and may be absent, null, or non-null. Requirements use the same
distinction for `land_work_type_parent_id`, and `work_per_hour` remains a string.

On 2026-09-06, the history route's `limit` narrowed rows from the start of the list while `offset` did
nothing with or without `limit`. This is the second land route measured to expose no continuation. The local
100-row and 256 KB bounds are therefore the binding constraint on a long history, and the history tool's
prose states that rows cut by those bounds cannot be reached through that tool. The catalogue keeps
`pagination: null` because its vocabulary has no value for a truncating limit with no second page.

A count body with `count: 0` is a populated answer, not an empty result. The count tool reports the number
the upstream returns and does not claim that it is exactly the population returned by history. The observed
projected values and timestamps are passed through without interpretation.

The four project entries use `deed_uid` for their path parameter and advertise only catalogue-derived
properties. The stake-family entries retain their existing parameter spelling because that family is outside
this change and requires its own verification.

## 2026-09-07 — region and tract counts have captured named-player row shapes

The region-counts, tract-counts, and volume routes are exposed as three flat
tools rather than one view-enum tool. Their catalogue entries share no common
parameter set, and one entry has no parameters, so a merged tool could not
retain catalogue-derived schemas without advertising selectors on routes that
do not accept them. The three tools also have different evidence positions:
volume has a captured response, while the initial unscoped probing round for the
two count routes captured only empty envelopes. Later named-player captures
established populated row shapes for both count routes.

`player` remains a first-class caller-supplied parameter on the two count
tools. The no-account-names rule governs what this repository commits, not
what it may ask on a caller's behalf. Named-player captures recorded in
`tests/evidence/land-result-contract-evidence.json:1008-1049` established
route-specific populated row shapes: the regions route returned 150 rows and
the tracts route returned 36 rows. The count contracts declare the `vapi`
envelope and now carry those observed shapes. The earlier evidence gaps record
the unscoped probing history, not an absence of any populated response.

At the time this decision was made, every permitted query in the initial
unscoped probing round returned an empty list. That result was consistent both
with selectors being ignored and with selectors working over an empty unscoped
population. Later named-player captures recorded in
`tests/evidence/land-result-contract-evidence.json:1008-1049` established that
the regions route returned 150 rows and the tracts route returned 36 rows when
`player` was supplied. The earlier empty responses therefore describe that
probing round only; they do not establish that the count routes always return
an empty list. A single unscoped request per route measured
`measuredRequired: false` for all eight selectors, including `player`;
acceptance without a selector does not establish that omission leaves scope
unchanged.

`inertUpstream` remains `false` because the catalogue schema has no value for
"tested, no effect observed, cause unknown". With no matching observation,
that declaration renders as an `observed-negative` dimension of `null` in
`describe_endpoint`. The raw `declaredRequired`, `measuredRequired`, and
`inertUpstream` fields are catalogue declarations, not measurements, and are
published alongside the evidence dimensions.

For a contract declaring the `vapi` envelope, `requiredKeyPaths` guarantees
keys on populated bodies only: the empty-result short-circuit runs first and
checks `status` alone. This is gated by `contract.envelope === "vapi"`; a
`bare` or `array` contract enforces its required paths on every body. The
server exports its tool-to-entry mapping and derives the callable set from
that mapping, so the schema guard checks registered endpoint tools against
the catalogue rather than a named exception list.

The volume route returns `sum` and `count` as JSON strings on the observations
available, so the contract preserves those wire types. The two figures also
decreased between captures, by 10.000 and 1 respectively, so they are not a
cumulative total. What they measure is not claimed. This route contradicted
a plausible reading of its field names twice: the values are strings rather
than numbers, and they can fall as well as rise. On this endpoint, names are
not evidence.

The specification's `declaredRequired` flag does not predict acceptance. The
deeds-search, projects-history, and count families have all answered HTTP 200
when requests omitted parameters the specification marks required; the flag
is a record of the document, not a prediction about the server.

## Account names are permitted outside code (2026-09-07)

**The rule is: do not save an account name in code.** That is the whole of it. Tests, fixtures,
captured responses and tool output may all carry real names.

This replaces a stricter rule that stood until 2026-09-07 and forbade a name anywhere in the
repository. The project owner's ruling, in his words:

> *"Simply dont save names in code. Feel free to ALWAYS use names for tests and whatsoever, it is no
> issue, no problem. In fact, it is required to do that because there is no other way to test the
> api. 100% of the names are public and visible at all times for anyone. So even IF any name leaks
> through, it is no big deal."*

**Two reasons it is safe, both stated by him:** an API whose data is keyed on people cannot be
exercised without naming one, and the values are public — anyone may query the same endpoints and
read the same names at any time.

**What changed in the guard.** `scripts/leak-check.ts` no longer requires a name-classed fixture
field to be an obviously synthetic placeholder. The leaf-coverage rule is untouched: every scalar in
a fixture still needs a declared `valueClass`, and `checkSourceStructure` still refuses a name in
source. A test pins the current behaviour rather than the repealed one, so the old rule cannot return
unnoticed.

**What it cost while it stood.** `land_deeds_owned` shipped as a registered, working tool with no
captured response shape, because capturing one meant naming somebody. Two questions about the
`player` selector on the region-count routes were recorded as permanently unanswerable when they were
merely unasked. Neither was necessary.

## 2026-09-07 — the deed staking family keeps two route-owned shapes

The deed staking family ships as two flat tools, `land_stake_assets` and
`land_stake_deed_details`. Although both entries accept one path parameter with
the same type, a merged tool would need a discriminator that belongs to no
catalogue entry, and the derived-shape guard would reject its hand-written
schema. Calling both routes and combining their bodies would also break the
server's pass-through contract.

The assets route keeps its specification-derived 55-path fingerprint, but the
declarative fingerprint alone rejects a successful blank body because it cannot
express that a collection may be empty. A registered predicate validates the
declared fields per row and accepts empty `cards` and `items` arrays. This is
the second instance of that contract gap and the first where the empty
collection sits below `data`.

The predicate tolerates null in any declared asset field because only thirteen
rows from two deeds were observed and none came from a deed with a staked
Runi. This is absence of evidence, not a nullability claim. Three keys are in
the third contract state, observed-present but type-unestablished:
`data.cards[].delegated_to`, `data.cards[].rental_type`, and
`data.items[].stake_ref_id`. They remain undeclared and are passed through.

The details route is declarative because its blank answer is a fully present
56-field record with zeroed numbers and false flags. Its declaration is kept
per entry even though the record corroborates the existing staking-details
validation. The sibling routes also demonstrate that wire type belongs to the
route: asset figures are strings and deed-level figures are numbers. Neither
route normalises or compares them.

The routes differ on an unrecognised deed uid. Assets returned HTTP 400 with a
`fail` envelope and no `data` key; details returned HTTP 200 with
`{"status":"success","data":null}`. The 400 is classified before a result
contract is consulted, so no contract is written for that envelope. A
successful answer with no record establishes neither that the deed exists nor
that it does not, because the one observed blank deed returned a full zeroed
record. The two path parameters are renamed to `deed_uid`; the four remaining
camel-case parameters are query names and remain unchanged because query names
are sent on the wire.

## 2026-09-07 — the DEC staking family: a scalar payload, a route that changes shape, and a parameter nobody enforces

The DEC staking family ships as four flat tools, one per catalogue entry. A
merged tool remains inexpressible under the derived-shape guard even though
three entries share a `player` parameter: the four routes return different
`data` shapes and have different absence rules, and a merged schema would need
a selector that belongs to no catalogue entry.

A result contract may declare a bare scalar payload. `data` with
`type: "number"` is an ordinary fingerprint path, and the overall DEC entry
is the first catalogue entry whose payload is not a container. A route whose
`data` changes JSON type between answers needs no branch mechanism when one
shape is an empty result: the shared empty-result definition short-circuits
the matcher before the type comparison. `variants` is not the instrument for a
response-chosen branch because a variant is selected by the caller at bind
time.

The 2026-09-05 by-plot passage stating that an object declaration on `data`
rejects `data: null` no longer describes the matcher. The empty-result
unification of the same period short-circuits first. The passage remains in
place as history; this dated correction supersedes that statement for the
current matcher.

The DEC staking row contract enforces per-row type but not per-row presence.
Deleting a field from one of eleven observed rows still satisfies a
declarative path collected across the array. This is recorded as a limitation,
not assumed to be a guarantee, and no predicate is added on this row.

This family establishes the fifth absence rule in the API: a plausible zero or
empty result can be returned because a declared-required parameter was not
actually required by the upstream. The response is well-formed and says
`success`, so the absence is in the request rather than the result. The other
four rules remain the no-`data` VAPI envelope, `data: null`, an empty list from
every permitted query, and a present container or zeroed record for the deed
staking routes. Route descriptions must state their own rule and must not
borrow another family's absence convention.

The catalogue records `measuredRequired: false` for all six DEC query
parameters because the upstream accepted their absence. The registered tools
still refuse calls without the account, and the region tool also refuses a
call without `region_uid`; the advertised schemas therefore show those
parameters as optional while the tool-level refusal explains the local
requirement. This dissonance is deliberate until the catalogue schema grows a
separate field for what the tool requires.

This family is the first measured here with no string-encoded numeric fields.
The contracts preserve each route's observed JSON number types, and no value is
normalised. The overall figure equalled the sum of eleven decstaked amounts,
and two region figures matched corresponding rows, all for one account at one
instant. That is an observation, not a rule or a scope proof: no tool sums,
compares, or derives one figure from another.

The region route's empty array was measured only when `player` or
`region_uid` was missing. A valid region with no stake returned a full object
of zero figures, which is distinguishable from the incomplete-request empty
array. Removing `player` from the same region request changed a resolved
object to an empty array, so the account is part of what the figures describe;
what each figure counts is still not stated by the response. The pending-claim
route returned zero for both a real and a non-existent name, but the real
account's amount was also zero, so whether those cases can be distinguished is
untested rather than disproved.

No 200-wrapped `AppException` appeared in the fifteen calls. That does not
establish that this family is free of the hazard. The shared empty definition
also reports a VAPI envelope with `status` and no `data` as an empty result;
that shared definition is unchanged.

## 2026-09-07 — M23 drift machinery stays local and value-free

M23 separates response acquisition from issue delivery with two injected
functions. The sweep, shape observation, issue planning and rendering remain
local and testable without a remote; hosted HTTP and issue upsert are M75
delivery concerns.

The JSON type classifier is defined once in `src/catalogue/json-type.ts` and
reused by the existing catalogue fingerprint. Drift uses a second,
undeclared shape observer under `scripts/drift/`; the existing fingerprint
contract and its behavior remain unchanged.

Empty results suppress shape comparison everywhere. Their status and access
tier remain observable, while the run record says `shapeCompared: false` with
reason `empty_result`.

Issues are endpoint-scoped and multi-labelled. A 401 creates `drift:auth`
only when the baseline was public. One 403 completes with an endpoint-scoped
`drift:blocked` issue; the second distinct 403 aborts before the next request,
suppresses endpoint issues and emits one run-scoped blocked issue.

An unreachable or unparseable specification is never interpreted as a
catalogue removal. The unreachable branch has `catalogueDelta: null` and
exit success while opening a run-scoped signal. Fixture renewal refreshes
equal shapes, holds changed shapes in `pending/`, and writes nothing when the
hold floor indicates a systemic capture change.

## Player route completion (2026-09-12)

The additional player routes use a separate registration module because server.ts already exceeds the size-review trigger. Existing registrations remain unchanged. Array contracts accept an empty array or validate every row against captured common fields; a malformed row cannot borrow required fields from a neighbouring row. Account selectors are required by tool policy. The recent-teams decryption-key parameter is omitted, and avatar image redirects remain unbound.

## Ranking list bounds and observed selectors (2026-09-12)

The ranking family uses a separate registration module and the same bounded read handler as the additional player tools. A named nested list may be shortened, while all surrounding fields are retained; an oversized summary or first row is refused. This permits presale results under the existing byte limit without silently losing the requested-player record. Non-inert observed query parameters are now included by one shared binding function; endpoint knowledge still labels their origin as observed. Observed-only inert parameters stay unbindable. Declared inert parameters retain the existing forwarding behavior and measured-negative evidence. Profile name is required by tool policy, and no account selector value enters provenance metadata.

## Market selectors and complete nested records — 2026-09-12

Market tools share the bounded read handler but keep separate catalogue entries and measured contracts. Alternative required selectors and conflicting aliases are validated before HTTP. Status accepts a captured record or an array of captured records. Grouped listings and packages are bounded at the root and never have nested contents silently removed. Active-rental offset/skip remain declared and forwardable, with measured-inert evidence and a clear description that they do not establish working pagination. This matches the existing declared-parameter policy; observed-only inert parameters stay unbindable.

The market implementation stays in its own 165-line module; server.ts is 1653 lines and receives only import, binding-map and registration wiring. Keep the existing server registrations in place for this scoped addition; a broad split is not needed for the market contracts.

## Battle reads and submission boundary — 2026-09-12

The three battle reads use a separate module and preserve encoded strings rather than parsing a new replay model. History and team-info remain excluded after unauthenticated HTTP 401. submit_ptr is excluded because it submits an option, despite being declared GET. No credentials or Origin override are exposed. The existing large server module receives only registration wiring.

## Tournament scope and partial authentication errors — 2026-09-12

Tournament tools use a separate registration module and the existing bounded read handler. Detail player lists can be shortened while totals, rounds and guilds stay intact. A mixed public-count/authentication-error fray response is excluded instead of advertised as a complete roster. Crown pot needs an eligible brawl state, so captured errors do not justify a guessed success contract. Tournament matchups require an explicit player or group in addition to id and round.

The fixture-depth audit now checks actual response bodies through observeShape, not fixture wrappers and value-class keys containing dots. Tournament payout leaves occur at depth eight and are already observed by the unchanged depth-eight walker; only containers at the cap truncate. The audit asserts zero truncations and exact observed path coverage, with a payout regression. No runtime limit or response field was weakened or removed.

## Guild scope and optional reward sections — 2026-09-12

Guild tools stay in a separate registration module. Name-scoped search avoids the measured oversized unfiltered response without increasing transport limits. Reward validation supports total-only, cycles-only and combined shapes; at least one recognised section must exist, and each cycle row is validated. A global total is retained outside any bounded cycle list. Other guild detail strings are returned without decoding or merging them with profile representations.

## Metadata cache and result scope — 2026-09-12

Only settings opts into the shared read handler's success cache. Exact query keys prevent version-selector collisions; the cache holds at most 32 results for one hour and updates age from the original retrieval timestamp. Errors are not cached. The existing large server module receives only registration wiring, with metadata in its own module. Metric series are returned intact or refused; date and metric scope avoid an unfiltered history capture of about 1 MiB.

## Partial conflict status and proposal reads — 2026-09-12

Conflict/proposal tools have their own registration module. The conflict status predicate validates only recognised returned sections, requires at least one, and validates each wagon row when present. It does not manufacture sections removed by explicit flags. All totals and non-list data remain intact when lists are locally bounded. The proposal/vote paging claim is based on matching row identities from paired two-row pages and one four-row page. No write operations are registered.


## Public VAPI market nested lists — 2026-09-12

Registration lives in src/vapi-market.ts; the already oversized server.ts receives only wiring. The shared helper adds a fixed data-envelope list projection preserving status, summaries and complete records. The VAPI predicate validates the success envelope and every row using existing bare object-list checks. Ordinary main-API projection is unchanged. No arbitrary path expression or generic HTTP tool is introduced.


## Public delegation rental module — 2026-09-12

src/rentals.ts owns the new registrations; the already oversized server.ts receives wiring only. VAPI arrays use a dedicated predicate that validates each row and refuses missing data. Lowest-price objects validate the inner data record separately so a status-only empty envelope cannot masquerade as a quote. Existing list projection handles the top-level data array without introducing another transport path. Decimal price filters are not rewritten to integer or scaled values; the observed upstream failure remains visible.


## Collector configuration integrity — 2026-09-12

src/collector.ts owns collector registrations; the already oversized server.ts receives wiring only. Configuration is one bounded record rather than a paged list, so its independent sections are never truncated separately. A collector-specific predicate checks root sections and each row of the three typed arrays using catalogue fingerprints. No account lookup, URL resolution, shop operation or claim is triggered by configuration contents.


## Verified plot display labels — 2026-09-12

src/plot-references.ts owns label parsing, candidate encoding, response identity extraction and coordinate checks. The existing deed registration applies these helpers without changing the catalogue's numeric upstream request contract. The already oversized server.ts adds only the handler adaptation; reusable address logic stays outside it. Candidate allocation is inferred from public boundary captures, so an empty lookup or coordinate mismatch fails explicitly instead of creating a false match or false nonexistence claim. The strict full input schema also prevents silent stripping of unknown arguments.


## Per-call request budget wiring — 2026-09-12

The request counter previously existed in http/callscope.ts but production tool callbacks never entered withCallScope; only tests did. createServer now constructs ScopedMcpServer, whose registerTool wrapper forwards validated arguments and SDK context inside an isolated call scope. A second distinct logical URL returns refusal_would_fan_out; retrying the same URL remains allowed. Concurrent and sequential calls have independent counters.

Protocol-level regression tests deliberately register a callback that attempts a second URL, overlap two callbacks at a barrier, and exercise consecutive calls. The complete existing tool suite passes with enforcement active. This does not add a multi-request allowance. Compound plot-resolution work must introduce an explicit bounded policy alongside its implementation instead of relying on an inactive guard.


## Bounded shared plot references — 2026-09-12

src/plot-tool-adapter.ts centralizes reference schemas, resolution and identity/provenance enrichment for an explicit 11-tool allowlist. ScopedMcpServer installs it at registration; existing target handlers retain their route-specific response interpretation. Each permitted compound call has at most two distinct logical requests; all other calls retain one. Nested scopes reuse the parent budget rather than reset it. Direct UID target calls now also resolve the deed first, so callers receive all three verified identities; native deed lookups reuse their own response. Empty target data remains valid after successful resolution, while empty resolution does not establish absence of the requested location.

The UID response contract now preserves the six nullable market/unlock fields observed on two unlisted map deeds. This is fresh first-party evidence, not a blanket weakening of required fields or wire types. Existing handler tests now include resolution requests, and protocol tests exercise all 11 tools and the third-request refusal.


## Collection Land base power — 2026-09-12

The public collection fixture records land_base_pp as decimal strings. The streaming projection now retains that field when present and min_land_base_pp compares its numeric value before paging. Missing power remains absent and cannot match any explicit minimum, including zero. Present malformed or non-finite values fail parsing. No additional upstream request is needed; the existing page-cache key already includes the full filter request. This incremental change does not provide joined card metadata or staking location. The ten core fields remain required; Land power is optional so older or incomplete records are not silently assigned zero.


## Bounded collection definition join — 2026-09-12

Collection reads now join the full public /cards/get_details catalogue by card_detail_id before filtering and pagination. A fresh anonymous capture has 1,101 unique definitions and 1,202,299 bytes, within the unchanged 2 MiB transport cap. A separate loader validates and retains only identity, name, color, secondary_color and sub_type in a single 24-hour map; malformed or duplicate identities are not cached. The tool has an explicit two-distinct-request allowance for metadata plus collection. All remaining non-plot tools retain one. Failed metadata stops the operation before collection streaming. The joined page cache includes the metadata trace identity, preventing reuse across refreshed definitions, and reports each source freshness separately.

Color matches either primary or secondary raw color; subtype matches the raw subtype, both case-insensitively. Missing definitions retain source instance fields, exclude metadata-filter matches and increment a pre-filter full-stream missing count. No guessing from card names. The raw API uses Gold and Gray while current public Elements documentation calls the display colors Purple and Grey; this change deliberately exposes wire colors without asserting a universal display mapping. Output is cut only between complete records at 256 KiB, with an advancing cursor; a single oversized row is refused. server.ts keeps wiring and response adaptation, while reusable metadata indexing and loading live in card-definitions.ts.


Full-capture verification also exposed two omissions in the older card-definition contract: 51 null subtypes and heterogeneous combat stats (107 scalar mana, 884 array mana, 110 without mana). The dedicated cards.definitions predicate validates every common row and distribution row, permits the observed optional stat forms and rejects malformed present values. The production HTTP route validator and projection both accept all 1,101 captured definitions, including 87 secondary-color rows. This is retained-capture replay, not a live collection call. Evidence: library/observations/collection-definition-join-2026-09-12.json and the null-subtype fixture.


## Public Land rule resources — 2026-09-12

Three static JSON resources expose directly sourced rules without upstream calls. Terrain modifiers are transcribed from the official Terrain Preferences support diagram (14 rows, six elemental columns, blank cells represented as zero); the source image hash is retained. Baseline resource and food rates come from current Resource Production and Grain FAQs. Cap evidence combines the staking FAQ and the linked Phase 2 worker-production whitepaper, preserving its Runi exception and warning that building caps can differ. Unknown slot-order cap allocation, neutral/dual-element treatment and ability overrides are not invented. These resources do not claim to complete the estimator, API-to-screen mapping or edition-specific ability resource. The SDK registers resources separately from tools, so tool and endpoint counts remain unchanged.


## Edition-19 ability reference — 2026-09-12

The offline card-abilities resource retains signed API tuples and explicit one-based levels for the four original Land cards plus the additional observed card. All 28 original level rows were compared with the official announcement; source links and its body hash accompany the table. Public support rules cover another matching bloodline worker, strongest same-ability effects, distinct production effects, the base-cap exception and Light Rationing eligibility. Rationing versus Light Rationing interaction remains unspecified. This reference does not implement the full lineup estimator.


## Public client worker vocabulary and cap allocation — 2026-09-12

The screen-fields resource records the official client bundle URLs and hashes. Its worker table binds Base Production to land_base_pp, Boostable Production to total_construction_pp and Total Production to total_harvest_pp. The retained base after cap has a separate explicit label, avoiding confusion between raw and capped power. The preview reduces workers in slot order, then processes Runi outside the cap. Core or Energized powers five ordinary slots; Runi alone powers four ordinary slots plus itself. These observations inform the planned estimator; backend agreement, aggregate label mapping and food discount composition remain separate verification work. No upstream source code is vendored.


## Same-response worker view — 2026-09-12

Staking assets now attach worker_view before the existing whole-record byte check. The view preserves original source strings, labels raw base separately from capped base, and applies display zero only when is_powered is explicitly false. Missing source fields or power state remain unknown. Raw cards/items and provenance remain unchanged; no additional API request is made. Empty upstream records retain their existing empty semantics.


## Collection staking state — 2026-09-12

Optional staking fields are projected without changing raw values. The public client separates active staking from cooldown; the server adds explicit unknown and pending states and uses one observation time per streamed response, retained by the page cache. Filters act before counts/paging and are never sent upstream. staked=no requires a demonstrated unstaked state, excluding cooldown, pending and missing evidence. Numeric plot mode requires an explicit selector; verified padded labels remain pending. Public-client source hashes are in observations/collection-staking-client-2026-09-12.json. The trimmed live fixture lacks these fields, so synthetic tests prove server behavior, not live API compatibility.


## Initial offline lineup estimator — 2026-09-12

The estimator consumes ordered caller-supplied worker facts because an offline tool cannot resolve bare UIDs. Known edition-19 abilities come from the dated resource; others require explicit ability tuples. Slot/power, identity duplication, cap allocation, Runi, strongest boosts and bloodline companions are checked. Public preview food composition is documented in observations/lineup-food-client-2026-09-12.json. The initial tool explicitly excludes unsupported resource/worksite/element cases and does not claim full estimator acceptance, backend agreement, live eligibility or recalculated regional DEC efficiency. These remain follow-up work.


## Terrain reconciliation — 2026-09-12

Reinspection of the official support diagram found a transcription error in Plains: the previous row duplicated Hills. The diagram and linked whitepaper both show Death zero and Earth minus 50%; data and regression checks now use those cells. The linked whitepaper explicitly gives neutral zero, and the public client getCardBiomeModifier chooses the larger primary/secondary modifier, retaining primary on a tie. Resource-specific support FAQs establish a complete 14-terrain partition for Grain, Wood, Stone and Iron; the estimator now enforces it. Runi still accepts an explicit source modifier and no ability-specific terrain override is invented.


## Regional power what-if — 2026-09-12

The estimator supports either explicit efficiency or a regional snapshot, never both. Regional mode replaces the current plot contribution exactly once; other plots and staked balance remain unchanged. Raw worker demand is reduced by strongest Dark Discount and retained-base fraction, rounded like the public preview; Runi removes plot demand. Zero demand uses efficiency one. Invalid snapshot totals or missing worker demand refuse calculation. This is an offline hypothetical, not a live balance query or multi-plot transaction simulator.


## Collection facts for lineup input — 2026-09-12

The official client mappedElement table supplies the wire-color normalization (including Gold to Dragon and Gray to Neutral). Definitions retain only Land ability levels in addition to join metadata; each collection row emits its selected level, never the full table. Missing levels remain unknown, while an absent/null ability table denotes none in the source definition. Optional raw land_dec_stake_needed is preserved without guessing from base PP. Local element filtering matches either normalized element. This supports assembling estimator inputs without another request, but does not by itself prove two-call acceptance or live staking compatibility.

## Bounded offline lineup comparisons

The existing estimator accepts a baseline plus at most ten uniquely labelled complete alternatives. Reusing the same deterministic engine avoids arithmetic drift. Alternatives remain independent: partial results are retained when a domain-invalid lineup is supplied, but the MCP response signals an error. No implicit ranking, holdings verification or sequential regional mutation is introduced. Schema-invalid batches are refused before calculation.

## Land availability source reassessment

The public editor imports item grouping and availability hooks from a separately loaded module. Its Power Core selector supplies a concrete query shape, now retained with both source hashes. All four previously excluded card/item availability/grouped entries retain their wire-evidence exclusions, but their notes now supersede the earlier limited-bundle client-absence finding. Source usage establishes a verification target, not a working public endpoint or a populated response schema.

## Plot overview production display

The public DeedOverview module independently establishes PRODUCTION / HR as total_harvest_pp with Runi, otherwise total_harvest_pp times efficiency when powered, otherwise zero. The staking-details view exposes that unformatted value alongside clearly marked reference PP values and preserves upstream data. Missing inputs remain unknown rather than borrowing client fallback defaults. The existing result bound and request budget still apply.

## Package documentation completeness

A local npm dry run exposed six README Markdown links and additional inline evidence references whose files were excluded by the package allowlist. Include the public library (55 files, about 322 KB before this note) alongside dist and top-level package documents. Its local Markdown links remain within the library or README. A dry-run test checks linked/reference files and rejects unintended package surfaces without running lifecycle scripts, contacting the registry or creating a release. Source, tests and scripts remain repository development material.

## Inventory scope and local selection

Public type=Land inventory narrowed the observed payload but retained Token rows. The tool therefore exposes type as an upstream filter without claiming exact row equality. Local item_detail_id runs before result truncation, so a matching late row can be returned without per-item requests. Source values remain unchanged, quantities are not converted and a missing item is not proof of staking eligibility. The 2-MiB transport and 100-row/256-KiB result bounds remain enforced.

## Account market scope

Four account market reads now have populated captured contracts. Activity offset=1 selected the same later record at two limits and did not mean the second unoffset row; the tool forwards explicit selectors but promises neither conventional row offsets nor complete history. Per-asset listing identity matched the all-listings response. Owned/listed figures and currencies remain uncombined source values. Shared one-request, whole-record and output bounds apply.


## Wrapped upstream exceptions — 2026-09-12

The shared ordinary JSON response classifier rejects an object in envelope data when its name is AppException or its numeric status is at least 400, before applying a success validator. This follows the retained [availability observations](observations/land-stake-availability-2026-09-07.md). It returns upstream_malformed with the actual HTTP status and a generic message; upstream error details are not echoed. A body status is not used to populate the HTTP auth cache or trigger network-block handling. Detection is limited to the envelope data object, not arbitrary nested domain records. Streaming consumers retain their own shape validation.

## 2026-09-13 — isolated Hive read transport

Add three read-only evidence tools using a fixed Hive node and exactly two RPC read methods. Preserve the existing two-host GET client and catalogue unchanged. No third-party server, signing dependency, credential configuration or broadcast method is introduced. The combined inspection has an explicit two-request scope. Official Hive documentation and pinned core source govern Hive facts; public observations verify cursor behavior. See [transaction evidence](hive-transaction-evidence.md).


## Bounded Land snapshot and Power Core contracts — 2026-09-13

The compound land_lineup_snapshot has a named ten-logical-request exception: one deed resolution, assets, active project, plot summary, regional DEC, card definitions, one streamed collection, one bounded owner-deed search and two Power Core availability reads. It never resets the enclosing scope or follows pagination. Ordinary budgets are unchanged. It retains at most 100 selected cards and refuses output over 256 KiB. Source identities and current assignments must agree; only a calculated baseline matching backend PP, output and food values is returned. Candidate locations are verified where the single deed search returns them, with unresolved locations explicitly unknown. Missing auxiliary location/availability reads remain visible limitations. Live abilities must agree with the dated estimator resource.

Populated official-client-shaped observations supersede the empty-only item-route exclusions for STK-LND-PCR. The two dedicated tools require an explicit account and deed, pin the stake type, preserve row values and expose bounded pagination. The two card availability/grouping routes remain unverified exclusions. Inventory filtering remains a separate holdings view. Local contract tests do not themselves establish fresh built-MCP live acceptance.

The two-call workflow is snapshot followed by offline alternatives. It is not a multi-plot staking operation, an eligibility guarantee, or a transaction writer. Stake changes remain per plot.


## Official placeholder spelling — 2026-09-13

A retained official-spec audit found that the two staking deed routes had drifted to internal deed_uid placeholders. Restore deedUid in the catalogue and binders while the shared adapter preserves deed_uid and plot_id as public selectors. This changes metadata spelling, not the wire URL or returned values. Historical captures retain their then-current endpoint labels; they are not rewritten to imply a new observation.


## Conditional requests and coalescing disposition — 2026-09-13

Retire the optional conditional-GET/coalescing experiment for this pre-release. No retained measurement establishes an upstream ETag/304 contract or a useful coalescing benefit. Existing bounded metadata caches remain the supported behavior. No conditional-request savings, lossless deltas or coalescing capability is advertised. This decision does not change request bounds or the live verification requirements.


## Optional verified collection plot references — 2026-09-13

Keep the wire stake_plot numeric. Explicit include_plot_references adds reported_stake_plot_reference containing padded label, numeric ID and deed UID from one account-scoped deed search limited to200 rows. Only matching account records with consistent coordinates and unique identities resolve; missing/conflicting references remain null. A failed auxiliary read retains the collection and exposes unavailable status and source freshness. Cooling cards have left the slot, so their reported plot remains historical rather than current occupancy.

The option has a named three-logical-request ceiling; ordinary collection reads retain two and all other budgets are unchanged. There are no per-card requests or automatic pages. Changing only the option reuses the projected collection cache, while reference data is refreshed separately. Result truncation still counts whole cards after enrichment under256KiB.

## Portable ability schemas

The estimator retains its compact ability tuples, but advertises homogeneous string/number arrays with bounded length. Some tool clients cannot consume positional array schemas. Server-side parsing still checks the exact supported tuple forms and rejects malformed values before calculation. Native client availability must be verified separately from the schema regression test.

## Patched development toolchain

Vitest 4.1.11 and an esbuild ^0.28.2 override remove known development-server advisories. Keep the override until all consuming packages select patched versions without it; validate dependency updates with the complete test, build, type and privacy checks.

## Maintenance review safeguards

Workflow dependencies are pinned to immutable revisions. CI has read-only repository permissions, full fixture/source privacy checks, and a bounded runtime. Scheduled jobs are serialized; dependency updates arrive as reviewable PRs rather than automatic merges. Specification comparison ignores JSON object key order and conservatively flags retained paths when shared schema definitions change. Schedule configuration alone is not evidence of hosted delivery; the maintenance entry points still require implementation and hosted verification.


## Supported release runtime

Production guidance targets current Node.js 22 and 24 LTS patches; minimum engine version is 22.13. Node 20 is end-of-life as of the release audit and is removed from CI and scheduled jobs. CI covers Node 22 and 24; scheduled maintenance uses 24. The build sets executable permissions through node:fs rather than requiring a Unix chmod command. Source: https://nodejs.org/en/about/previous-releases (checked 2026-09-13).


## Maintained lint toolchain

The clean-install audit reported ESLint 9 as end-of-life. ESLint 10.10, @eslint/js 10.0.1 and typescript-eslint 8.70 replace the retired lint toolchain. The shared Node minimum is 22.13 to cover their documented requirements. One redundant initializer was removed under the new recommended rule; runtime behavior is unchanged. Sources: https://eslint.org/version-support/ and https://typescript-eslint.io/users/dependency-versions/ (checked 2026-09-13).


## HTTP response lifecycle and cache retention

The per-attempt HTTP deadline covers both headers and body consumption. Transport or body-stream failure follows the existing bounded retry policy and releases the host slot. A regression uses a body that never closes unless its request signal is aborted.

TTL expiration alone does not bound retained unique query keys. The shared cache now purges expired entries on insertion and uses least-recently-used eviction with a default capacity of 128. Metadata is limited to eight entries and projected collection pages to 64. Eviction can require a later re-fetch; it does not extend freshness or imply complete history. These are server retention policies, not upstream API limits.
