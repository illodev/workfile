---
id: LRN-0030
title: The scope guard sees less of a claim than the activity snapshot does
status: active
category: infra
confidence: high
related: [T-0206, ADR-0020, T-0089]
tags: [claims, hooks]
created: 2026-08-07
updated: 2026-08-07
---

Recorded for T-0206 against 0.8.1. Both surfaces apply one rule —
`claimSeparation` — and they do not always reach the same verdict, because they
do not see the same evidence. Knowing which is which saves the next person the
investigation.

**A session can be carried in two places.** A session file under
`.project/.cache/activity/sessions` knows its own id and, when written by
`recordAgentSignal`, the card it is on. A `claimed_by` carries the session in its
tail — `solo@box#e55eab30` — whenever the claiming process resolved its own
actor. The tail outlives the session file and survives into git; the file is the
only source when an explicit `--actor` was passed, because a hand-typed actor has
no tail.

**The snapshot reads both. The guard reads only the tail.** `buildActivitySnapshot`
holds the session files, so `claimSession` prefers the file that names the card.
The `PreToolUse` guard reads `board.json`, whose entries are `id`, `title`,
`status`, `claimedBy`, `claimedAt` and `scope` — no session — and the hook
deliberately imports nothing from the package, so it cannot resolve one. Its
latency budget is p95 under 30 ms and a `PreToolUse` runs before *every* matching
call, which is the whole reason for that constraint.

**What this costs, exactly.** One case: two agents claiming overlapping scopes
with the same explicit `--actor`. The snapshot reports `sessions-differ` from the
two session files; the guard sees one actor string equal to its own and stays
silent. Every other pairing agrees, because the tail makes actor equality and
session equality the same comparison — pinned by a test in
`test/claude-surface.test.ts` that runs the real hook over each case.

**How to apply.** Do not read the guard's silence as "no conflict": read
`activity.conflicts`, which is the surface with the evidence. Closing the gap
means putting the resolved session on the board rather than teaching the hook to
read session files — the board is already written by both the package
(`rebuildClaimBoard`) and the hook's own `buildBoard`, so it is the one place a
session can be resolved once and read for free. Note that board staleness is a
separate known problem (T-0089): it is built at session start, so a claim taken
mid-session is invisible to the guard whatever the entries carry.

**And the trap underneath all of it.** Never compare claims by actor and call it
a session check. It is right often enough to look correct and wrong exactly when
it matters — two plain terminals, or one `--actor` shared by two agents.
