---
id: T-0073
title: card reopen accepts --actor and then demands one
status: backlog
type: bug
priority: medium
area: core
tags: [cli]
related: [T-0052]
created: 2026-07-31
updated: 2026-07-31
---

Reopening a done card is impossible from the CLI:

```
$ workfile card reopen T-0072 --status doing
CARD_ENUM_INVALID → no; CARD_CLAIM_ACTOR_REQUIRED: actor is required.

$ workfile card reopen T-0072 --status doing --actor session-fube-triage
CARD_CLAIM_ACTOR_REQUIRED: actor is required.
```

`--actor` passes the unknown-flag guard, so the caller is told the flag is
valid and then told the value is missing. The reopen branch never reads it.

This is [[T-0052]] again, one command over: a flag listed in `COMMAND_FLAGS`
that the handler does not wire. There it was `--parent`, dropped in silence;
here the silence is worse, because the command fails with an error that names
exactly the flag the caller just passed.

`USAGE.card` documents `card reopen ID [--status backlog]` with no `--actor` at
all, so the one hint available also omits it.

## Worth checking while in there

T-0052 fixed `card create` by walking every field `createCard` reads and giving
each one a flag. The same walk has not been done for the other subcommands, and
this is the second handler found by accident rather than by looking. A test that
compares each command's `COMMAND_FLAGS` entry against the flags its branch
actually reads would close the class instead of the instance.

## Workaround

`card transition ID doing --actor ACTOR` reopens a done card, because
`transitionCard` has no transition graph to refuse it.
