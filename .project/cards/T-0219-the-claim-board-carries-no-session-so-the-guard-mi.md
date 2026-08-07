---
id: T-0219
title: The claim board carries no session, so the guard misses a shared actor
status: done
type: task
priority: low
area: core
tags: [claims, hooks]
effort: S
scope: [packages/workfile/src/modules/cards/claims.ts, packages/workfile/src/runtime/claude/hooks.mjs]
related: [T-0089]
origin: [T-0206, LRN-0030]
created: 2026-08-07
updated: 2026-08-07
verified:
  at: "2026-08-07T22:58:23.322Z"
  method: local
  commit: 9cfb0175194fc944ab34f527c800adf4c1b486d2
  digest: "sha256:89f0faee49e0513ddaf53fd252b98b26d1965433665d6a7341bf822cd8ab4cdf"
---

The residual ADR-0020 left open, recorded in full in LRN-0030.

`claimSeparation` decides whether two claims are two processes, and both the
activity snapshot and the `PreToolUse` scope guard apply it. They do not always
agree, because the board the guard reads carries `claimedBy` and no session:
`claimBoardEntry` and the hook's own `buildBoard` write the same six fields. So
the guard recovers a session only from the actor's tail, and a `claimed_by`
written from an explicit `--actor` has no tail.

One case is therefore invisible to the guard and reported by the snapshot: two
agents claiming overlapping scopes with the same explicit `--actor`. The guard
sees one string equal to its own and stays silent.

The fix is to resolve the session once where the board is built — both writers
hold the session files at that moment — and put it on the entry, so the hook
reads it for free. Teaching the hook to read the session directory instead is the
wrong shape: a `PreToolUse` runs before every matching tool call and its budget
is p95 under 30 ms.

Low priority because a hand-typed `--actor` already breaks other things — it
guards you out of your own card on release — so the configuration this protects
is one the protocol steers away from. Worth doing when the board is next touched;
T-0089 is already about board staleness and would pass through the same code.

## Acceptance criteria

- [x] A board entry carries the session resolved for its claim, from either source.
- [x] Both writers of the board — `rebuildClaimBoard` and the hook's `buildBoard` — produce the same entry for the same card, proven by a test.
- [x] Two agents sharing an explicit `--actor` make the guard prompt, proven by driving the real hook.
- [x] The hook's latency budget still holds.

## Activity

- 2026-08-07 22:17Z illodev@local#42eb42f5 · claimed
- 2026-08-07 22:58Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 22:58Z illodev@local#42eb42f5 — local verification: Driven through the real hook, four cases: the holding session stays silent; two agents with different sessions and the same explicit --actor now prompt, which is the case LRN-0030 left open; two session-free terminals with one actor stay silent because unproven is not a verdict; different actors prompt. The board carries the session from either source and both writers agree, pinned by a test that now compares the rule the guard applies rather than assuming null on both sides — it was agreeing by coincidence. The latency budget test passes, and the hot path gained one string operation and no I/O. Two mutations caught: dropping the field, and collapsing the guard back to comparing actors.
