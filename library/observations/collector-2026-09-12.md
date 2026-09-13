# Collector configuration observations — 2026-09-12

Sources: the official VAPI specification at https://vapi.splinterlands.com/swagger/swagger-ui-init.js and an anonymous GET of https://vapi.splinterlands.com/collector/config. No player identifier or credential was sent. The specification hash in excluded-route provenance is SHA-256 of the captured parsed JSON.

The 15,207-byte response contained status/data, four page/slot limits, claim metadata, placeholder cosmetics, 10 shop items, 6 featured accounts and 70 cosmetic definitions. The fixture retains the complete response, including relative asset paths, null claim expiration, and nullable cosmetic assetUrl values. No asset URL is invented or fetched.

collector_config returns the complete configuration. It does not claim rewards, make purchases, fetch profiles for featured accounts or follow asset paths. The shop operation name is upstream data only. There is no cross-call cache. If the record exceeds 256 KiB, it is refused as a whole, preserving the distinction between a complete configuration and a partial list.

The contract validates the root sections and every shop/featured-account/cosmetic row against captured common fields. Empty lists remain valid when the required surrounding configuration is present. Malformed later rows, missing configuration, and incompatible limit types are rejected. Tests also cover oversized records and rejection of undeclared account/credential inputs.

The official specification explicitly declares bearer authentication for /collector/me, /collector/me/stickers and /collector/me/binders/{binderId}. They are catalogued as excluded and were not called. This is declared authentication evidence; runtime gating and response shapes remain unmeasured.

The five public player-specific routes (stickers for_sale, tradeable and all, player overview, and binder detail by binderRef) still require independent live evidence and contracts. Public configuration success does not establish their availability or selectors.

Built stdio verification succeeded with all nine configuration sections, 10 shop items, 6 featured accounts and 70 cosmetics. See collector-live-2026-09-12.json.
