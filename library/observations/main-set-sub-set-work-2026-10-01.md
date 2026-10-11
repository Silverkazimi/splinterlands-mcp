# Main set and print class implementation notes — 2026-10-01

Work in progress. The public MCP will preserve `card_set` as `main_set` and derive `print_class` / `sub_set` solely from numeric `edition`. Unknown editions will stay unmapped. Evidence and verification details will be added as implementation proceeds.

Implementation: the version-2 table now covers every known number 0–21 and every observed `card_set` value. The shared normalizer runs on projected collection copies and bounded find rows. The matrix and requested named regressions are covered in `tests/card-set-hierarchy.test.ts`. The public observation addendum and decision entry contain the durable rationale; this file records implementation progress and check results.

Checks at this stage: typecheck, lint and build pass. The first full vitest run had three failures: a catalogue-generator mismatch from an attempted generated-file edit, plus npm cache EROFS and a loaded-run timeout. The generated-file edit was removed. A rerun with npm cache under `/tmp` and three workers passed those three tests; the full suite then found one tool-input inventory test that needed the two new local filter keys. That inventory test and the hierarchy tests now pass. A final full suite rerun is pending.

Final verification: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run leak-check:full` passed. The full suite passed with `npm_config_cache=/tmp/splinterlands-mcp-npm-cache npx vitest run --maxWorkers=3`: 80 files, 584 tests. The writable cache avoids the sandbox's read-only home cache; the lower worker count avoids an unrelated loaded-run timeout. No live game API or account network verification was performed for this change.
