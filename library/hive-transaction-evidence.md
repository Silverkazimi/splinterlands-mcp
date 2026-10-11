# Hive transaction evidence

As of 2026-09-13, three additional read tools use an isolated Hermes reader.
At that date the Splinterlands GET catalogue had 179 entries and 144 bindings; those three tools did not change it. The current catalogue count is in the capability notes.
No third-party Hive MCP installation or signing interface is required.

Use `hive_account_history` with an explicit account, optionally filtering
`custom_json_id: "sm_gift_cards"`. Start at -1 for the newest window.
The tool examines at most 100 records, reports the examined indices and returns
`next_start` for an explicit next call. A filtered empty result can still have a
continuation. No automatic scan, recipient search, or complete-history claim is made.
Custom JSON account indexing concerns authorities; a recipient named only inside
JSON may not have the operation in their account history.

Pass a returned transaction ID to `transaction_inspect`. This performs one
full Hive transaction read and reuses `transaction_lookup`'s game route for the plain ID and, as described below, for each further record of a multi-operation transaction (call scope: ten logical requests).
It preserves raw evidence and separately reports game status, operation count,
signature count, and recognized gift-card count. The game result is decoded with
warnings for malformed JSON; a `null` result (measured 2026-10-11 on a successful
delegation record) is accepted as null, not as malformed. Only a single gift operation with matching transaction,
player authority, type and card multiplicities can produce a positive agreement.
Chain inclusion does not establish irreversibility.

The game records a multi-operation Hive transaction as separate records:
`<trx_id>`, `<trx_id>-1`, `<trx_id>-2` and so on, each with its own
`success`, `error` and `result`. Measured 2026-10-11 on one public transaction whose four
`custom_json` `sm_land_operation` operations were each a `harvest_all` for a different region: the
plain ID and `-1`, `-2` and `-3` returned four records, one per region, in operation order.
`-4` and `-01` both returned HTTP 200 with `{"error": "Transaction [...] not found.", "error_code": 1}`.
A public developer reported this pattern on 2026-10-11 after finding that their
application looked up only the plain ID.

Since then, `transaction_inspect` looks up every suffix up to the chain
operation count, with at most nine game lookups. If the chain read fails, it stops at the first
missing suffix. It returns one `game_records` entry per record and a combined
`batch_status`: `success` only when every chain operation has a found, matching
record with `success: true`, `failed` when any record failed, `unverified`
otherwise (also when the chain operation count exceeds nine, because the scan stops at nine records). `game_status` still describes the plain-ID record alone. A
`-N` input inspects the whole transaction.

A trailing non-game operation gets no record. Measured 2026-10-11 on two public
transactions where operation 0 was `sm_delegate_cards` and operation 1 a `custom_json`
with a non-Splinterlands ID: the plain ID returned the delegation
and `-1` was not found, so such transactions stay `unverified` rather than
`success`. Not yet measured: a non-game operation placed before a game operation.
`-N` is therefore not claimed to be Hive operation N.

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
