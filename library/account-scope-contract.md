# Account and geography scope contract

This document describes the request scopes exposed by this project. It describes
the project's public contract and binding rules; it does not add facts about
upstream behaviour that are not recorded in the catalogue evidence.

## Accepted request modes

### Explicit-account

The caller names the account being requested. For `land_deeds_owned`, the
caller supplies `player` and the binder places that value in the
`/land/deeds/owned/{player}` path. For deed search, the caller supplies
`player` as a query selector. The result set is therefore the upstream answer
for the named account, subject to any other selectors supplied by the caller.

### Explicit-geography

The caller supplies a geography selector, such as `tract_id` or
`region_number`, rather than relying on an account selector to narrow the
request. The result set is the upstream answer for the supplied tract or
region, subject to any account selector that the caller also supplies. A
geography selector is not interchangeable with an account selector, and both
selectors remain in the request when both are supplied.

### Refused: genuinely unscoped

The caller supplies neither an account selector nor a geography selector. The
project refuses the call before binding or making an upstream request. The
refusal says that the caller must provide `player`, `tract_id`, or
`region_number`. No result or provenance is created for this refused mode.

## Policy versus specification declaration

The catalogue records requiredness declared by the upstream specification for
each parameter. That parameter-level declaration is evidence about the
specification, not a statement that the specification requires this project's
tool-level scope policy.

The policy that deed search requires the caller to provide either an account
selector or a geography selector is a decision made by this project. Its
reason is scope honesty: an unscoped upstream response was observed to carry
the same place values on every returned row, and its narrowing mechanism is
unknown. The project therefore refuses a bare search rather than describing
an unexplained response as a search of everything. This is not an upstream
requirement. A later reader must keep this project policy distinct from the
catalogue's per-parameter `declaredRequired` evidence.

## No client-side substitution

Fetching a broad, unexplained result and filtering it by account in this project
is not equivalent to asking upstream for one account. It changes what was
requested, what upstream returned, and what pagination means across pages.
This project therefore binds the caller's account selector into the declared
path or query position and does not substitute a broad fetch plus local
filtering.

Blank selector input is rejected by the request contract. Missing account
input is accepted when a geography selector is supplied and is never replaced
with a hidden default account. Missing account and geography input is refused
before transport. Empty results likewise remain empty results for the
requested scope. The measured land-deeds search endpoint has no working continuation:
its `offset` parameter did not advance the result set and responses carried no
total, cursor, or has-more signal. This project therefore does not expose a
continuation token for that endpoint; callers must narrow the request to
retrieve a different result set.
