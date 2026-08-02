---
id: T-0105
title: The derived actor is POSIX-only, so claims do not work on Windows
status: done
type: bug
priority: high
area: core
scope: [packages/workfile/src/core/actor.ts]
related: [T-0099, T-0073]
created: 2026-08-02
updated: 2026-08-02
---

`resolveActor` derived `user@host` from `$USER` and `$HOSTNAME`, which are
POSIX. Windows sets `USERNAME` and `COMPUTERNAME`, so neither was found and the
function returned `unresolved` — and every command that needs an identity it
was not handed then failed:

```
$ workfile card claim T-0001
CARD_CLAIM_ACTOR_REQUIRED: actor is required.
```

Claiming is the point of the tool. On Windows it did not work at all unless the
caller set `WORKFILE_ACTOR` by hand, which is exactly the hand-typed actor
[[LRN-0006]] exists to stop people reaching for.

The hook carried the same two names, independently — it imports nothing from
the package by design — so on Windows it derived nothing either. Both halves
were wrong in the same way, which is why nothing disagreed and nothing failed
until a test asked a command to resolve its own identity.

## How it surfaced

The cross-platform CI has always run Windows, and it went red on `card reopen
ID --status doing` — the T-0073 test, which is the first test in the suite that
requires the resolved identity rather than passing an actor explicitly. Every
earlier test named its actor, so a derivation that produced nothing was never
asked for anything.

## The fix

`USER`, `USERNAME`, `LOGNAME` for the user; `HOSTNAME`, `COMPUTERNAME` for the
host; first match wins. Read from the environment rather than `node:os` so the
resolution stays injectable, which is what lets one test drive the CLI and the
hook against each other.

The guard test now runs both environment shapes, with every name blanked and
only the platform's own set — otherwise the runner's real `USER` leaks into the
Windows case and it passes for the wrong reason.

## Acceptance criteria

- [x] A Windows-shaped environment resolves an actor
- [x] The CLI and the hook derive the same string on both shapes
- [x] The test fails if either derivation drops the platform names

## Activity

- 2026-08-02 01:10Z illodev@local#e55eab30 · claimed
- 2026-08-02 01:10Z illodev@local#e55eab30 · doing → review
- 2026-08-02 01:13Z illodev@local#e55eab30 · review → done

