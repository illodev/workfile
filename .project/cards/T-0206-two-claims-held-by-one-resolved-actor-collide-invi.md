---
id: T-0206
title: Two claims held by one resolved actor collide invisibly
status: backlog
type: bug
priority: medium
area: core
tags: [claims]
effort: S
scope: [packages/workfile/src/modules/cards/claims.ts]
origin: [T-0196]
created: 2026-08-05
updated: 2026-08-05
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

- [ ] Two claims from different sessions with overlapping scopes are reported as a conflict whatever their actors resolve to.
- [ ] A single session moving between its own overlapping cards is still not a conflict.
- [ ] The rule for two claims with no session is decided, recorded and tested.
- [ ] The claim board the scope guard reads applies the same rule as the activity snapshot.
