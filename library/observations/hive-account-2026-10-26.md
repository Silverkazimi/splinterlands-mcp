# Hive account read — 2026-10-26

`hive_account` calls the [official `condenser_api.get_accounts`](https://developers.hive.io/apidefinitions/condenser-api.html) method for one explicit name. It projects public counters, creation time, reputation, vote status and voting mana. It never returns the upstream authority keys, balances or free-text metadata. The response is bounded to one account and the shared Hive RPC response cap remains 2 MiB.

The reputation score uses the usual log scale (`(log10(abs(raw)) - 9) * 9 + 25`, with the negative adjustment); raw reputation remains available. The [`manabar` definition](https://developers.hive.io/glossary/) states that voting mana regenerates linearly to full over five days. The tool applies that interval to `voting_manabar.current_mana` and `last_update_time`, capped at effective vesting shares, and reports the retrieval time. The result is a node snapshot plus a computed current estimate, not a guaranteed consensus-at-time measurement. Missing or malformed mana inputs yield null.

This change was verified with synthetic offline fixtures. A live account comparison remains a maintainer acceptance check.
