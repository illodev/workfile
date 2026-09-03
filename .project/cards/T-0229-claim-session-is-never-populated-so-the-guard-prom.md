---
id: T-0229
title: claim.session is never populated, so the guard prompts about your own card
status: review
type: bug
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-03
---

`separatesFromMe` asks "is this claim another process?" and, with `claim.session === null`, the only
honest answer is "yes":

```js
const theirs = claim.session || null;
if (theirs && mySession) return theirs !== mySession;  // never taken: theirs is always null
if (theirs || mySession) return true;                  // TRUE whenever the editing session has an id
return claim.claimedBy !== mine;                       // the only actor-vs-actor branch: unreachable
```

`mySession` comes from `input.session_id`, which a Claude Code hook always supplies. So the strong
branch is never taken, the second always fires, and the third is dead code. **The guard prompts you
about your own card.**

## Why `session` is null

`sessionForClaim` has three steps and all three miss when the claim was made with an explicit
`--actor`:

1. `cardId` on the session file — **dead code in production**. `recordAgentSignal(..., {cardId})` is
   the only function that accepts it and its only callers in the whole repo are tests; the hook's
   twin `signal()` does not even take the parameter, it only preserves `previous.cardId`. Measured
   on Fube: **19/19 session files carry `cardId: null`**.
2. `entry.actor === claimed_by` — session files hold `illodev@local#<hex>`, never `drain-*`.
3. the `#hex` tail — a declared actor has none.

## Measured, and the obvious fixes measured too

Fube bench `scripts/workfile-guard-cases.mjs`, real hook against throwaway workspaces:

- **case 4**: exporting `WORKFILE_ACTOR=<role>` into the panel does **not** silence the guard. The
  cut happens at the second branch, before any actor is compared.
- **case 4c**: what does fill `session` is a board rebuild (`session-start`) *after* the claim, with
  a session file whose `actor` matches `claimed_by`. Then the strong branch is taken and the guard
  goes quiet — but the panel starts *before* it claims, so at the moment that matters the board does
  not have the card yet. Half a mechanism is worse than none: it would silence the guard only for
  cards claimed before the last restart.
- **case 8**: the hook reads only the cache, never the card, so a released claim keeps prompting
  until the next rebuild. It fails towards asking, which is right, but explains phantom prompts.

## Three objections any fix has to answer

Writing `cardId` from `card claim` looks obvious and is not safe as-is:

1. It binds the card to the session that **types** the claim, not the one that holds it — and
   `--actor` exists precisely for delegated claims ("CI claims as a bot, and a person can claim on a
   colleague's behalf").
2. `cardId` is a scalar nobody ever clears. Neither `transitionCard` nor `releaseCard` calls
   `recordAgentSignal`, so it is a monotonic misattribution; an actor holding five cards would be
   resolved for one of them.
3. The two writers of `board.json` resolve differently: the package sorts sessions by
   `lastSignalAt` descending, the hook's `readSessions` does not sort at all (raw `readdir`), and
   neither filters by `live`. Same card, same board, two answers depending on who rebuilt it.

Changing the fallback to actor-vs-actor instead is not a fix either: with a declared actor and no
`WORKFILE_ACTOR`, `mine` and `claimed_by` still differ, so it keeps prompting; and it would
desynchronise the guard from `claimSeparation`, which the surface test pins to one shared rule.

## Notes

- 2026-09-03 14:21Z illodev@local#062a7c97 — Fixed — and **this card's own dismissal of the fix was half right, so both halves are worth
recording.**

The card wrote off "changing the fallback to actor-vs-actor" with two objections:

1. *"with a declared actor and no `WORKFILE_ACTOR`, `mine` and `claimed_by` still differ, so it
   keeps prompting"* — **correct, and unchanged.** That is the price of the fix and it is now
   documented rather than discovered: to be left alone you have to **declare the identity you
   claimed with**. Measured: bench case 3 (`session: null`, own `claimed_by`, no `WORKFILE_ACTOR`)
   still asks, and it should — nothing links the pseudonym to the editing process.
2. *"it would desynchronise the guard from `claimSeparation`, which the surface test pins to one
   shared rule"* — **avoided, by fixing the rule instead of diverging from it.** The asymmetry was
   never in the guard: it was in `claimSeparation` itself. `if (left || right) return
   "sessions-differ"` reads a `null` as "that side has no session", but `null` means the workspace
   could not **find** one. For two board rows resolved the same way that inference is fine; for the
   guard, where one side is a live payload that **always** carries a session and the other is a row
   that never does for a declared actor, it fires on every call and makes the actor comparison dead
   code.

So the reorder is one line in each place, and the labels all survive:

```ts
if (left && right) return left === right ? null : "sessions-differ";
if (a.by === b.by) return "unproven";        // at most one session seen: not evidence
if (left || right) return "sessions-differ"; // different actors, one session seen
return "actors-differ";
```

`separatesFromMe` mirrors it exactly, which is what the pinning test needs: the one-sided test goes
and `return claim.claimedBy !== mine` covers both remaining outcomes. Suite: **500 pass, 0 fail**,
including `the scope guard and the activity snapshot apply one separation rule` and `two agents
sharing an explicit actor do not look like one process`.
- 2026-09-03 14:22Z illodev@local#062a7c97 — **Salida: `review`, no `done`.** El arreglo esta hecho y probado (500 pass, 0 fail, incluido el test que ata el guard a `claimSeparation`). Falta correrlo publicado, y falta la mitad del consumidor —exportar `WORKFILE_ACTOR` antes de que la sesion reclame—, que esta medida arriba y no aplicada en ningun sitio.
- 2026-09-03 22:42Z illodev@local#5c0f3978 — Acceptance criteria written on 2026-09-03 by the session that has been using 0.9.2 all day. The card sat in `review` declaring none, so `card ac` answered "declares no acceptance criteria" and closing it would have needed `--force` — which leaves an Activity line identical to a clean close. That is the anti-pattern this repository is about to name in its own shipped protocol, so it should not be in its own board. Three of the four are met by the fix in 0.9.2; the fourth is runtime and stays open.

## The measurement that reframes the card, and it is not in the card

**`session` is not "never populated". It is populated by the claim itself — if the session file
carries the same actor.** `claimCard` → `updateClaimBoard` → `claimBoardEntry` → `sessionForClaim`
runs over the session files **already on disk**, and `session-start` wrote one before the claim
happened. So the card's case-4c conclusion — *"the panel starts before it claims, so at the moment
that matters the board does not have the card"* — is **false**: the board does not need to be
rebuilt, because the claim updates its own entry.

Measured on the reporting repository's installed 0.9.1, disposable workspace, real CLI, real hook,
in the drain's order (session-start → claim → edit):

| `WORKFILE_ACTOR` exported before session-start | session file `actor` | board `session` | guard on own scope |
| --- | --- | ---: | --- |
| yes (`drain-probe`) | `drain-probe` | `"aaaa1111"` | **silent** |
| no | `illodev@local#aaaa1111` | `null` | **asks** |
| no, but exported for the edit only | `illodev@local#aaaa1111` | `null` | **asks** (this fix makes it silent) |

Row 1 is the one that matters: **the noise is fixable in the consumer today, on 0.9.1, with no
package change** — export `WORKFILE_ACTOR=<the actor you claim with>` before the session starts.
This fix earns row 3: declaring the identity works even when the session file was written before
the identity was declared, which is the delegated-claim case and the panel-exports-late case.

The three design objections to writing `cardId` from `card claim` stand and are untouched: none of
this binds a card to the session that typed its claim.

## The residual, unchanged

Two processes handed the **same** explicit actor are indistinguishable — LRN-0030. They are
`unproven` now instead of being called `sessions-differ` by accident: still reported in the
snapshot's `conflicts`, where nobody is interrupted, and no longer a verdict the workspace has no
evidence for.

Nothing here touches T-0227 (the guard does not see edits made through Bash), which remains the
larger half.

## Acceptance criteria

*(Written 2026-09-03, after the fix shipped. The card had none, which is why it could not be closed
without `--force` — the exact shape this repository is about to name in its own protocol.)*

- [x] `claimSeparation` treats a null `session` as **unknown** rather than as a differing side, so a claim written with an explicit `--actor` no longer produces a `sessions-differ` verdict the workspace has no evidence for.
- [x] The unproven case is still reported in the snapshot's `conflicts`, where nobody is interrupted, rather than being dropped.
- [x] The card's own claim that `session` is "never populated" is corrected in place with the measurement that killed it: it **is** populated by the claim itself when the session file carries the same actor.
- [ ] Runtime: an agent that claims with an explicit `--actor` and then edits inside that scope is not prompted by the guard about its own card.

## What is NOT in this card, said so it is not assumed

The three design objections to writing `cardId` from `card claim` **stand and are untouched**: none
of this binds a card to the session that typed its claim, which is what `--actor` exists to allow.

The residual is unchanged and is [[LRN-0030]]: two processes handed the **same** explicit actor are
indistinguishable. They are now `unproven` instead of being called `sessions-differ` by accident —
which is the whole point, a verdict the workspace has no evidence for is worse than no verdict.

And [[T-0227]] — the guard does not see edits made through Bash — is untouched and is **the larger
half**. Closing this card does not close that hole.

## Activity

- 2026-09-03 14:22Z illodev@local#062a7c97 · backlog → review
