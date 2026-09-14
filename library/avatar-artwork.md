# Custom avatar data and artwork

Use player_custom_avatar for saved avatar-builder settings. Its numeric level field is metadata and remains available independently of artwork. The default call returns JSON only.

Set render to true to request a PNG image content block alongside that JSON. The renderer composes official WebP assets for the saved character, background and chosen frame. It does not paint the level numeral onto the artwork. Badges and the exemplar level frame/gem are interface overlays and are excluded; badge selections and level remain in the metadata. A client can display them separately.

The fixed asset mapping covers the human, elf, orc and dwarf body variants from the official client observed on 2026-09-14. Unknown selections are errors, not silently omitted cosmetics. This is a dated composition, not an upstream pre-rendered-image endpoint. Artwork fidelity beyond the verified mapping must be rechecked when the client changes.

Rendering uses only the mapped CloudFront asset host. It does not follow redirects or accept caller-supplied URLs. At most 24 assets are requested sequentially with a 100 ms interval, a 45-second download deadline, 2 MiB per asset and 24 MiB total. Each input must be a single-frame 768 by 768 WebP. Composition has a 10-second processing limit; output is a 768 by 768 PNG capped at 4 MiB. One render may run per server instance; concurrent renders are refused rather than queued without a limit. Metadata calls retain normal API bounds.

The older player_avatar tool resolves a legacy profile image redirect. That endpoint may return RUNI artwork and does not establish the custom character's appearance.

## RUNI image variants

RUNI art is separate from the avatar-builder character. The legacy redirect can select a round portrait; it should not be treated as normal card artwork.

The official RUNI image host exposes these observed paths, where TOKEN_NUMBER is the individual RUNI number:

| Image | Path on https://runi.splinterlands.com | Observed dimensions |
| --- | --- | --- |
| Round portrait | /avatars/TOKEN_NUMBER.png | 150 by 150 PNG |
| Card image | /cards/TOKEN_NUMBER.jpg | 300 by 420 JPEG |
| Square artwork | /images/TOKEN_NUMBER.png | 3000 by 3000 PNG |

These routes and dimensions were checked for one public RUNI on 2026-09-14. That observation does not establish availability for every token, ownership, or a universal mapping from every card UID. The player_avatar tool only returns the selected legacy redirect URL; it does not fetch these variants or offer a RUNI metadata lookup. A separate variant resolver would need token validation, bounded retrieval and its own acceptance tests.

The mapping is factual asset/configuration data extracted from the public official client: https://splinterlands.com/assets/index-CETWKRFI.js. No account identifier or player-specific selection is embedded in the renderer. Tests compare PNG bytes across level-only changes and exercise unsupported selections, redirect/format/size rejection and MCP image delivery.

## Refreshing the asset map

Download the current public client bundle referenced by the official website, retaining its source URL and observation date. Run the static extractor against that local file:

    node scripts/extract-avatar-layers.mjs client.js candidate-layers.json https://splinterlands.com/assets/CURRENT-BUNDLE.js YYYY-MM-DD

The extractor parses JavaScript as data and never executes the downloaded bundle. It stops on unfamiliar syntax or changed common-option counts. Review the resulting diff against the official renderer before replacing src/avatar/layers.json, then run the artwork and protocol tests and a bounded live render. Update mappings through a reviewed PR; do not automatically trust a changed bundle. No player account is needed to extract the map.

The renderer uses sharp 0.35.4 (Apache-2.0) for bounded WebP decoding and PNG composition. The runtime dependency is explicitly allowlisted; the installation audit reported no known vulnerabilities. It is loaded only when rendering is requested, and image bytes come from fixed official asset paths rather than arbitrary URLs or filesystem paths.
