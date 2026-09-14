# Endpoint knowledge tools

`list_endpoints` and `describe_endpoint` are offline MCP tools. They read the
generated catalogue and the repository's measured observation record; neither
has access to the HTTP client and neither can make an upstream request.

## Evidence model

Each endpoint and parameter exposes the same five dimensions:

- `declared` comes from catalogue provenance. A specification provenance entry
  includes its source URL, fetch date, and specification hash.
- `observed-negative` comes from the catalogue's `inertUpstream` marker for
  query parameters recorded as inert, and from the structured observations in
  `library/endpoint-observations.json` for empirical findings the catalogue
  does not carry, such as the broken `offset` and `orderBy` behaviours.
- `observed-shaped` comes from recorded observed key paths, a registered
  captured-shape predicate, or an observation that explicitly records a
  captured shape. A merely non-empty declaration does not promote an
  unobserved response to measured shape.
- `callable` comes from the exact catalogue entry IDs bound by the 154
  endpoint-calling registrations in `src/server.ts`. `owningTool` is only a
  catalogue label and is not callable evidence.
- `proven-sufficient` comes only from a measured observation that says the
  endpoint or selector answered the question it was used for.

Every dimension has a boolean `value` and an `evidence` array. `value: null`
means unknown because no evidence was found. `value: false` means evidence
exists for the negative of that dimension; it is not a missing value.

The raw parameter fields `declaredRequired`, `measuredRequired`, and
`inertUpstream` published by `describe_endpoint` are catalogue declarations,
while the five dimensions are evidence. An `inertUpstream` value of `false` is
the declaration default and is not a measurement, so it can appear beside an
`observed-negative` value of `null`.

The list summary reports 189 catalogued endpoints and 155 endpoint-calling
tools. 155 catalogue entries are callable, leaving 34 catalogue entries
uncovered. These include gated, non-functional, redundant, misleading,
insufficiently observed, and oversized responses. The README's unsupported
route tables record each route's dated classification and evidence. The two
knowledge tools are counted separately because they inspect local data. The offline estimator, three Hive evidence tools and compound land_lineup_snapshot are also counted separately. list_endpoints.additionalReadTools describes the Hive and compound tools; a compound workflow does not create a new upstream endpoint.

`measuredRequired: false` records that the upstream accepted a parameter's
absence; it does not say that omitting the parameter is safe. When an
unscoped answer is a plausible value rather than an empty result, the
registered tool refuses the call. The DEC staking tools are the worked
example: their catalogue-derived schemas advertise the measured parameters as
optional, while their handlers require the account and, for the region route,
the region uid.

## Recorded search findings

The 2026-09-06 observation record makes the deeds-search results visible
without treating the specification as a measurement:

- `player`, `tract_id`, `region_number`, and `limit` were measured working.
- `status`, `resource_symbol`, and `territory` were measured accepted and
  ignored.
- The query form of `plot_id` was measured ignored.
- `offset` was measured to repeat the first rows instead of advancing.
- The measured descending `orderBy` call returned the captured empty shape.
- Two unparameterized attempts returned no response bytes or HTTP status
  (`tests/evidence/land-result-contract-evidence.json`, `gaps[0].attempts`).

These observations are attached to their named parameters where possible. The
query-form `plot_id` and unparameterized call are standalone observations
because neither is a declared bindable parameter.

## Empty result contracts

An empty `resultContract` is reported as `resultContractStatus.state: "empty"`.
Where the catalogue records the reason, `reason` says whether the response
fields await evidence, the route was deliberately not captured, or the
unparameterized default had no response; `observedAt` and `source` identify
the dated repository evidence for that reason. No sibling endpoint shape is
copied into an empty contract. `land_deeds_owned` now has a present contract
based on its captured per-region rows and successful null response.

The two count routes demonstrate a distinct state: `resultContractStatus` is
`present`, and `observed-shaped` is `true` because captured populated
named-player responses are recorded in the catalogue. The regions route's
captured response contains 150 rows and the tracts route's contains 36 rows;
their row fields are retained in the catalogue and in
`tests/evidence/land-result-contract-evidence.json`. The unscoped captures
remain successful empty envelopes, and no selector behaviour beyond the
captured variants is inferred.

A contract may register a predicate because its declarative fingerprint cannot
express an empty collection. In that case `observed-shaped` is true on the
predicate's own captured ground; the deed-assets route is the worked example.

Observed query parameters are not automatically uncallable. A non-inert observed selector on a registered tool is bindable and remains labelled observed rather than declared. Inert observed parameters stay excluded. The profile name selector and richlist limit demonstrate working observed inputs; the richlist offset demonstrates an inert one.


Plot reference aliases are a tool-level adapter, not upstream parameters.
For the 11 plot-scoped tools, MCP tools/list advertises plot_id and deed_uid
alternatives; this endpoint catalogue continues to describe the primary
route's actual wire selectors. A reference-resolution read may precede that
primary route. See library/observations/plot-labels-2026-09-12.md.


Collection color and sub_type are local join filters, like its local cursor and production-power threshold. They are not sent to /cards/collection. Collection execution may first fetch the full public /cards/get_details catalogue under the existing transport cap, cache only its projected join map, and then stream the collection. This two-source operation reports definition provenance separately and is limited to two distinct requests. Explicit include_plot_references permits one additional bounded account-scoped deed search, for a three-request ceiling; it adds verified display identities where resolved and retains unresolved labels as null. The independently callable cards_get_details tool retains its existing filtered-result policy.
