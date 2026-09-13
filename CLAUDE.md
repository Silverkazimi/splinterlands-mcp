# splinterlands-mcp

Read-only MCP server for public Splinterlands API data and isolated Hive history reads. TypeScript, MIT.

## Source and evidence boundaries

Use this repository's public evidence and official Splinterlands or Hive sources. Do not import private project code, notes, fixtures, local configuration, personal paths or session metadata. Public maintainer attribution in the license and repository metadata is intentional.

Record dated observations and limitations in the evidence library. Specification declarations do not override measured behavior or authorize unverified capabilities. See CONTRIBUTING.md.

## Runtime boundary

Do not add game credentials, authentication, signing, broadcasting or state-changing operations. Preserve fixed-host Splinterlands GET access and the isolated allowlist of read-only Hive RPC methods. Keep GitHub maintenance credentials outside the runtime.

Do not hardcode account defaults. Use explicit caller input and preserve all request, response, memory and concurrency limits.

## Changes and verification

Keep changes scoped and run the relevant checks. A source file crossing roughly 1,200 lines requires a split or a recorded rationale in library/decisions.md. Retain useful explanations of non-obvious behavior; remove obsolete process commentary.

library/index.md is the public evidence index. library/maintenance.md and library/releasing.md describe maintenance and releases. Publishing requires maintainer authorization and passing release checks.
