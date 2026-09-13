# Changelog

## Unreleased

The initial release is being prepared. No release has been published from this working tree.

### Added

- Read-only MCP stdio server with 161 tools, six resources and a 189-entry endpoint catalogue. The catalogue distinguishes 154 callable Splinterlands endpoints from 35 dated exclusions.
- Public Land deed, plot, staking, resource, production, liquidity, project and inventory reads, with verified plot references and bounded account scope.
- Card collection streaming and projected pages with memory limits, metadata joins, staking-state filters, cooldown states, Land abilities and production figures.
- Offline Land lineup estimation and comparisons covering production caps, terrain and element modifiers, abilities, Runi, Power Cores, food and optional regional DEC recomputation. A bounded lineup snapshot supplies dated inputs and explicit unknown states.
- Public player, ranking, market, rental, delegation, collector, battle, tournament, guild, conflict, proposal and global game information reads.
- Bounded Hive account history, complete signed transaction lookup and combined chain/game evidence, with explicit partial-history limitations and a sourced transaction-limit resource.
- Fixed upstream hosts and read-only methods, request budgets, rate and concurrency limits, bounded retries, circuit breaking, streamed response caps, in-memory caching and explicit truncation.
- Nightly endpoint drift issues, weekly specification-review PRs and monthly sanitized fixture-review PRs. Maintenance includes four account-role secrets, complete-coverage templates and offline configuration validation.
- Privacy checks, pinned CI actions, Node 22/24 validation and dependency update PRs.

### Corrected during pre-release verification

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
