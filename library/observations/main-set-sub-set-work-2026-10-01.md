# Main set and print class implementation — 2026-10-01

Implementation findings for the main-set/sub-set fields; the rationale is in [card-set-vs-edition-2026-10-01.md](card-set-vs-edition-2026-10-01.md) and `library/decisions.md`.

- `main_set` preserves the row's `card_set`. `print_class` and `sub_set` are derived only from the numeric `edition`. An edition number the table does not know stays unmapped and is flagged with `edition_unmapped`, never guessed.
- The version-2 edition table covers every known edition number from 0 to 21 and every observed `card_set` value.
- One shared normalizer runs on projected collection copies and on bounded `cards_find` rows, so both tools classify a card identically. The edition matrix and named regressions are covered by `tests/card-set-hierarchy.test.ts`.
- The generated catalogue must be changed through `scripts/catalogue-input.json` and regenerated; editing `src/catalogue/catalogue.json` directly fails the catalogue-generator test.
- Offline checks passed: typecheck, lint, build, full privacy scan and the full suite (80 files, 584 tests).
