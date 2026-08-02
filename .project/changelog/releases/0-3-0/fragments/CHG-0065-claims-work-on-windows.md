---
id: CHG-0065
title: Claims work on Windows
type: fixed
area: core
visibility: public
cards: [T-0105]
created: 2026-08-02
updated: 2026-08-02
---

The derived actor came from `$USER` and `$HOSTNAME`, which are POSIX. Windows
sets `USERNAME` and `COMPUTERNAME`, so nothing resolved and `workfile card
claim T-0001` failed with `CARD_CLAIM_ACTOR_REQUIRED` — the claim protocol, the
point of the tool, did not work on the platform unless the caller set
`WORKFILE_ACTOR` by hand.

The Claude Code hook carried the same two names independently, so it derived
nothing either. Both halves were wrong the same way, which is why they never
disagreed. `USER`, `USERNAME` and `LOGNAME` are read for the user now, and
`HOSTNAME` and `COMPUTERNAME` for the host, in both places, with a test that
drives the pair against both environment shapes.
