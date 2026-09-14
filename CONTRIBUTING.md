# Contributing to splinterlands-mcp

Keep each pull request focused on one endpoint family or one concern. The server reads public Splinterlands and Hive data; contributions must preserve that boundary.

## Evidence

Derive API contracts from official Splinterlands specifications, support documentation and dated observations made from this project. For Hive behavior, use official developer documentation and identified openhive-network source revisions. Record sources and measured limitations in the public evidence library.

When upstream behavior differs from its specification, capture a bounded read, document the date and result, and add a meaningful regression test. Another tool's behavior is a lead to investigate, not proof of this server's contract. Distinguish verified behavior, incomplete observations and unavailable capabilities.

## Runtime safety

Do not add game authentication, signing, broadcasting or state-changing operations. Authenticated endpoints remain unavailable. Splinterlands transport uses fixed-host HTTPS GET requests; the isolated Hive client uses a fixed allowlist of read-only JSON-RPC methods. HTTP POST carrying a permitted Hive read does not authorize other RPC methods.

Preserve request budgets, pacing, concurrency limits, response and memory caps, bounded retries, and explicit truncation. Account-scoped tools require explicit caller input. Do not broaden a capability solely because it appears in a specification.

GitHub maintenance credentials belong only to the scheduled maintenance environment. They must not enter server configuration, fixtures, logs or package contents.

## Public data and privacy

Never hardcode an account default or maintainer account in runtime code. Public account data can be used in approved read-only verification; review load before querying large accounts. Keep account-specific request recipes outside the repository and use the maintenance role secrets.

Sanitize committed captures using reviewed value classifications. Preserve useful schema and numeric evidence while replacing account names and private free text. Do not copy private project notes, client configuration, personal paths, credentials or session metadata into the public tree. Name-classified fixture fields must use synthetic placeholders beginning with sample, fixture or synthetic. Real account names belong in private verification evidence, including when the underlying API data is public.

The privacy guard checks repository-relative paths and content. Full mode also checks source and fixture structure. It does not consult a private name list, and passing it is evidence only for the rules it implements. Review the actual diff and release contents as well.

## Commits and validation

Use the public project identity splinterlands-mcp <noreply@example.invalid> for local project commits. Scheduled maintenance uses the GitHub Actions bot identity. Do not add assistant attribution trailers or session links to commit messages.

Run these checks before opening a pull request:

    npm ci
    npm run setup
    npm run typecheck
    npm run lint
    npm run leak-check:full
    npm test

Use current supported Node 22 or 24 releases; the minimum is 22.13.0. Explain the changed behavior, evidence and validation in the PR. Retain failure and unknown states rather than making missing data look like a successful empty response.

See [maintenance](library/maintenance.md) for scheduled API checks and [releasing](library/releasing.md) for release preparation and updates.
