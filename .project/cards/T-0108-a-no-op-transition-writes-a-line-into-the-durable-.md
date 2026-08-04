---
id: T-0108
title: A no-op transition writes a line into the durable trail
status: done
type: bug
priority: low
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
created: 2026-08-02
updated: 2026-08-04
---

`card transition ID review` on a card already in `review` appends
`review → review` to `## Activity`. Reproduced on a scratch workspace: three
identical transitions, three lines.

```
- 2026-08-02 10:47Z illodev@local · backlog → review
- 2026-08-02 10:47Z illodev@local · review → review
- 2026-08-02 10:47Z illodev@local · review → review
```

The `doing` case has the same shape through a different door: `transitionCard`
delegates to `claimCard`, so re-claiming a card you already hold appends a
second `claimed`. Both were hit in one session — the claim plus a redundant
`transition doing`, which is a sequence an agent following the start-work
workflow literally to the letter will produce.

The trail is specified as five to fifteen lines over a card's whole life,
reviewable in a diff. A line that records nothing having happened is exactly
what erodes that: the reader cannot tell a real move from a repeated command.

The fix is a guard where the trail is written, not at the callers — `patchCard`,
the HTTP routes and the MCP tools all reach the same place, and a rule enforced
at one of four entrances is the failure this module has already had once.

## Acceptance criteria

- [x] Transitioning to the status a card already has leaves the trail unchanged
- [x] Re-claiming a card the same actor already holds leaves the trail unchanged
- [x] A real transition still writes exactly one line
- [x] The guard sits at the write path, so all four surfaces inherit it

## Notes

- 2026-08-02 17:07Z illodev@local#aed59c5e — Fixed at one gate: `appendMilestone` in mutations.ts folds `trailEnabled` and
the skip into a single call, and all four mutation functions route through it.
Each supplies its own notion of "nothing happened", because that cannot be
inferred — a redundant claim rewrites `claimed_at`, so the candidate differs
from the card on disk even though no protocol event occurred.

Reproduced before, on a scratch workspace, the sequence the start-work
workflow produces — eight lines for three events:

    backlog → review      real
    review → review       no-op
    review → review       no-op
    claimed               real
    claimed               no-op
    claimed               no-op   (the redundant `transition doing`)
    released              real
    released              no-op

After, the same commands leave three lines. Verified against the built CLI on
throwaway workspaces, not reasoned from the source.

A third no-op writer this card does not mention: `releaseCard`. Releasing a
card nobody holds wrote `released` every time, three commands and three lines.
It is the same defect through a third door and is covered by the same gate, so
it is fixed here rather than carded — noting it because the AC list describes
only transition and claim, and the third case would otherwise read as
accidental.

Precision on the fourth criterion, because "four surfaces" is used two ways in
this repository and the guard does not cover both readings equally:

- As write paths — `patchCard`, `claimCard`, `releaseCard`, `transitionCard`,
  which is the sense mutations.ts:298 uses for "four entrances" — the guard
  covers all four, and every transport inherits it by construction: CLI, both
  HTTP route families (`/api/v2/cards/*` and the legacy `/api/tasks/*`
  adapter) and MCP all call these same exported functions.
- As literal callers of `appendActivityLine` there are six, and two are not
  behind the gate: `renumber.ts:132` and `:291` import it directly and inline
  their own `activityTrail !== false` check. Neither can write a no-op —
  renumbering only runs when the id actually changes, and the reslug loop
  short-circuits with `if (target === card.file) continue;` before the append —
  so the criterion holds, but "the guard sits at the write path" is stronger
  than what shipped. Left alone deliberately: routing them through the gate
  would touch a module outside this card's scope to fix no bug.

The trail had no test coverage at all, which is how this survived. Added "the
durable trail records moves, not commands" to mutations.test.ts, pinning each
suppression and — the part that matters — that a real move still writes
exactly one line afterwards.

Verification: 228 + 7 tests pass, strict holds at baseline, and the before and
after above came from running the CLI.

Found on the way: [[T-0115]] — `card write` replaces the body wholesale and the
trail lives in the body, so a single write erases the whole section. Reproduced.
That defeats this card more completely than the no-op lines did.
- 2026-08-02 17:20Z illodev@local#aed59c5e — Reopened on a defect in the fix itself, found by review after it was closed.

The predicate that keeps an unarchive from being suppressed was right, but the
line it wrote was `backlog → backlog` — a status move that did not happen,
which is the exact shape this card set out to remove. It now writes
`unarchived` when the status is unchanged, and the test asserts both that the
line appears and that no `backlog → backlog` survives anywhere.

Two review objections resolved rather than accepted:

- "The `redundant` flag fails open: a fifth writer that forgets it reproduces
  the bug." It does not. Omitting the field is a compile error — checked by
  removing it from `claimCard` and running the build, which reports
  `TS2741: Property 'redundant' is missing`. `build:core` runs `tsc`, so a
  writer that forgets the flag fails CI rather than shipping a silent
  regression.
- "Pass a structured milestone and let the gate compute redundancy, so the
  rule itself is centralized." Declined, and the reasoning is worth recording
  because the objection is a fair one. Each predicate depends on state only
  its own operation has — `moveToArchived` for transitions, `releasedStatus`
  for releases, the actor-versus-holder comparison for claims. Moving them into
  the gate turns four predicates that sit beside the operation they describe
  into four branches of a switch that must know all four operations. That
  relocates the rule without unifying it, and the practical failure mode the
  objection worried about is already closed by the compiler.

Found while checking a third objection — that a change of holder is a
milestone the trail does not record. It is worse than unrecorded: `card patch`
writes `claimed_by` as an ordinary field, so it takes over another actor's
claim with no ownership guard, no reason, and no line. Carded as [[T-0117]] at
high priority; it is out of scope here, and it is the third time this module
has enforced a rule at some of its entrances.

Verification after the reopen: 228 + 7 tests pass, strict holds, and the
unarchive case was reproduced from the CLI before and after.

## Activity

- 2026-08-02 16:56Z illodev@local#aed59c5e · claimed
- 2026-08-02 17:07Z illodev@local#aed59c5e · doing → done
- 2026-08-02 17:17Z illodev@local#aed59c5e · claimed
- 2026-08-02 17:20Z illodev@local#aed59c5e · doing → done
- 2026-08-04 23:35Z illodev@local#cfe281b4 · moved 4 trail entries into the trail
