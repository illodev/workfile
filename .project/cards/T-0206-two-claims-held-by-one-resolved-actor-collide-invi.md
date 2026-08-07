---
id: T-0206
title: Two claims held by one resolved actor collide invisibly
status: done
type: bug
priority: medium
area: core
tags: [claims]
effort: S
scope: [packages/workfile/src/modules/cards/claims.ts, packages/workfile/src/core/actor.ts, packages/workfile/src/runtime/claude/hooks.mjs, plugins/workfile/runtime/hooks.mjs, packages/workfile/test/claims.test.ts, packages/workfile/test/claude-surface.test.ts, packages/workfile/ui/src/types.ts]
origin: [T-0196]
created: 2026-08-05
updated: 2026-08-07
related: [ADR-0020, LRN-0030, T-0219, T-0196]
verified:
  at: "2026-08-07T17:02:17.071Z"
  method: local
  commit: 4e8da0782fecb7e52899f7916be21ad7f3d4c775
  digest: "sha256:32694851285580f3877b44d3ff44fcf51cff487cf052e8131da85045701783d8"
---

`activity.conflicts` pairs claimed cards whose scopes overlap and skips pairs
sharing a `claimed_by`. Two agents in the same repository resolve to different
actors because `resolveActor` appends a session discriminator, so the set fires
for them. Two plain terminals do not: both resolve to `user@host`, both claims
look like the same person, and the overlap is dropped.

That is the case the skip was written for — one person moving between their own
cards is not a conflict — but it also silently covers the case where they are two
processes that will overwrite each other. The claim board the `PreToolUse` guard
reads has the same blind spot.

The distinction the skip actually wants is not the actor but the session:
`ClaimEntry.claim.sessionId` is already carried and is already null for a plain
terminal. Two claims with different non-null sessions are two processes whatever
their actor says; two with the same session are one. What to do when both are
null is the decision this card has to make — treating it as a conflict is noisy
for a solo user, and treating it as safe is what happens today.

Surfaced by T-0196, whose popover can only report the conflicts it is handed.

## Acceptance criteria

- [x] Two claims from different sessions with overlapping scopes are reported as a conflict whatever their actors resolve to.
- [x] A single session moving between its own overlapping cards is still not a conflict.
- [x] The rule for two claims with no session is decided, recorded and tested.
- [x] The claim board the scope guard reads applies the same rule as the activity snapshot.

## Activity

- 2026-08-07 16:52Z illodev@local#42eb42f5 · claimed
- 2026-08-07 17:02Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 17:02Z illodev@local#42eb42f5 — Fixed. The skip compared actors, which reads as a session check only because resolveActor writes the discriminator into the actor's tail — so it was right often enough to look correct and wrong exactly where it mattered. claimSeparation now answers "provably the same process" and names its evidence: sessions-differ, actors-differ, or unproven. A session is recovered from either place that carries it, the session file or the actor's tail, both normalised through sessionDiscriminator, now exported from core/actor.ts so there is one definition instead of two that can drift. Found a second defect feeding the same rule: claimState resolved a claim's session with one find over `cardId === card.id || actor === claimed_by`, so two cards held by one actor string could both be attributed to whichever session came first — erasing the exact evidence the comparison needs. Attribution now prefers the session that names the card. The decision on the sessionless case is ADR-0020: unproven is reported, not dropped and not prompted on. Dropping it is the bug that let two terminals collide with no trace; prompting on it interrupts somebody about a card they claimed themselves, which is the guard people switch off. So the snapshot carries it with its basis and the scope guard stays silent on it. Criterion 4 turned out not to need a behaviour change, and that is the finding rather than a shortcut: because the session lives in the actor's tail, the guard's string comparison IS the session comparison for every pairing it can see. Rather than argue that, separatesFromMe names it and a new pin drives the real hook over six pairings and requires its silence to match claimSeparation — verified by mutation, flipping the comparison to `return true` fails four of the six with the diagnostic naming both verdicts, and restoring it goes green. One asymmetry stays and is recorded rather than half-fixed: the snapshot can read a session from a session file, the guard cannot, because board.json carries no session and the hook imports nothing from the package on a p95-under-30ms budget. So two agents sharing an explicit --actor are a reported conflict the guard will not prompt about — LRN-0030 and T-0219.
- 2026-08-07 17:02Z illodev@local#42eb42f5 — local verification: pnpm run check green: 464+7 tests pass (4 new), strictNullChecks held at 488. New rule tests cover the session table, two terminals sharing an actor reported as unproven, one actor string over two sessions reported as sessions-differ, and one session over two overlapping cards reported as no conflict. Guard pin drives the real PreToolUse hook over six pairings against claimSeparation; mutation-checked by flipping separatesFromMe to , which fails 4 of 6, and restoring it returns 19/19. Plugin runtime regenerated so both copies match. doctor 0/0, memory verify 0/0.
- 2026-08-07 17:02Z illodev@local#42eb42f5 — Correction to the verification entry above: a shell substitution ate two words from it. The mutation check flipped separatesFromMe to return true — that is what failed 4 of the 6 guard pairings before restoring it returned 19/19.
