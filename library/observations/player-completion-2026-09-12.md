# Additional player route observations - 2026-09-12

Requests were made directly from this repository to the official
`https://api.splinterlands.com` host, using an account already present in this
repository's profile fixture. No credentials were supplied. Each request had
a 12-second socket timeout and a 2 MiB response bound; calls were serial with
at least 300 ms between completed requests. Avatar redirects were not
followed. No 403 or 429 occurred.

## Captures

The endpoint is `/players/<route>`; suffixes after `--` label follow-up
parameter cases, not URL path segments. `avatar-name` represents
`/players/avatar/{name}`.

| Route / case | Query | HTTP | Bytes | Shape |
| --- | --- | --- | --- | --- |
| archived_balances--unscoped | none | 400 | 53 | object |
| archived_balances--username-alias | username=<account> | 500 | 148 | non-JSON |
| archived_balances | players=<account> | 200 | 1562 | 18 rows |
| authorities--unscoped | none | 200 | 103 | object |
| authorities | players=<account> | 200 | 747 | 1 rows |
| avatar-name | none | 302 | 94 | non-JSON |
| balances--token-filter | players=<account>, token_type=DEC | 200 | 103 | 1 rows |
| balances--unscoped | none | 400 | 53 | object |
| balances--username-alias | username=<account> | 200 | 8838 | 91 rows |
| balances | players=<account> | 200 | 8838 | 91 rows |
| card_airdrop | username=<account> | 200 | 9638 | 26 rows |
| dec | none | 200 | 302 | object |
| energy_purchase_information | username=<account> | 200 | 82 | object |
| lp_claim_history--limit-one | username=<account>, limit=1 | 200 | 165 | 1 rows |
| lp_claim_history--offset-one | username=<account>, limit=2, offset=1 | 200 | 328 | 2 rows |
| lp_claim_history | username=<account>, limit=2 | 200 | 328 | 2 rows |
| pack_purchases--edition-four | username=<account>, edition=4 | 200 | 82 | object |
| pack_purchases | username=<account> | 200 | 68 | object |
| quests | username=<account> | 200 | 484 | 1 rows |
| recent_teams | player=<account> | 200 | 3398 | 6 rows |
| reward_delegation_history--limit-one | username=<account>, limit=1 | 200 | 216 | 1 rows |
| reward_delegation_history--offset-one | username=<account>, limit=2, offset=1 | 200 | 2 | 0 rows |
| reward_delegation_history | username=<account>, limit=2 | 200 | 419 | 2 rows |
| reward_delegations | username=<account> | 200 | 602 | 3 rows |
| skins | username=<account> | 200 | 22998 | 223 rows |
| voucher | username=<account> | 200 | 48 | object |

## Findings and limits

- Fourteen previously uncatalogued routes returned JSON without authentication.
  This is a dated per-route observation, not an inference from the spec's
  global JWT declaration.
- `balances` accepted `players` and `username` separately; `token_type=DEC`
  returned one balance row. The tool requires `players` as its explicit
  scope, even though the alias worked upstream.
- `archived_balances` accepted `players`; `username` alone returned HTTP 500.
  The missing-selector error text asks for the wrong alias.
- `authorities` without `players` returned an HTTP 200 error object. The tool
  requires the selector and does not present that error as account data.
- `lp_claim_history` with limit=2 and with limit=2&offset=1 returned identical
  rows. limit=1 returned the leading row.
- `reward_delegation_history` returned two rows with limit=2, one leading row
  with limit=1, and an empty array with limit=2&offset=1.
- `pack_purchases` with edition=4 returned a scoped zero-valued object carrying
  that edition. This does not establish how nonzero purchase totals behave.
- `skins` returned 223 rows. No paging selector is declared; the tool's
  100-row limit can therefore leave rows inaccessible through that response.
- `dec` reports global figures, not an account balance.
- `avatar/{name}` returned HTTP 302 and text/plain, so it remains unbound.
- Other optional parameters come from the official declaration; effectiveness
  has not been established for every filter. No credential or decrypt_key
  parameter is exposed.

Fixtures contain the first three rows for arrays and complete object bodies,
without field transformations. Counts in this record describe the complete
bounded responses, not those shortened fixtures. The result contracts type
common top-level fields observed in the full captures; nested values are
passed through. Array validation accepts emptiness and checks each nonempty
row independently. These shapes do not establish every possible optional
field or all historical variations.

## Built-server verification

All fourteen tools succeeded through the built stdio MCP server against the live public API on 2026-09-12. The server advertised 69 tools. History calls supplied limit=2; no continuation was fetched. The skin call returned 100 of 223 upstream rows with explicit truncation metadata. Outcome-only evidence is retained in player-completion-live-2026-09-12.json. The local full suite passed 180 tests across 16 files; typecheck, lint, full leak-check (191 files, zero hits), and diff whitespace checks passed. These are direct local checks, not an independent reviewer verdict.
