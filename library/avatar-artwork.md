# Custom avatar data and artwork

Use player_custom_avatar for saved avatar-builder settings. Its numeric level field is metadata and remains available to clients independently of artwork. The tool currently returns JSON, not a composed image.

Artwork must not automatically include a level numeral. Any level label belongs in the consuming client's interface, separate from the image. The eventual rendering acceptance test must prove that changing only level cannot add or change level text in the artwork.

The older player_avatar tool resolves a legacy profile image redirect. That endpoint may return RUNI artwork and does not establish the custom character's appearance.

Custom character layers are configured by the official game client. A single account proof does not establish complete rendering support for all bloodlines, cosmetics, badges or future additions. Production image rendering remains pending.
