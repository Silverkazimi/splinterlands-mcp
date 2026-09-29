# v1.0.5 — A clearer view of Land and the market

This update makes several public Splinterlands records easier to explore, especially when you want a quick picture of one Land plot or need to understand a market transaction. The server remains read-only and requires no game login.

## What you can do now

- **See one plot in one answer.** The new `land_plot_snapshot` gathers the deed, active project, staking details, and staked assets for a plot. It checks that the deed matches the requested plot and returns a complete answer only when all four public reads succeed.
- **Explore more public player information.** `player_dyk` shows did-you-know tips and lore for a locale; `player_daily_updates` reads daily updates; `player_burn_event_player` and `player_burn_event_prizes` read a named player's burn-event record and prize summary.
- **Check no-vesting Land liquidity positions.** `land_liquidity_positions_no_vesting` reads public positions and fee fields for an account you specify.
- **Understand marketplace operations more easily.** Hive transaction summaries now identify listing-item IDs in purchases and item IDs in listing operations. Deed lookups also retain the public owner field, which describes ownership at the time of the read.

## Clearer answers from existing tools

Market activity descriptions now reflect the public responses checked for this update: the sampled purchase feed matched buyers, the sampled sale feed matched sellers, and the combined feed returned both. Market landing reads accepted `PACKS`, `LAND`, and `DEEDS`. Land balance-history responses now describe their nested token entries, so a swap or liquidity change is easier to inspect without losing the original fields.

## Limits to keep in mind

Market activity is a bounded feed, not a complete transaction history. In the tested sample, asking for `offset=0` or `offset=1` returned no rows while omitting offset returned rows. The four reads in a plot snapshot happen at slightly different times. A purchase operation's listing ID does not, by itself, identify the deed that was sold, and this update does not claim to reconstruct a previous owner. No login, signing, trading, or other account-changing feature was added.

## Verification

The release passed a fresh install, typecheck, lint, the full privacy scan, and **571 tests across 78 files** on Node.js 24. All six new tools and the changed deed, market, balance-history, and marketplace-purchase reads were also checked against live public data. The package dry run includes the executable and public evidence, with no dependencies or tests bundled.
