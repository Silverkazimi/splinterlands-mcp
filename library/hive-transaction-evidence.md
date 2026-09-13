# Hive transaction evidence

As of 2026-09-13, three additional read tools use an isolated Hermes reader.
The original 179-entry Splinterlands GET catalogue and its 144 bindings remain unchanged.
No third-party Hive MCP installation or signing interface is required.

Use `hive_account_history` with an explicit account, optionally filtering
`custom_json_id: "sm_gift_cards"`. Start at -1 for the newest window.
The tool examines at most 100 records, reports the examined indices and returns
`next_start` for an explicit next call. A filtered empty result can still have a
continuation. No automatic scan, recipient search, or complete-history claim is made.
Custom JSON account indexing concerns authorities; a recipient named only inside
JSON may not have the operation in their account history.

Pass a returned transaction ID to `transaction_inspect`. This performs one
full Hive transaction read and reuses `transaction_lookup`'s existing game route.
It preserves raw evidence and separately reports game status, operation count,
signature count, and recognized gift-card count. The game result is decoded with
warnings for malformed JSON. Only a single gift operation with matching transaction,
player authority, type and card multiplicities can produce a positive agreement.
One game record never establishes processing of every operation in a multi-operation
transaction. Chain inclusion does not establish irreversibility.

`hive_transaction` is the independent full-transaction read. Unknown custom
schemas have null item counts. Oversized results are refused whole, preserving the
meaning of “full”; history callers can request a smaller window.

The fixed node is https://api.hive.blog. The only allowed RPC methods are
`condenser_api.get_account_history` and `condenser_api.get_transaction`.
POST carries read queries, never broadcasts. Redirects and credentials are disabled.
There are at most two in-flight reads, 500 ms start spacing, a 20-second timeout,
a 2 MiB transport cap and a 256 KiB result cap. There is no retry, arbitrary URL,
arbitrary RPC method, or fallback to another node. Node errors remain explicit.

Read `splinterlands://hive/transaction-limits` for dated, pinned public sources
distinguishing client policies, stock custom-operation admission, payload bytes,
signatures and item counts. A successful batch is evidence of possibility, not
proof of a maximum.

Primary API reference: [Hive API definitions](https://developers.hive.io/apidefinitions/).
The live node's index-zero boundary was checked on 2026-09-13: start=0, limit=1
returns index 0. Some pagination documentation predates this boundary behavior.
