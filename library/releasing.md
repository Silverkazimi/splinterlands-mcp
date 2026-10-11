# Releases and updates

The source repository is Silverkazimi/splinterlands-mcp. The first versioned release was 1.0.0. Every release requires the acceptance checks below. GitHub publication and npm package publication are separate actions; do not infer registry publication from a GitHub release.

## Initial publication

Prepare an explicit source allowlist containing runtime source, tests, public fixtures, scripts, workflows, public documentation, license and package/build configuration. Exclude local client settings, private evidence, credentials, dependencies, generated build output and development Git history. Preserve the original development tree privately.

Audit the selected files and paths, including private identifiers that a general structural scanner cannot recognize. Verify the license attribution, package metadata, third-party licenses and executable entry point. Create a separate clean publication checkout from the audited files. Initialize new Git history there; never push the private development repository or rewrite its history.

Use the project commit identity documented in CONTRIBUTING.md. Verify the authenticated GitHub account and exact remote before any push. If the intended repository already exists, inspect its ownership, visibility and history before changing it. Never overwrite existing history or force-push.

Validate a fresh install from the publication checkout on supported Node 22 and 24. Run type, lint, full privacy and test checks, and inspect the packed artifact:

    npm ci --ignore-scripts
    npm run typecheck
    npm run lint
    npm run leak-check:full
    npm test
    npm pack --dry-run --json

Inspect the actual archive before distribution. Confirm that it contains only intended files, preserves the executable entry point and resolves its bundled documentation. Keep manifest hashes and verification results outside the public repository when they contain local paths.

Create the GitHub repository and push only the audited clean history after these checks and maintainer authorization. Enable security reporting and available branch protections. Require review and passing CI before changes reach the default branch; do not enable automatic merges or releases by default. Configure the maintenance role and input secrets, run all maintenance workflows manually, and review their results and generated PR behavior.

A source repository may be visible while release acceptance is still pending. Do not tag or describe it as a completed release until the client connection, runtime acceptance, hosted CI and maintenance checks pass.

## Versioned release

The first accepted release used version 1.0.0, after owner acceptance. For each release, update package.json and package-lock.json together, move the relevant changelog notes into a dated release section, and ensure README installation instructions match the published artifact. Run release checks after the version change.

Every release, including a dependency-only patch, needs a human-readable changelog entry. Write it for a user deciding whether and how to update, not as a list of package names. Each entry must state:

- what changed, in plain words, with any tool, input or output changes named
- whether users need to update; for a security fix, what the practical exposure was for this server as normally run, checked against the source
- known limitations or behaviour to watch for
- how the release was verified

Link each security advisory and name the fixed version. Credit outside contributions by PR number. A larger release may put the full text in `library/release-notes-vX.Y.Z.md` and link it from the changelog. Use the same text, or a faithful summary of it, as the GitHub release body.

Tag the exact reviewed commit only after hosted checks pass, and publish the human-readable release notes described above. Do not move a published tag. For a correction, prepare a new version and tag.

npm publication requires separate registry authorization and maintainer approval. If it is requested, verify the package name, registry identity, access level and archive immediately before publishing. Do not introduce a persistent registry token into the server or its source.

## Routine updates

Use one canonical public checkout for future work. Once initial publication is verified, point local development and MCP launch configuration at that checkout through a separately reviewed change; preserve private evidence in its original project. Do not keep two independently edited copies of the public source.

Create a scoped branch, make the change and add evidence or tests appropriate to the behavior. Open a PR with a concise description and validation results. Review dependency and maintenance PRs before merging. The maintenance runbook explains workflow approval prompts and recovery when schedules are disabled.

Before publishing, scan the release body and every outgoing commit message for internal identifiers.

Release from a clean default-branch commit that passed hosted CI. Repeat the package and privacy review whenever files, dependencies or build rules change. Keep release artifacts and tags reproducible from the reviewed source.

## Recovery

If PR creation fails after a maintenance branch was pushed, inspect that existing branch and its validation results, then open the missing PR. Do not force-push over another review.

If a release is defective, publish a corrected version or a revert through a reviewed PR. Retain old tags for reproducibility and describe the affected versions. If private data was published, restrict further exposure, revoke any affected credentials, and coordinate removal from repository history and distributed artifacts; a later deletion commit alone does not remove prior public copies.
