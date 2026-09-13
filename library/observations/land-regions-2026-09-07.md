# Land count and volume observations — 2026-09-07

These observations were made from this repository against the public `vapi`
host on 2026-09-07. Every request returned HTTP 200 with JSON content.

`GET /land/volume` took no query parameters and returned an object envelope
with `status: "success"` and `data` containing `sum` and `count`. Both fields
were JSON strings in the observations. Two unscoped captures about an hour
apart returned different bodies: `sum` decreased by exactly 10.000 and
`count` decreased by exactly 1. The figures are therefore not a cumulative
total. What they measure and over what period is not stated by the response;
a rolling window is an inference and is not claimed here.

`GET /land/regions/counts` with no query returned
`{"status":"success","data":[]}`. The same empty envelope was returned for
the following individual requests:

- `status=active`
- `status=not_a_real_status`
- `plot_type=keep`
- `kingdom_type=azmare`
- `magic_type=life`
- `rarity=common`
- `geography=arid`

The undefined status value was accepted without complaint rather than
rejected. `GET /land/tracts/counts` with no query returned the same empty
envelope. A request carrying `geography=arid`, which is not declared for that
route, also returned the same empty envelope and was recorded as an undeclared
query-name tolerance observation.

The unscoped requests to regions and tracts establish that their selectors
are not required for acceptance. They do not establish whether a selector
narrows the result or is accepted and ignored: an empty list is consistent
with both an ignored selector and a selector operating over an empty
unscoped population. No request made by this repository separates those
readings. No request in this earlier unscoped probing round supplied `player`.
Later named-player captures, recorded below, returned populated rows.

The empty responses shared `W/"1e-…"`. That ETag is derived from the identical
30-byte response body (`0x1e` is 30), and the same ETag was seen on an
unrelated endpoint previously; it corroborates nothing and is not evidence.

Captured named-player responses for both count routes are recorded in
`tests/evidence/land-result-contract-evidence.json`: the regions route returned
150 rows (`:1024`), and the tracts route returned 36 rows (`:1049`). The
captured region rows contain `region.uid`, `region.name`,
`region.region_number`, `for_sale`, `owned`, `listed`, `min_price`, and
`dec_stake`; the captured tract rows contain `region.uid`, `region.name`,
`region.region_number`, `tract_number`, `owned`, and `listed`. These are the
observed shapes for the captured named-player responses only; the unscoped
requests still returned successful empty envelopes, and no broader selector
effect is inferred.
