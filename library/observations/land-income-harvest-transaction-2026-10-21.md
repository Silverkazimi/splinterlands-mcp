# Land income bulk harvest transaction observation (2026-10-21)

Bounded public game API reads on 2026-10-21 confirmed that a same-millisecond Land history group can exceed the list endpoint's 100-row maximum and body budget. A one-row read identifies a transaction ID; the existing transaction lookup returns `land_operation` with `data.op=harvest_all` and a JSON-encoded result containing per-deed `resource_symbol`, gross `resource_amount`, `received_amount`, `tax_amount`, `grain_eaten`, and `inputs_consumed` records.

The decoded result had 98 deed entries, 98 grain-eaten row matches, and 57 input matches. Against 279 history rows, that accounts for 253 rows and leaves 26 unmatched. The runtime reports the transaction-derived totals and exposes those unmatched rows; `complete` remains false. No account name, transaction ID, block number, deed UID, plot ID, or exact balance is retained here.

The daily tool uses a 1 MiB streaming cap for its one-row probe (the measured row body was approximately 282 KB), counts the transaction lookup against its per-day request budget, and caches classification/results by transaction ID. A failed lookup or any non-`land_operation` / non-`harvest_all` transaction remains unaccounted and incomplete. The implementation and redacted live-verification status are recorded in the task report.
