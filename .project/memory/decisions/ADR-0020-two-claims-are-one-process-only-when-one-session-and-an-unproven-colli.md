---
id: ADR-0020
title: Two claims are one process only when one session, and an unproven collision is reported not prompted
status: accepted
related: [T-0206, T-0196, LRN-0030]
tags: [claims, protocol]
created: 2026-08-07
updated: 2026-08-07
---

## Context

`activity.conflicts` paired claimed cards whose scopes overlapped and skipped
any pair sharing a `claimed_by`. The skip was written for a true case — one
person moving between their own cards is not a collision — and it read as
correct because `resolveActor` appends a session discriminator to the actor, so
two agents in one checkout usually differ.

It silently covered two cases that are two processes about to overwrite each
other:

- Two plain terminals. Both resolve to `user@host` with no discriminator, both
  claims look like the same person, and the overlap was dropped.
- Two agents handed the same `--actor`, which is what the generated protocol
  used to teach. Same string, different sessions.

The attribution feeding the comparison had its own defect. `claimState` found a
claim's session with one `find` over `cardId === card.id || actor ===
claimed_by`, so for two cards held by one actor string it could return whichever
session came first and attribute both cards to it — erasing exactly the evidence
the rule needs.

## Decision

The question is not "same actor" but "provably the same process", and the answer
carries its own evidence. `claimSeparation` in
`packages/workfile/src/modules/cards/claims.ts` returns null for one process, or
what told the pair apart:

- `sessions-differ` — two sessions, seen. Also the verdict when one side has a
  session and the other does not.
- `actors-differ` — no session either side, different actors. Two people.
- `unproven` — no session either side and the same actor.

A session is recovered from either place that carries it: a live session file
knows its own id, and a `claimed_by` written by a process that resolved its own
actor carries the discriminator in its tail, which outlives the session file and
survives into git. Both are normalized through `sessionDiscriminator`, now
exported from `core/actor.ts` so there is one definition rather than two that can
drift. Session attribution prefers the session naming the card over any session
merely sharing its actor.

**`unproven` is reported, not dropped, and not prompted on.** One person holding
two overlapping cards and two terminals racing each other are the same record;
nothing in the workspace distinguishes them. Dropping it is the bug — it is what
let two terminals collide with no trace anywhere. Prompting on it is the other
failure: a guard that interrupts somebody about a card they claimed themselves is
the guard they switch off, and then it protects nothing. So the activity snapshot
reports it with its basis, where a reader can weigh it and nobody is interrupted,
and the `PreToolUse` scope guard stays silent on it.

## Consequences

The guard needed no behavioural change, and that is worth stating rather than
leaving to look like luck: because `actorFor` writes the session into the actor's
tail, comparing `claimed_by` against this session's actor *is* comparing
sessions, for every pairing the guard can see. The equivalence is now named
(`separatesFromMe`) and driven by a test that runs the real hook over every
pairing and requires its silence to match `claimSeparation` — flipping the
guard's comparison fails four of the six cases.

Consumers gain an optional `basis` on each conflict. The popover from T-0196 can
render an unproven overlap as possible rather than certain; nothing is required
to read the field.

One asymmetry remains and LRN-0030 records it: the snapshot can resolve a session
from a session file, and the guard cannot, because the board it reads carries
only `claimed_by` and the hook deliberately imports nothing from the package. So
two agents sharing an explicit `--actor` are a reported conflict the guard will
not prompt about. Closing it means putting the session on the board, and the
hook's latency budget is the reason that is a separate decision rather than a
line in this one.
