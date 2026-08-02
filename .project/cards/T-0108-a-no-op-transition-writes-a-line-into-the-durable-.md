---
id: T-0108
title: A no-op transition writes a line into the durable trail
status: done
type: bug
priority: low
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
created: 2026-08-02
updated: 2026-08-02
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
- 2026-08-02 16:56Z illodev@local#aed59c5e · claimed
- 2026-08-02 17:07Z illodev@local#aed59c5e · doing → done

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
