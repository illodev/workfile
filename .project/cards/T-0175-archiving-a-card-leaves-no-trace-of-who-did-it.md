---
id: T-0175
title: Archiving a card leaves no trace of who did it
status: review
type: task
priority: low
area: core
tags: [actor, audit]
origin: [T-0168]
created: 2026-08-05
updated: 2026-08-05
---

[[T-0168]] set out to make every HTTP mutation name its actor, and listed
`archive` among the routes to fix, on the observation that `unarchive` passes
`resolveActor().actor` and `archive` does not. Checking it turned up something
different: the asymmetry is not a missing argument.

`archiveCard` (`modules/cards/mutations.ts:1027`) takes `{ expectedRevision }`
and nothing else. It calls `mutateCard` with `(current) => ({ status:
current.status })` — the status does not change, so no transition line is
written, and there is no activity entry for an actor to appear in. Verified:

```
$ workfile card archive T-0009
T-0009 archived
$ grep -A6 '## Activity' .project/cards/archive/T-0009-*.md
- 2026-08-05 10:50Z illodev@local#2cddaf94 · backlog → done      ← the earlier transition
```

Nothing about the archiving. `reopenCard` needs an actor for a different
reason: reopening is a transition, and reopening into `doing` takes a claim.

So passing an actor to `archiveCard` today would be dead code, and T-0168
correctly stopped short of adding it. The question this leaves is the real one:
**archiving is a board mutation that leaves no trace of who did it.** A card
leaves the board and the trail does not say who removed it or when, on any
surface — CLI, HTTP or MCP.

Whether that is worth a trail entry is a product call. The argument for is that
the repository is the audit log and this is the one mutation exempt from it.
The argument against is that archiving is reversible, `reopen` does record, and
the file move is itself visible in git.

## Acceptance criteria

- [x] Whether archiving is attributed is decided and recorded
- [x] If it is, every surface passes an actor and the trail entry is written
- [x] `unarchive` and `archive` end up symmetric either way

## Activity

- 2026-08-05 15:44Z illodev@local#2cddaf94 · claimed
- 2026-08-05 16:00Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 16:00Z illodev@local#2cddaf94 — Decided in ADR-0015: archiving is attributed. The deciding argument was not the missing actor but the asymmetry — `transitionCard` writes `unarchived` on the reasoning that the move is the milestone even though the status reads the same on both sides, and going in is the same move. The counter-argument that git records the rename is the one that had to be answered: the trail exists so who-and-when is answerable without reading git across a rename, and archiving is the one event that always renames. `archiveCard` takes `{ actor, expectedRevision, now }` and appends an `archived` milestone; CLI resolves `--actor || defaultActor()` (added to the flag table, which the flag-table test caught), both HTTP routes pass `body.actor ?? resolveActor().actor`, MCP gains `actor: ACTOR` and `actorFor`. The already-archived early return is untouched, so idempotence still writes nothing. Covered inside the existing trail test: `session-b · archived` is the last line after filing, a second archive leaves the count at 1, and the closing assertion is that the two lines are exactly `archived` and `unarchived` with no `done → done` anywhere. Vacuity: forcing `redundant: true` in the built dist fails on 'archiving names who did it'.
