# Collection streaming memory measurements — 2026-09-08

This record makes the memory and size figures cited by the `cards_collection`
description checkable. The route is `GET /cards/collection/{username}` on the
main API host.

## Route size and response shape

Eight real account responses ranged from 376 cards / 0.46 MiB at the small end
to 125,086 cards / 162,486,671 bytes / 155 MiB at the large end. The largest
response took 41 seconds to fetch. At every measured size the upstream envelope
was exactly `{player, cards[]}`: it supplied no total, count, cursor, page token,
or other pagination affordance. Pagination in the tool is therefore
client-side, after the complete upstream stream has been parsed.

## Forced-GC diagnosis

The diagnosis ran with forced GC available. Live heap stayed flat at about 9.4
MiB across a 10 MiB control and two 210 MiB synthetic-body runs. Each large run
parsed 51,799 cards and retained exactly 100 projected cards. Peak RSS in these
runs was 285.6–286.4 MiB. The 286.4 MiB figure cited by the operational RSS
ceiling comes from this diagnosis, specifically the highest RSS observed across
the measurement rounds.

## Production-path runs

The production-path measurements ran without `--expose-gc`. The 10 MiB control
reached 32.36 MiB heap. Complete synthetic 155 MiB and 210 MiB runs reached a
maximum of 90.71 MiB heap and 278.08 MiB RSS, completed successfully, and
returned their page.

An earlier 64 MiB heap guard aborted both the 155 MiB and 210 MiB streams. That
guard was derived from the forced-GC live-heap figure but was applied to
unforced `heapUsed`, which includes garbage awaiting collection; it was
therefore an occupancy mismatch, not evidence that the retained page exceeded
64 MiB.

## Limits of the measurements

Repeated runs varied by 0.72 MiB. `heapUsed` is sensitive to GC timing, so an
unforced high-water reading is not a retention bound. The memory runs used
synthetic response bodies rather than the live 155 MiB account response; the
real-account size and fetch-time range above is a separate route observation.

The route's 128 MiB heap guard, 358 MiB RSS ceiling, and 90-second timeout are
implementation thresholds or policy choices informed by these measurements,
not additional observed retention limits. The 358 MiB ceiling is 1.25 times
the conservative 286.4 MiB RSS maximum from the forced-GC diagnosis; it is
higher than the 278.08 MiB RSS maximum in the final production-path runs.

The implementation samples memory every 256 parsed cards and retains at most a
100-card page. On the 51,799-card diagnosis run, that cadence is at most 203
regular samples. The source card object carried 56 fields; the projection keeps
10 of them (roughly 18% by field count). The page cache lasts 60 seconds, and
the global 2 MB (2 MiB) response cap remains unchanged for other routes. The
fixture is a deliberately trimmed two-card contract sample, not a
representation of the 155 MiB response. The 90.71 MiB production-path heap
figure multiplied by 1.25 is 113.3875 MiB; the 128 MiB guard is intentionally
wider to allow operational slack for GC timing. The server remains version
0.0.0 with no remote delivery path, and no account name is embedded in the
server source.
