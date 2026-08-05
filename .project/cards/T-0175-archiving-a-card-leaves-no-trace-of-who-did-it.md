---
id: T-0175
title: Archiving a card leaves no trace of who did it
status: backlog
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

- [ ] Whether archiving is attributed is decided and recorded
- [ ] If it is, every surface passes an actor and the trail entry is written
- [ ] `unarchive` and `archive` end up symmetric either way
