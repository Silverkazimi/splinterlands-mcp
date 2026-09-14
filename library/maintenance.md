# Maintainer updates

Use a branch and pull request for changes. CI builds and tests the server, checks types and lint, and runs the full source/fixture privacy guard. Dependency and GitHub Action updates are proposed weekly; review them and wait for CI before merging. No workflow automatically merges or releases code.

## Specification review

The weekly specification job reads both official Swagger initialization files: VAPI and the main API declaration hosted at api2.splinterlands.com/doc with a 20-second deadline and a 4 MiB body limit. It extracts JSON without executing the JavaScript and follows no redirects. The two retained baselines contain path, shared-schema and global security/transport hashes, not API examples or account data.

Run `npm run drift:spec` to compare without writing to GitHub. Added, removed and changed paths are reported. Shared-schema changes conservatively flag every retained path. A specification smaller than half the baseline is held for review; it must not silently replace the baseline.

In GitHub Actions, --publish requires a clean checkout with an exact matching GitHub HTTPS origin and holds while an existing specification-review PR is open. A changed specification prepares both fingerprint baselines and scripts/drift/spec-declarations.json, then regenerates the runtime catalogue from its reviewed input. The declaration catalogue contains route names, methods and hashes, without examples or free text. Declarations do not establish callable tools or authentication permissions. Both specifications must pass comparison before any replacement. Privacy, type, lint and full tests run before a new review branch is pushed; changes outside the four allowed files stop delivery. The workflow uses short-lived contents, issue and PR permissions. It never merges or releases. A failed fetch or shrink guard creates or updates a source-specific issue and fails the job.

Review a generated specification PR, update affected curated contracts and tests, and approve hosted checks when requested. For an intentional manual baseline reset, run `npx tsx scripts/spec-diff.ts --initialize-baseline`. Inspect the resulting baseline diff in the same PR. Close the review issue after that PR is merged. This command records a new local baseline; it does not update the catalogue or publish a release.

## Nightly response checks

Set the repository Actions secret MCP_DRIFT_INPUTS to a JSON array of objects containing entryId, params, and optionally variantKey. Keep approved account selectors in that secret. Every endpoint must be callable in the server catalogue; account-aware routes require explicit account scope. Unknown, duplicate, or invalid entries reject the entire configuration before any API request.

The nightly command sends one paced GET per configured endpoint with no redirects or retries, a 20-second deadline and a 2 MiB response cap. Two distinct HTTP 403 responses abort the sweep. Large responses need a deliberately bounded configuration; hitting the cap is a failed response check. Missing configuration exits unsuccessfully without making a request.

Run npm run drift:check with that environment variable for a local comparison. The report lists callable, configured, swept, unconfigured, unswept and unbaselined endpoints. Partial coverage never reports complete. Public reports contain status, labels and counts of shape changes; they omit response keys and values because map keys can also identify accounts. Publish mode updates one labeled issue per changed endpoint, prioritizing access changes. Two distinct 403 responses produce exactly one runner-blocked issue. Incomplete coverage is reported separately when the run is not blocked. Known baseline field names can be reported; unreviewed names are counted and withheld until reviewed. Drift or incomplete coverage returns a failing job.

## Fixture preparation

Monthly recapture uses the same bounded catalogue requester. Fixture targets must be direct .fixture.json files under tests/fixtures; the delivery layer must additionally verify filesystem containment before writing. The preparation layer does not write files. The command verifies fixture bindings and real filesystem paths, refusing symlinks and hard links.

The sanitizer uses reviewed valueClasses from the existing fixture. It replaces names consistently within each capture and redacts free text and opaque strings. Array classifications are regenerated for each concrete element. Unknown fields, unknown enum values, conflicting classifications and account identifiers outside name fields require review; raw response keys and contents are not included in those errors.

Failed or unreviewed captures count toward the full batch hold fraction. More than 20% holds suppress all writes, and two distinct blocked endpoints abort the batch. PR delivery must run the full privacy check and tests on prepared changes before pushing a review branch.

Configure MCP_FIXTURE_INPUTS as an Actions secret containing an array of fixturePath, entryId, params and optional variantKey. Each entry must match scripts/drift/baseline-input.json. Run npm run drift:fixtures locally for a read-only preparation report. The report identifies unconfigured callable fixtures and lists excluded endpoint fixtures separately; a partial eligible batch cannot pass as complete. Input batches are capped at 512 fixtures. Baseline access tiers use measured evidence before specification declarations.

Publish mode requires GitHub Actions, a clean checkout, and an exact matching GitHub HTTPS origin. It stops when an existing fixture-renewal PR needs review. After prepared writes, it runs privacy, type, lint and full tests, rejects changes outside the planned fixture paths, then pushes a new codex/fixture-renewal branch and opens a PR. It never force-pushes, merges or releases. GitHub can place checks for token-created PRs in an approval-required state; review the PR, select Approve workflows to run when shown, and wait for hosted CI before merging. Local validation does not replace hosted checks. Failed validation leaves no pushed branch. A failure after push can leave a branch requiring manual PR recovery; inspect that branch before rerunning.

## Delivery status

Both specification sources have local behavioral tests and live read-only comparisons (100 VAPI paths and 105 main-API paths at the current capture). Specification-change PR delivery has local behavioral coverage, including held reviews, failed validation, unexpected files and declaration privacy. GitHub delivery still needs a hosted run after repository publication. Nightly response drift has a wired command and local behavioral coverage; its approved input configuration and hosted acceptance are still pending. Monthly fixture recapture, sanitization, renewal planning and command/PR delivery are connected with offline behavioral tests. Its approved capture configuration and hosted PR acceptance remain pending.


## Account roles and configuration validation

In the GitHub repository, open Settings > Secrets and variables > Actions > New repository secret. Add ACCOUNT_SMALL, ACCOUNT_MID, ACCOUNT_LARGE and ACCOUNT_NONE with approved public account names for the small, medium, large and empty test roles. Role names do not infer permission or prove account size; review the chosen accounts and keep large-account requests bounded. The server runtime never reads these secrets.

Generate local configuration templates with these commands, saving the JSON outside the repository if you add account-specific values:

    npm exec -- tsx scripts/maintenance-template.ts nightly
    npm exec -- tsx scripts/maintenance-template.ts fixtures

Templates cover callable endpoints and eligible fixture bindings. Objects containing required are unresolved and intentionally fail validation. Replace each with a reviewed bounded parameter value. For account selectors, use an object such as {"accountRole":"ACCOUNT_SMALL"} to resolve the corresponding environment secret. Assign the appropriate role per endpoint or fixture; do not substitute one account for an empty-response or populated-fixture contract without reviewing the expected result. Review variant-specific parameters and optional bounds against describe_endpoint and the fixture contract.

Store the resulting arrays in MCP_DRIFT_INPUTS and MCP_FIXTURE_INPUTS repository secrets. With those variables and the four role variables present locally, validate without any upstream request or GitHub write:

    npm run drift:check -- --validate-only
    npm run drift:fixtures -- --validate-only

Validation prints only role names and coverage metadata, never resolved account values. Missing roles, unresolved values or partial coverage exit unsuccessfully. Publish mode also refuses missing role secrets before making API calls. Passing validation establishes parameter binding and coverage, not live success or population suitability. Run the hosted workflows manually after configuration and inspect their results and any review PRs before release.

## Changing live account holdings

The account roles are sampling categories, not promises that a player keeps fixed assets. Small means a modest nonempty Land holding, medium means hundreds of plots and large means thousands; the empty role supplies an intentionally empty Land sample. Owners may buy, sell or move assets normally.

Offline regression tests use fixed fixtures. Live jobs compare API behavior and sample coverage without expecting fixed balances or plot counts. A successful, contract-valid change between populated and empty fixture data preserves the original fixture and creates a sample-coverage review. It does not generate an API-shape failure for that transition. A wrapped error, invalid response or unverified shape remains a response or contract review problem.

Nightly recipes may set expectEmpty: true for an intentionally empty account-scoped sample. An unexpected empty result, or population where an empty result was expected, appears under sampleCoverage separately from API drift. Empty responses must satisfy the known endpoint contract before they qualify. Coverage gaps can make the maintenance job require attention; that is not a server outage or proof that somebody sold their assets.

Monthly sample gaps count toward the existing batch hold threshold, so a batch losing substantial representative evidence cannot replace fixtures automatically. Both the old populated fixture and the old empty fixture remain usable offline. Review the account/query selection and supply another approved sample where needed. No account replacement or additional discovery queries are automatic, and these checks do not establish the reason for a holdings change.

## Collection streaming sample

The collection route has no upstream pagination. Maintenance uses the same 90-second streaming parser and memory guards as the collection tool, validates all cards, and retains at most three projected cards. The general 2 MiB body cap is unchanged for other routes. The collection baseline and monthly fixture cover the MCP projection; the original raw collection fixture remains for parser tests. Unused last_buy_price and market_id fields are outside that projection. A malformed card after the retained sample still fails the check. This is a leading sample, not complete holdings or complete coverage of every optional field.

### Global rental-market samples

The public V3 bids and offers lists may omit the optional player filter when an explicit integer limit from 1 to 100 is supplied, matching the MCP tools. Preserve the original price, quantity and offset filters when configuring scenario fixtures. Account-specific rental routes still require account scope. The existing response-size cap, timeout and pacing remain in effect.

### Nullable fixture classifications

When array entries classify null differently from a reviewed non-null value at the same field, renewal uses the non-null classification for redaction and validation. Null-only fields keep their existing rules; their null observations do not establish a new numeric or text contract. Conflicting non-null classifications still stop renewal, as do unreviewed fields, containers and enum values.

Opaque booleans and finite numbers are retained only when that exact value was already present at the reviewed field. New opaque scalar values remain held, and opaque strings remain redacted. This supports existing boolean and numeric fixture values without treating an unknown field as a public numeric contract.
