---
id: T-0073
title: card reopen accepts --actor and then demands one
status: review
type: bug
priority: medium
area: core
tags: [cli]
related: [T-0052]
created: 2026-07-31
updated: 2026-08-02
scope: [packages/workfile/src/modules/cards/mutations.ts]
---
Reopening a done card into `doing` was impossible, and the reason moved once
between the report and the fix.

As reported, `--actor` passed the unknown-flag guard and the branch never read
it, so the caller was told the flag was valid and then told its value was
missing. [[T-0091]] re-keyed `COMMAND_FLAGS` per subcommand and removed it, so
that contradiction is gone — `card reopen ID --actor X` now answers
`CLI_ARGUMENT_UNKNOWN` and names the subcommands that do take it. Honest, and
it left reopening into work impossible:

```
$ workfile card reopen T-0001 --status doing
CARD_CLAIM_ACTOR_REQUIRED: actor is required.

$ workfile card reopen T-0001
T-0001 reopened          # backlog claims nobody, so this worked all along
```

## The wrapper, not the flag

`reopenCard` forwards to `transitionCard`, which requires an actor to reach
`doing` because arriving there takes a claim — and `actor` was not among the
options it forwarded (`mutations.ts:823`). The CLI was the surface where it was
noticed; `project_card_reopen` and the HTTP reopen route call the same wrapper
and had the identical hole. Three surfaces, one dropped argument.

A wrapper that forwards some of its target's options and not others is the
shape worth naming. The caller sees a complete command, and the missing option
stays invisible until the one status that needs it is asked for. Nothing in the
suite compared a wrapper's forwarded options against its target's.

`--actor` is now wired on all three, defaulting to the resolved session
identity rather than demanded — per [[LRN-0006]], a hand-typed actor is what
the protocol stopped teaching. `USAGE.card` and `cli.md` document it, and the
MCP schema accepts it.

## On the class

The card asked for a test comparing each command's `COMMAND_FLAGS` entry
against the flags its branch reads. That test already exists — "the flag table
matches what each subcommand actually reads" — and it is per subcommand and
checks both directions. It did not catch this because the defect was never in
the flag table: the branch read no actor because the module below it accepted
none. The check that would have caught it is behavioural, and it is what was
written: reopening into `doing` is exercised at the module and at both servers,
so a fix in one place cannot leave the other two as they were.

## Acceptance criteria

- [x] `card reopen ID --status doing` works with no actor typed
- [x] `--actor` is accepted and honoured for a caller acting on another's behalf
- [x] The MCP tool and the HTTP route reopen into `doing` too
- [x] A test fails if the wrapper stops forwarding the actor

## Activity

- 2026-08-02 00:47Z illodev@local#e55eab30 · doing → review
