# `/land/deeds/search` carries production data inline — measured 2026-09-07

Measured by driving the built server over stdio as an MCP client against the live
API, at the M24 Checkpoint-2 gate. Account `sample-account-a`, 129 deeds across four regions.

## What the limited response actually carries

`data` is an object holding **three** arrays, not one:

| Array | Notes |
|---|---|
| `deeds` | the deed rows |
| `worksite_details` | includes `work_per_hour_per_one_pp` |
| `staking_details` | includes `total_work_per_hour` |

All three carry `deed_uid`, which is the only key that joins them.

## The observation this records

Of a 20-row page, **10 rows had `total_work_per_hour` of exactly 0, and those rows
carried `is_powered` false**. The highest row was `273.174` on a powered Ore Mine
deed producing IRON with 6 workers.

**What this does and does not establish.** It records a co-occurrence on one page of
one account on one day. It does **not** establish that a zero proves a deed is
unpowered, that an unpowered deed always reports zero, what the figure counts beyond
its field name, or what any unobserved value means. No causal claim is made and none
should be read into the tool description that cites this file.

## Why it was recorded

The fields are declared in the catalogue and validated by contract tests, so by every
internal measure they were covered — yet the tool description never mentioned them,
and the measured consequence was an assistant fanning out to roughly 129 per-deed
calls for data the second call had already returned. The correlation above was
observed live and existed only in a lane's report and in test fixtures. A tool
description may not rest on either, so it is written down here.
