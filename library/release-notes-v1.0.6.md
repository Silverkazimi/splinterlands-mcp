# v1.0.6 — Whole collections, whole regions and whole transactions

This update is about seeing the whole picture in fewer calls. A card collection is now read once and then explored freely. A whole Land region or a player's estate fits in one tool. A Hive transaction with several operations is checked operation by operation, instead of trusting the first game record. Card sets are now unambiguous. The server remains read-only and requires no game login.

## What you can do now

- **List every deed in a region or estate.** The new `land_deeds_bundle` takes one player or one region and returns every deed in pages of 100. Each row shows the plot label, owner, rarity, terrain, worksite and resource. It also carries the deed's staking state (powered, worker counts, harvest PP, efficiency, work per hour) and its worksite state (active, harvesting, project type). A full region of 1,000 deeds is about 3.6 MB upstream, more than `land_deeds_search` could return, which gave back only a status. The bundle reads it once, keeps a compact copy for two minutes and pages through that. A deed with no staking data is marked `complete: false` rather than left out quietly.
- **Page through a collection without re-reading it.** `cards_collection` reads a collection once and keeps it for two minutes. Every later page, filter or sort of question is answered from that copy. Example: an 8,073-card collection took 12 seconds for the first page; the other 80 pages then took a third of a second together. Every page says when the data was read and how old it is. The new `all: true` option returns a compact row per card (ID, card number, level, BCX, foil, edition, set, Land PP) for quick full listings.
- **See who owns, rents or has borrowed a card.** Collection rows now include the owning account, who the card is delegated to, its rental terms (type, start, days, next payment), its market listing and its lock and unlock dates. A renter's collection includes cards rented from other people, and the owner field shows whose they are. If the game ever leaves one of these fields out, the card lists it under `ownership_unknown` instead of pretending it is empty.
- **Ask a plot only what you need.** `land_plot_snapshot` accepts `include`, for example just the deed and stake details. It makes only those requests and runs them in parallel: in the live check, a lean snapshot took 0.3 seconds against 1.4 seconds for the full one.
- **Check every operation of a multi-operation transaction.** When one Hive transaction carries several Splinterlands operations, the game records each separately as `<trx_id>`, `<trx_id>-1`, `<trx_id>-2` and so on. Each record has its own success flag and result. `transaction_inspect` now reads all of them and reports each record plus a combined `batch_status`. It also accepts a `-N` ID directly. Previously only the first record was checked, so a batch could look successful while a later operation had failed.
- **Tell a card's main set from its print run.** Every collection and find row now carries `main_set` (alpha, beta, untamed, chaos, rebellion, conclave, plus foundations, gladius, land and other), `main_set_label`, `print_class` (main, promo, reward, extra, mini-set, soulbound or outlier) and `sub_set`. You can filter a collection by `main_set` or `print_class`. A promo or reward card keeps its real main set. The numeric `edition` field is never mistaken for the set. The new offline resource `splinterlands://cards/editions` explains the whole hierarchy.

## Corrections

- `transaction_lookup` rejected every card-delegation record as malformed, because those records have an empty (`null`) result. They are now accepted.
- The plot snapshot and collection descriptions no longer claim behaviour that changed. A collection over 25,000 cards still uses the earlier one-page cache, and the description says so.

## Limits to keep in mind

- **The `-N` numbering is the game's own, not Hive's.** Hive stores only the transaction ID and each operation's position. A non-Splinterlands operation placed after a game operation gets no game record. Whether one placed *before* a game operation shifts the numbering has not been measured yet, so `-N` is never presented as "Hive operation N". If not every operation has a record, `batch_status` stays `unverified`.
- **Caches mean slightly older data.** Collection and deed bundles can be up to two minutes old, and every page tells you exactly how old. Large collections over 25,000 cards are not cached whole. To protect memory, the server holds at most 40,000 cached cards across all accounts.
- **A player with 1,000 or more deeds may not be listed completely.** The upstream answers at most 1,000 deeds and its paging does not work, so such a list is marked `truncated`. A region cannot hold more than 1,000 plots, so region lists are complete.
- **Listed is not rented.** `rental_type` is also set on cards that are only listed for rent; a card is actually rented when it has a `rental_date`.
- No login, signing, trading or other account-changing feature was added.

## Verification

The update passed typecheck, lint, the full privacy scan and **597 tests across 82 files** on Node.js 24; hosted CI repeats them on Node.js 22 and 24. An independent code audit found no critical or high-severity issues. Its four medium and five low findings were fixed before release: memory headroom for cached collections, stale documentation, untested fallback and lookup-limit paths, and a 256 KiB page bound on the deed bundle.

Every new or changed tool was checked on 2026-10-11 against live public data through the built server:

- **`transaction_inspect`:** a four-operation harvest transaction returned all four game records with `batch_status: success`. A delegation followed by a non-game operation returned one record and stayed `unverified`.
- **`cards_collection`:**
  - an 8,073-card collection was read once and served 81 pages and a filter from that one read
  - 29 delegated cards were reported on one account
  - a renter's 6,948-card collection showed 77 cards owned by others
- **`land_deeds_bundle`:**
  - region 65 returned 1,000 deeds (3.6 MB upstream) in 10 pages from one read
  - a 131-deed estate returned all 131
  - every page stayed under 256 KiB
- **`land_plot_snapshot`:** a lean request made two reads instead of four.

The package dry run contains the executable and public evidence, with no tests bundled.
