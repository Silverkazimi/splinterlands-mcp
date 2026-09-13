# Public VAPI market observations — 2026-09-12

Source: the official specification at https://vapi.splinterlands.com/swagger/swagger-ui-init.js and anonymous GET requests to https://vapi.splinterlands.com. No account identifiers or credentials were sent. The debug-route spec hash is SHA-256 of the captured parsed specification JSON.

| Route | Evidence |
| --- | --- |
| /market/landing | Omitted player/assets succeeded with 979 asset rows, total and usdVolume24hr. assets=PACKS selected 15 rows; PACKS,LAND selected 18. numOwned was absent without a player. |
| /market/estimated-price | asset=PACKS&detailId=ALPHA returned a USD minPrice string; landing prices used numbers. Omitting both selectors returned HTTP 400. |
| /market/meta/asset/{assetName} | All 13 categories succeeded. PACKS detailIds=ALPHA selected one record; ALPHA,BETA selected those two IDs; a JSON-array string returned empty details. Omission returned all available details. Invalid asset returned HTTP 400. |

Metadata category counts: PACKS 15, LAND 3, TOTEMS 4, TITLES 28, DEEDS 15, LAND_RESOURCES 1, TOTEM_ITEMS 4, TOTEM_FRAGMENTS 4, AVATARS 1, CONSUMABLES 12, MUSIC 76, SKINS 788, COLLECTOR_STICKERS 28.

The spec marks player, assets and detailIds required, although these calls succeeded without them. The tools require assetName, or asset and detailId for price. No maximum detailIds batch length or working pagination was established. Later bounded probes accepted 100, 101 and 788 comma-separated SKINS IDs and returned exactly the requested identities (379, 382 and 3043 query characters). No upstream batch cap was observed through 788 IDs; behavior beyond that range remains unknown. See vapi-market-batches-2026-09-12.json.

The status/data envelope, independent summaries and all retained record fields are preserved. Nested lists have a local 100-row/256-KiB limit with explicit truncation. No continuation is fetched; an oversized individual row is refused. Use detailIds to obtain a complete narrow selection, particularly for SKINS. Per-record descriptions are optional: DEEDS and MUSIC omitted them.

Fixtures retain up to three complete list rows and independent summary fields. Tests cover all 13 categories, empty selections, malformed later rows, exact selectors and whole-row limits.

/market/debug/listing and /market/debug/listing-item are excluded diagnostic routes and were not called; auth and response shapes remain unmeasured. /market/listing-items is POST in the spec, outside the GET-only transport.

/market/player/activity, /market/player/listings, /market/player/all_listings and /market/player/asset-detail-stats still require their own populated anonymous evidence and contracts. Public landing reads do not establish player-specific owned-count behavior.

The full landing response exposed a null numCirculation for FOUNDATIONS; metadata likewise returned null circulation. These are preserved, with the actual additional record retained in both relevant fixtures. Initial first-three fixtures alone missed this variant; the built live check caught it.

Built stdio verification: all five calls succeeded; public landing returned 100/979 rows, PACKS,LAND 18/18, price 1/1, selected metadata 2/2, and SKINS 100/788. See vapi-market-live-2026-09-12.json.

Reassessment: the account-route and owned-count gaps noted above were investigated on 2026-09-12 with explicit account-read authorization. All four account routes now have callable tools; populated response and selector evidence is in vapi-market-account-2026-09-12.json. Earlier account-free observations remain historical evidence; full activity paging is not established.
