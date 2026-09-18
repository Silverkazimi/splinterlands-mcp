# Changelog

## 1.0.0 - Release candidate

The initial release is being prepared. No release has been published from this working tree.

### Documentation

- Rewrote the opening README overview in plain language and moved detailed request behavior to a linked reference, preserving the tool table and later sections.
- Corrected the README release version and Node.js requirements, added a plain-language starting point with Codex explicitly listed, and recorded verified maintenance status.

### Added

- Saved custom avatar settings and opt-in PNG artwork composition, with level metadata separate from image art. Legacy RUNI profile portraits and other observed artwork variants are documented separately.

- Read-only MCP stdio server with 163 tools, six resources and a 190-entry endpoint catalogue. The catalogue distinguishes callable endpoints from dated exclusions.
- Public Land deed, plot, staking, resource, production, liquidity, project and inventory reads, with verified plot references and bounded account scope.
- Card collection streaming and projected pages with memory limits, metadata joins, staking-state filters, cooldown states, Land abilities and production figures.
- Offline Land lineup estimation and comparisons covering production caps, terrain and element modifiers, abilities, Runi, Power Cores, food and optional regional DEC recomputation. A bounded lineup snapshot supplies dated inputs and explicit unknown states.
- Public player, ranking, market, rental, delegation, collector, battle, tournament, guild, conflict, proposal and global game information reads.
- Bounded Hive account history, complete signed transaction lookup and combined chain/game evidence, with explicit partial-history limitations and a sourced transaction-limit resource.
- Fixed upstream hosts and read-only methods, request budgets, rate and concurrency limits, bounded retries, circuit breaking, streamed response caps, in-memory caching and explicit truncation.
- Nightly endpoint drift issues, weekly specification-review PRs and monthly sanitized fixture-review PRs. Maintenance includes four account-role secrets, complete-coverage templates and offline configuration validation.
- Privacy checks, pinned CI actions, Node 22/24 validation and dependency update PRs.

### Corrected during pre-release verification

- Valid empty/populated account sample changes preserve fixtures and are reported as maintenance coverage gaps rather than API failures; intentionally empty nightly samples are explicit.

- HTTP deadlines cover response-body consumption as well as headers; stalled bodies terminate within the bounded retry policy.
- TTL caches evict old entries at fixed capacities, preventing unbounded growth across unique collection queries. HTTP identification uses the public package metadata.

- Wrapped upstream errors, authentication gates, blocked requests, malformed results and ambiguous empty responses remain distinct.
- Observed query parameters, nullable fields and route-specific pagination are represented without overstating specification accuracy.
- Plot labels, numeric plot references and deed identifiers retain verified relationships and observation times.
- Land production calculations preserve cap order, supported terrain modifiers, powered-worker state, ability activation and raw precision.
- Actual MCP callbacks enforce request budgets while preserving bounded retry behavior and concurrent-call isolation.
- Maintenance baselines prefer measured access tiers. Specification changes cannot silently promote unverified endpoints or authentication declarations.
- Package contents include the public evidence library so documentation links remain usable after installation.

Hosted maintenance and final release acceptance remain pending. See the maintenance and release runbooks for required checks.
