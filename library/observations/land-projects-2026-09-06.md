# Land project observations — 2026-09-06

This note records live observations from the public VAPI routes. The four repaired routes answered HTTP 200
with a VAPI envelope on 2026-09-06:

- `GET /land/projects/deed/{deed_uid}/active` returned either a populated `data` object or `data: null`.
- `GET /land/projects/deed/{deed_uid}/list` returned a `data` array, including an empty array.
- `GET /land/projects/deed/{deed_uid}/list/count` returned a `data.count` number, including zero.
- `GET /land/projects/deed/{deed_uid}/requirements` returned either a row array or `data: null`.

The active and history project records carried the same 58 field names. `segments` was an array on every
observed history row and null on both observed populated active responses. Seven history fields were observed
both with their declared wire type and with null, so they remain required nullable fields. No absent project
field was observed in the six-row history response.

The history request comparison was:

| Request shape | Rows | Returned ids |
| --- | ---: | --- |
| bare | 6 | 44752, 65787, 159607, 161272, 231752, 231753 |
| `?offset=1` | 6 | 44752, 65787, 159607, 161272, 231752, 231753 |
| `?limit=2` | 2 | 44752, 65787 |
| `?limit=2&offset=2` | 2 | 44752, 65787 |

These calls show that `limit` narrows from the start and that `offset` did not advance the response. They do
not establish an upstream maximum for a call without `limit`, or a general ordering guarantee.

On 2026-09-06 one deed returned seven requirement rows all reporting `work_per_hour` `"0.0000"`,
`projected_hours` `999999999.999`, and a `projected_end` about five thousand years after the request
instant; another deed returned seven rows with a non-zero rate and a projection about a day ahead. The
pairing was observed at deed level on two deeds; no rule linking the rate to the projection is claimed.

The captured bodies and request records are retained in `tests/fixtures/` and
`tests/evidence/land-result-contract-evidence.json`.
