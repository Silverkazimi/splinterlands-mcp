# MCP suite execution — 2026-09-04

Findings from one execution of the project checks at revision `9e9846d` (the first working tool), on Node.js 24.15.0 with the committed lockfile. This was an early pre-release state; every failure below has since been fixed, and the current suite is green.

| Check | Result | Finding |
| --- | --- | --- |
| `npm run typecheck` | failed | One diagnostic, TS2345 at the tool handler: a `structuredContent: unknown` branch was not assignable to the SDK's result type, which requires an object or undefined. |
| `npm test` | failed, 37 of 39 tests | `tests/bin.test.ts`: the built binary closed before answering the protocol handshake. `tests/server.test.ts`: the invalid/missing-input case compared `String(result)` (which is `[object Object]`) with `"plot_id"`, so the test stopped there and its later `fetchCalls === 0` assertion never ran. |
| `npm run build` | passed | The bundle was emitted. This did not prove a working protocol exchange, since the binary test failed. |
| `npm run leak-check` | failed, 6 hits | Under a sandbox, `tsx` was first refused its IPC pipe (`listen EPERM`), which is a runner error, not a verdict. With IPC permitted, the guard ran and found six hits: five absolute paths written into this report itself and one pre-existing name in `library/decisions.md`. |

## What this established

- The leak guard detects live matches, and its guard tests exercise planted failures, but its fixed pattern categories are not an exhaustive list of private names. Each hit still needs human review to tell report artefacts from product leaks.
- A passing build or a partly passing protocol test proves less than it seems: the build does not prove the binary answers, and a test that stops early leaves its remaining assertions unproven.
- The missing-input preflight question was later settled separately; see [FINDING-capability-failures.md](FINDING-capability-failures.md).
