---
id: T-0229
title: claim.session is never populated, so the guard prompts about your own card
status: backlog
type: bug
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-02
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
