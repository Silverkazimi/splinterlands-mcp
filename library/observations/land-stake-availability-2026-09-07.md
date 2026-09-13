# Land stake availability observations — 2026-09-07

## Assessment

This repository made 14 live requests on 2026-09-07 across the four public
routes below. No call returned a populated response body, and no row was ever
returned. The assessment establishes route identity and observed stake type
values only; it does not establish an exhaustive stake type enumeration or a
response contract.

The staked records already captured in
`tests/fixtures/land-stake-assets-rows.fixture.json` contain these observed
`stakeTypeUid` values:

- `STK-LND-WKR` on cards.
- `STK-LND-PCR` and `STK-LND-TOT` on items.

These three observed values are not known to be exhaustive. The identity is
publicly observable, and no authenticated request was required for this
assessment.

## Request shapes and outcomes

| Route | Request shapes tried | Outcome |
| --- | --- | --- |
| `/land/stake/cards/STK-LND-WKR/available` | `player`; `deedUid`; `limit` with `offset`; and no query parameters | Every response was `{"status":"success","data":null}`. None of the eleven declared-required query parameters was enforced. |
| `/land/stake/items/STK-LND-PCR/available` | No query parameters; `player`; `deedUid`; and both `deedUid` and `player` | The calls missing either `deedUid` or `player` produced a 400 error nested inside HTTP 200 with an envelope whose status was `success` and a body name of `AppException`. Supplying both returned `{"status":"success","data":{"ids":[]}}`; no `ids` element was observed. |
| `/land/stake/cards/STK-LND-WKR/grouped` | Multiple path/query attempts, including the available identity and paging shapes | Every response had `data: null`. |
| `/land/stake/items/STK-LND-PCR/grouped` | Multiple path/query attempts, including the available identity and paging shapes | Every response had `data: null`. |

The `limit`/`offset` behavior is unmeasured rather than absent: no populated
body was returned from which paging could be evaluated. The 200-wrapped
`AppException` is recorded as an observed hazard, not as a response shape;
the non-2xx condition does not reach the result matcher, and the wrapped error
must not be used to invent a contract.

The official client bundle measured by this repository contains no calls to
the availability or grouped route family. This is a repository measurement,
not a claim about any third-party source.

No callable tool is registered for these routes, and no response contract is
recorded for them. In particular, the empty `ids` array establishes no type or
shape for its elements.
