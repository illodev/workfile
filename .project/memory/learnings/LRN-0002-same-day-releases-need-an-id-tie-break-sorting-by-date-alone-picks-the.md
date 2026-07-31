---
id: LRN-0002
title: "Same-day releases need an id tie-break: sorting by date alone picks the wrong latest"
status: active
created: 2026-07-31
updated: 2026-07-31
---
Release records carry a `date` with day precision, and this project cuts releases faster than a day. Three of the seven releases on record — 0.1.5, 0.1.6 and 0.1.7 — all carry `2026-07-31`, so any "newest release" computed by sorting on `date` alone returns whichever of the three the source happened to yield first. It is not a sort bug; there is genuinely no information in the date to separate them.

The tie-break is the id, descending: `REL-0007` > `REL-0006` > `REL-0005`. Ids are allocated in release order, so they carry the ordering the date has thrown away.

This has now been paid for twice, from opposite directions. T-0024 fixed it in the CHANGELOG renderer, where same-day releases rendered oldest-first. T-0047 hit it again in the Overview's release tile, which announced 0.1.5 as `latest` while 0.1.7 was live on npm — a wrong answer stated confidently, in the one place a reader goes to avoid checking.

So: anything that reduces the changelog to a single "latest" — a tile, a badge, a doc header, a release check — sorts by `(date desc, id desc)` and never by date alone. Worth suspecting wherever a record type has day-precision dates and a faster-than-daily cadence; the same reasoning applies to cards created and closed on one day.
