# Game metadata observations — 2026-09-12

Main API declarations: https://api2.splinterlands.com/doc/swagger-ui-init.js, SHA-256 5186c675fb53a13c14c852803b2638232ad111796fb67991e7591224fde4f9ab. The health root was directly observed at https://vapi.splinterlands.com/. Captures used serial unauthenticated GETs, 20-second timeout, 2 MiB consumed-body cap and 300 ms pauses.

| Probe | Host | Route | HTTP | Bytes |
|---|---|---|---|---|
| settings | api2.splinterlands.com | `/settings` | 200 | 40671 |
| settings-matching | api2.splinterlands.com | `/settings` | 200 | 40670 |
| last-block | api2.splinterlands.com | `/last_block` | 200 | 24 |
| maintenance | api2.splinterlands.com | `/maintenance_schedule` | 200 | 181 |
| maintenance-filtered | api2.splinterlands.com | `/maintenance_schedule` | 200 | 181 |
| lookup | api2.splinterlands.com | `/transactions/lookup` | 200 | 5810 |
| lookup-unknown | api2.splinterlands.com | `/transactions/lookup` | 200 | 92 |
| metrics | api2.splinterlands.com | `/transactions/metrics` | 200 | 1053299 |
| metrics-filtered | api2.splinterlands.com | `/transactions/metrics` | 200 | 133 |
| metrics-two | api2.splinterlands.com | `/transactions/metrics` | 200 | 270 |
| health | vapi.splinterlands.com | `/` | 200 | 102 |

Settings without selectors returned a full 40671-byte body. Supplying the captured version and config_version returned a full 40670-byte body with the same root field set; a one-byte difference does not establish a delta protocol. Configuration is always fetched rather than transcribed. Successful exact-query responses are cached one hour with original retrieval time, advancing age, and a 32-entry bound.

Unfiltered transaction metrics returned twelve series and 1053299 bytes. metrics=battles with from=2026-09-10 returned one series and two daily points; the comma-separated battles,battles-modern selector returned two such series. The tool requires explicit metrics and from and keeps each series intact. No timezone or inclusive-boundary rule is inferred from these captures.

Transaction lookup used a captured public market-purchase transaction ID and returned trx_info. An all-zero ID returned an error object. Transaction data/result fields retain their encoded string values. Maintenance with September date bounds returned the same window as the unfiltered call; complete date-filter semantics remain unverified. Health returned status=success and an object containing app, version and env. This does not establish availability of every endpoint.

Fixtures preserve full responses. The local output cap remains 256 KiB and 100 root rows; oversized objects or series are refused without deleting fields.

## Built transport verification

All six metadata/health tools passed live built-stdio calls, including seven calls with a repeated settings read. The repeated read preserved retrievedAt while ageMs increased. See [live summary](game-metadata-live-2026-09-12.json). Discovery returned 117 tools. Full validation passed: 210 tests across 23 files, typecheck, lint, build, full privacy scan and diff whitespace checks.
