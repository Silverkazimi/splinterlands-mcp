# Capability Failure Diagnosis

## Scope and evidence boundary

This is a read-only diagnosis of the three real-network capability failures and the two failing tests from the 2026-09-04 suite. No source or test fix is applied here. The real HTTP observations are accepted as given; local probes below use injected or synthesized bodies only.

## 1. Plot 1: 41 `data` keys reported as malformed

**Diagnosis — certain about the validator mechanism; exact offending path was not determinable from the preserved body summary at the time this finding was written.** The response is not rejected because it has 41 keys. `matchesResultContract` first checks the outer envelope, then the configured required paths, then compares only declared fingerprint paths and their JSON types (`src/catalogue/fingerprint.ts:93-130`). `walkValue` ignores every path absent from the declared fingerprint (`src/catalogue/fingerprint.ts:32-51`). Neither the count nor identity of additive keys is compared.

**Amendment, 2026-09-05:** A later full path/type comparison closed that evidence gap. The offending paths are `data.resource_id` and `data.resource_symbol`; both are typed declarations whose values are null on the listed plot. The original conclusion was sound for the body summary preserved at that time and is retained as a historical conclusion.

**Amendment, 2026-09-05 (fixed same day):** Commit `860a207` ("land_deed answers for a real plot, and an invalid plot number no longer reaches the network") added an optional `nullable` flag to fingerprint declarations, honoured by the type comparison in `matchesResultContract` (`src/catalogue/fingerprint.ts:124-129`). `data.resource_id` and `data.resource_symbol` are now declared `"nullable": true` while keeping their declared types and required status (`src/catalogue/catalogue.json:119-127`), so a market-listed plot with no assigned resource no longer fails validation.

The six formerly-null market/lock fields populated on plot 1 are only recorded under `observedKeyPaths`; none is in this endpoint's typed fingerprint or `requiredKeyPaths` (`src/catalogue/catalogue.json:19-239`). In particular, `listing_price` is observed as the quoted string `"100000"` (`library/observations/by-plot-2026-09-04.md:61-75`), but there is no `data.listing_price` declaration at all. It is therefore not incorrectly declared as a number—or as any type—and cannot be the rejecting field in the current code. This agrees with the tolerant-projection decision: null-only paths remain untyped and non-required, and additive fields are ignored (`library/decisions.md:26-40`).

A local synthesized-contract probe confirmed the source trace: a valid declared projection passed; adding `future_field` passed; adding `listing_price` as string, number, or null all passed; changing declared `created_block_num` to null failed. Therefore the observed plot-1 body can return `upstream_malformed` only if at least one configured required path is absent, or at least one configured fingerprint path has a different JSON type. Since the retained observation records only the six newly non-null paths—not all 41 key/value types—the precise field is not recoverable here. Presenting any named field as the cause would be inference, not diagnosis.

The HTTP client parses the body, supplies the catalogue predicate as `validate`, and passes both to `classifyResponse` (`src/http/client.ts:247-278`). Given the observed valid JSON and HTTP 200, the response-shape validator is the only remaining `upstream_malformed` branch (`src/http/errors.ts:210-218`).

## 2. Non-existent plot: `{status:"success", data:null}` reported as malformed

**Diagnosis — certain from source and a local injected-body probe.** The outer object satisfies the `vapi` envelope check (`src/catalogue/fingerprint.ts:93-102`). The empty-result exception accepts only `data` that is an empty array (`src/catalogue/fingerprint.ts:104-115`), not null. Although the required path `data` itself is present, the first required nested `data.*` lookup cannot descend through null, so validation returns false (`src/catalogue/fingerprint.ts:67-90,116-130`; required paths at `src/catalogue/catalogue.json:203-239`).

`classifyResponse` invokes that validator before checking emptiness (`src/http/errors.ts:213-220`), producing `upstream_malformed`. Moving emptiness after validation therefore did not make null-shaped empty results successful. Even if the order were reversed, `isEmpty` recognizes a null *body*, a top-level empty array, or an envelope whose `data` is an empty array; it does not recognize an envelope whose `data` is null (`src/http/errors.ts:161-171`). C4 covered empty arrays, not the real null payload documented for plots 75000 and 120000 (`library/observations/by-plot-2026-09-04.md:81-90`).

**Amendment, 2026-09-05:** This defect is fixed. Commit `0212d6e` ("a plot that does not exist gets an answer, not a verdict of malformed") made `isEmptyResult` in `src/http/errors.ts` (now handling a null `data`, an empty top-level array, an envelope's `data` as an empty array, or an envelope carrying `status` with no `data` key at all) the single shared definition, and `matchesResultContract` now short-circuits to that definition before the required-path walk for a `vapi` envelope (`src/catalogue/fingerprint.ts:97-102`): an empty result only needs a correctly typed `status`. `{status:"success", data:null}` is therefore no longer `upstream_malformed`. The diagnosis above is retained as a historical conclusion, accurate as of 2026-09-04.

## 3. Negative `plot_id` reached the network; invalid-input test rendered `[object Object]`

### Negative input

**Diagnosis — certain from source and a local injected-fetch probe.** The catalogue says only `type: "integer"` for `plot_id` (`src/catalogue/catalogue.json:7-13`). `schemaForParameter` maps every integer parameter to `z.number().int()` with no minimum, positivity, or non-negativity constraint (`src/catalogue/index.ts:107-131`). `bindRequest` validates against that same schema and substitutes the accepted value into the path before execution (`src/catalogue/index.ts:160-193`). Thus `-5` is a valid integer to both validation layers, becomes `/land/deeds/-5`, and reaches fetch. The existing server test exercises a string and a missing value, not a negative integer (`tests/server.test.ts:91-103`).

### `[object Object]` in the test

**Diagnosis — certain from a local in-memory MCP probe.** MCP `callTool` resolves invalid arguments as a call result object such as `{isError:true, content:[{text:"... at plot_id"}]}`; it does not reject the promise. Consequently the `.catch(...)` callbacks at `tests/server.test.ts:98-99` do not run, and `String(resultObject)` at lines 101-102 is exactly `[object Object]`. The assertion must inspect the result's `isError` and text content (or otherwise serialize the content), not stringify the container object.

The suite stopped at line 101, so its `fetchCalls === 0` assertion at line 103 never executed (`library/RUN-mcp-suite-2026-09-04.md:94-106`). A separate local injected-fetch probe found zero calls for the tested string and missing inputs, then one call for `plot_id:-5`. Thus the current code does preflight-reject the two cases the test attempted to cover, but the failed suite did not prove that fact; negatives remain accepted.

**Amendment, 2026-09-06:** Both defects in this section are fixed. `scripts/catalogue-input.json:2009` now declares `"minimum": 1` for `plot_id`, carried into `src/catalogue/catalogue.json:13` and enforced by `boundedNumberSchema` (`src/catalogue/index.ts:107-117`), so `-5`, `0`, and non-integers are rejected by the input schema before `bindRequest` reaches fetch. `tests/server.test.ts:150-171` now asserts on `result.isError` and the text content (not `String(resultObject)`) for six invalid inputs including `-5`, `0`, and `1.5`, and asserts `fetchCalls === 0` after the loop. The diagnosis above is retained as a historical conclusion, accurate as of 2026-09-04.

## 4. Ignoring the response envelope's `status`

**Ruling — certain that it is not a cause of these three observations; certain that it is a separate latent defect, with its real-world manifestation unverified.** `classifyResponse` uses HTTP status, parse state, the supplied shape validator, and emptiness, but never reads `body.status` (`src/http/errors.ts:174-235`). The contract validator requires `status` to exist and be a string, but never requires the value `"success"` (`src/catalogue/fingerprint.ts:112-129`; declaration at `src/catalogue/catalogue.json:154-157`).

The two supplied response bodies—plot 1 and the non-existent plot—already say `status:"success"`. Reading that value would not make plot 1's declared projection match or make `data:null` count as empty. No upstream body/status was supplied for `-5`, but response-status interpretation necessarily occurs after the network request and therefore cannot explain why the request was made. The latent risk is different: an HTTP-200 body with a string `status` other than success can be accepted if the remainder matches. Whether the upstream actually emits such an envelope is explicitly unsettled by the observation (`library/observations/by-plot-2026-09-04.md:48-53`).

## 5. `tests/bin.test.ts`: crash or stale test?

**Diagnosis — certain that the binary answers directly and that the expectation is stale; certain about the nested-Node boundary in this sandbox, and probable that the same boundary caused the recorded suite failure.** The product binary is not generally crashing. A direct stdio probe of the built `dist/index.js` completed initialization, returned one `land_deed` tool from `tools/list`, and exited with code 0 when stdin closed. This independently agrees with the manager's successful spawn.

The reported `Binary closed before responding` occurs before the test reaches any assertion (`tests/bin.test.ts:58-66,72-95`). In this sandbox, nested Node execution with piped stdio is restricted or intercepted: a direct `spawnSync(process.execPath, ...)` diagnostic returned `EPERM`, while asynchronous nested Node probes exited cleanly with empty captured streams. Running `vitest` reproduced the same pre-response failure, whereas invoking the binary directly through the shell produced both valid JSON-RPC responses and exit 0. This proves the current sandbox failure is a runner/nested-Node boundary, not a binary startup crash. The earlier recorded suite has the same signature and sandbox context, so attributing it to the same boundary is probable, not independently proven.

Independently, the test is stale. Its title says "lists no tools" and line 95 requires `result.tools` to be empty (`tests/bin.test.ts:48,93-95`), while `createServer` now registers `land_deed` (`src/server.ts:35-61`). In an environment where the child really executes, the test will get past initialization and then fail that obsolete assertion. The direct probe confirmed exactly one tool.

**Amendment, 2026-09-06:** The title is no longer stale. `tests/bin.test.ts:48` now reads "initializes, lists registered tools, and exits when stdin closes", and `createServer` registers three tools, `land_deed`, `land_deeds_owned`, and `land_deeds_search` (`src/server.ts`). The nested-Node sandbox boundary described above is a separate, unresolved concern and this amendment makes no claim about it.

## Fix plan, ordered by unblock value

**Amendment, 2026-09-06:** Items 1–3 below are landed — see the dated amendments in sections 1–3 above for the commits and current source. Item 4's test-title half is landed (`tests/bin.test.ts:48`); its sandbox/CI half and item 5 are unverified from source alone and are left as open items.

1. **Repair the response-contract path first (unblocks two of the three real capability failures).** Preserve a complete, redacted plot-1 path/type diff and report the first mismatch instead of reducing validation to a boolean; if it is legitimate state variation, correct only that declaration. In the same contract/classifier pass, explicitly accept the real VAPI success-empty envelope `{status:"success",data:null}` and make validation and empty recognition share that definition. Apply durable catalogue changes to canonical `scripts/catalogue-input.json` (the entry begins at line 2078) and regenerate `src/catalogue/catalogue.json`, rather than editing generated output alone. Add listed-plot, `data:null`, `data:[]`, non-empty, and malformed fixtures. `listing_price` needs no numeric-to-string correction because it is currently undeclared.
2. **Constrain `plot_id` at the catalogue/schema boundary.** Encode the supported plot-id domain (at minimum reject negatives; use minimum 1 if that is the authoritative domain), so both the advertised JSON Schema and `bindRequest` enforce it before URL construction. Add negative and boundary protocol tests whose fetch-call assertion is guaranteed to run.
3. **Correct the invalid-input test assertions.** Assert `isError`, inspect `content[].text` for `plot_id`, and then assert `fetchCalls === 0`. Avoid `.catch` unless the SDK contract actually rejects.
4. **Update and correctly execute the binary integration test.** Expect exactly the registered `land_deed` tool and its schema. Run the child-process test in a host/CI environment that permits nested process creation (or explicitly classify sandbox `EPERM` as a runner limitation); retain the stdin-close/exit-0 check.
5. **Define envelope-status semantics separately.** Once supported upstream status values are evidenced, require the success value for success classification and map documented error envelopes without conflating them with HTTP/network failures.

## WHAT I COULD NOT DETERMINE WITHOUT NETWORK

- The exact required or typed path that made the plot-1 response fail was not recoverable from the record available when this finding was written. A later full path/type comparison established `data.resource_id` and `data.resource_symbol` as the two mismatches.
- The identity and current value of the 41st plot-1 key, and whether the upstream shape has changed since the dated observation. Its additive nature would not matter to the current matcher, but its identity was not retained.
- Whether plots 75000 and 120000 still return HTTP 200 with `status:"success", data:null` now.
- Whether the upstream ever sends HTTP 200 with a non-success envelope `status` and an otherwise contract-matching body.

The local source traces and injected probes above do not require network access; the remaining gaps require preserving the complete real response body (with player data redacted before storage) or at least a path/type diff generated at observation time.
