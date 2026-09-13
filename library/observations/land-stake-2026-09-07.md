# Land staking observations — 2026-09-07

## Provisional implementation notes

The two staking routes need separate tools and separate contracts. The assets response can be a
successful object containing empty `cards` and `items` arrays, so its declared collection fingerprint
cannot validate the blank response by itself; the entry will retain that fingerprint and use a
registered predicate for validation. The deed-details response is a flat, fully present record even
for a deed with nothing staked, so its contract can remain declarative.

The assets route reports its boost, production-point and work figures as JSON strings, while the
details route reports the corresponding deed-level figures as JSON numbers. The implementation will
preserve those wire types and will not reconcile them. Three null-only asset keys remain undeclared:
`data.cards[].delegated_to`, `data.cards[].rental_type`, and `data.items[].stake_ref_id`.

The two path parameters will be advertised as `deed_uid`; the remaining camel-case parameters are
query parameters and are not part of this change.

## Captured observations

The assets route was captured for three deed uids: `I-296-d14043817866fa`,
`I-291-aafc48f64a8856`, and `I-296-3f7a71183eda45`. The details route was
captured for the same three uids. Every request was a `GET` with an empty query
object and returned JSON over HTTP 200. The durable records report these raw
response sizes and row counts:

| Route state | HTTP | Bytes | Row count |
| --- | ---: | ---: | ---: |
| assets, empty | 200 | 51 | 0 cards, 0 items |
| assets, populated deed 1 | 200 | 5740 | 5 cards, 1 item |
| assets, populated deed 2 | 200 | 6031 | 5 cards, 2 items |
| details, zeroed | 200 | 1435 | 1 record |
| details, active | 200 | 1469 | 1 record |
| details, active deed 2 | 200 | 1486 | 1 record |

The blank assets body is:

```json
{"status":"success","data":{"cards":[],"items":[]}}
```

The blank details response is a successful envelope whose `data` is a fully
present 56-field record. Its numeric fields are zero, its boolean flags are
false, and `active_land_project_id` is null. It is therefore a populated
answer, not an empty result. The two blank shapes are deliberately preserved
as separate route behaviour.

The assets fingerprint declares 55 paths. Its two populated bodies exhibit
all 55 paths with the declared types, but the blank body exposes only the
envelope, `data`, and the two empty arrays. The fingerprint alone therefore
rejects the blank body because the walker does not enter an empty collection;
the registered predicate validates the same per-row declarations and accepts
empty collections.

Three keys were present and null in every observed asset row but remain
undeclared: `data.cards[].delegated_to`, `data.cards[].rental_type`, and
`data.items[].stake_ref_id`. A null-only observation establishes no type, and
the schema does not permit a `null` declaration. The keys remain in the
upstream response and have fixture `valueClass: "opaque"` entries.

The wire types differ by route. Assets carries boost and production-point
figures as strings such as `"0.100"` and `"200.000"`; details carries the
deed-level equivalents as JSON numbers such as `0.1` and `1100`. Neither
route converts or reconciles those values. The details declaration remains
owned by its entry even though its field set corroborates the existing
`staking_details` validation used elsewhere.

The same syntactically valid but unrecognised deed uid was sent to both routes
three seconds apart. Assets returned HTTP 400 with a `fail` envelope containing
`message`, `status`, `timestamp`, and `traceId`, with no `data` key. Details
returned HTTP 200 with `{"status":"success","data":null}`. The HTTP 400 is
classified before any result contract is consulted, so no contract or
predicate branch describes that envelope. The successful no-record answer
establishes neither that the deed exists nor that it does not: the one observed
blank deed returned the fully present zeroed record instead.

No deed carrying a staked Runi was observed, so the predicate's tolerance for
null in declared fields records missing evidence rather than a nullability
claim.

## Implementation status

The manifest, generated catalogue, route predicate, two derived-schema tools,
regression checks, and public documentation are updated. `npm run build`
completed successfully. `npm run typecheck` and `npm run lint` emitted their
normal command banners but stalled without diagnostics and were stopped; no
test runner, generator, leak-check, or network request was run in this lane.
