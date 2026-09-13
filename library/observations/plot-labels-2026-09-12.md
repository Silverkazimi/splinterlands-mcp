# Plot display-label investigation — 2026-09-12

The official Land Deeds FAQ describes 150 regions, 10 tracts per region and 100 plots per tract:
https://support.splinterlands.com/hc/en-us/articles/13434490251796-Land-Deeds-FAQ

The official Land API guide identifies GET /land/deeds/{plot_id} as a numeric map-plot lookup:
https://support.splinterlands.com/hc/en-us/articles/21403335122836-Land-APIs

These facts do not establish the numeric ID allocation order. Ten fresh anonymous calls to https://vapi.splinterlands.com/land/deeds/{plot_id} tested boundaries without sending player identifiers.

| Numeric ID | Region | Tract | Plot |
| --- | --- | --- | --- |
| 1 | 1 | 1 | 1 |
| 100 | 1 | 1 | 100 |
| 101 | 2 | 1 | 1 |
| 1000 | 10 | 1 | 100 |
| 1001 | 11 | 1 | 1 |
| 15001 | 1 | 2 | 1 |
| 15101 | 2 | 2 | 1 |
| 30001 | 1 | 3 | 1 |

The calls for 15000 and 150000 returned no populated coordinate record. This does not prove that the corresponding display location is invalid.

Every populated capture is consistent with the candidate encoding:

    id = (tract - 1) * 15000 + (region - 1) * 100 + plot

That is an inference from captured data, not a numbering guarantee published in the FAQ. The tempting region-major formula is contradicted by plot 101. Any implementation using the candidate must verify the returned region_number, tract_number and plot_number against the requested label before presenting a deed. An empty lookup cannot by itself validate the inferred encoding or establish nonexistence of a display location.

plot-label-boundaries-2026-09-12.json retains the ten dated outcomes and coordinate comparisons. The investigation establishes candidate lookup evidence, not a universal allocation guarantee.


## Verified display-label input

land_deed_by_plot now accepts a positive integer or a padded/unpadded region-tract-plot string in plot_id. Labels require region 1-150, tract 1-10 and plot 1-100. Strings containing only a numeric ID remain invalid; callers should use a JSON number for numeric IDs.

One logical GET uses the candidate numeric ID. A label succeeds only if the returned numeric ID and all three coordinates match and a nonempty deed UID is available. Otherwise plot_resolution_unverified is returned without presenting the different deed. Empty label resolution is explicitly uncertain; numeric lookup retains its existing empty-result behavior.

Populated responses include plot_reference with plot_id, plot_label and deed_uid derived from the actual response. Existing fields remain intact except the established owner redaction. Unknown inputs, including credentials, are rejected before HTTP.

Shared numeric/label/UID selection is now implemented across the 11 current plot-scoped tools; collection joins, worker views, estimator and rules resources remain separate work.

Built stdio verification passed for an unpadded label, a padded label, a numeric ID and an empty label resolution. See plot-labels-live-2026-09-12.json; the last case deliberately returns plot_resolution_unverified rather than a false absence claim.


## Shared reference adapter

The two deed lookups, four project reads, two staking reads, taxes, reward actions and reward-action count accept exactly one plot_id (number or label) or deed_uid. The original deedUID spelling remains accepted on the three resource routes. Other query inputs retain their existing validation and are forwarded to the target only. Ambiguous references are rejected before HTTP.

Native deed lookups reuse their own response. Other requests resolve a reference through the existing numeric or UID catalogue route, verify its identity, then call the original target route. Cross-route deed lookups also verify the final identity. No target request follows a failed or mismatched resolution. Returned plot_reference contains the verified ID, label and UID; plot_resolution metadata contains the original supplied reference and the resolution trace/freshness. The target retains its own provenance and wire data, including successful empty target results.

Only these 11 named tools receive a hard two-distinct-request allowance. The collection metadata join also has an explicit two-request allowance; other tools remain limited to one. Nested scopes cannot reset an existing budget; same-URL retries do not count as additional distinct requests. The adapter does not crawl, batch plots or fetch continuation pages.

Two fresh UID-view captures of the public map deeds used for boundary tests exposed null listing_price, market_id, market_listing_id, market_listing_status_id, market_updated_date and unlock_date. The original listed-deed fixture did not cover those nulls. The UID contract now accepts the captured nulls while retaining numeric/string checks for non-null values. Fixtures plot-uid-unlisted-101 and plot-uid-unlisted-15001 retain complete responses. Numeric and UID views have distinct contracts; their field types are not merged.


Built stdio verification exercised all eleven tools with a display label and two additional deed_uid aliases: 13 successful calls with matching plot identities. Retained results: shared-plot-references-live-2026-09-12.json. These live checks preceded the final native numeric-ID mismatch guard and freshness-age refinement; the subsequent focused suite passed 43 tests, including that guard.
