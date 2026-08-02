---
id: T-0095
title: card and doc answer an unknown subcommand by asking for an ID
status: done
type: bug
priority: medium
area: core
scope: [packages/workfile/bin/workfile.ts]
created: 2026-08-01
updated: 2026-08-02
related: [T-0088]
---

Nine command words, three behaviours. Measured today against the built binary:

| word | `workfile WORD` | `workfile WORD zzz` |
|---|---|---|
| card | `CLI_ARGUMENT_REQUIRED: card undefined requires an ID` | `CLI_ARGUMENT_REQUIRED: card zzz requires an ID` |
| doc | `CLI_ARGUMENT_REQUIRED: doc undefined requires an ID` | `CLI_ARGUMENT_REQUIRED: doc zzz requires an ID` |
| changelog, memory, agents, ci | `Unknown WORD command: undefined` | `Unknown WORD command: zzz` |
| claude, migrate, mcp | runs a default | `Unknown WORD command: zzz` |

Two separate defects.

**`card` and `doc` demand an ID before they reject the action.** `workfile doc
index` answers `doc index requires an ID`, which tells a reader to go find an ID
for a subcommand that does not exist. This is how `docs index` survived in
SPEC.md section 19.5 long enough for T-0088 to find it: probing it by hand does
not say it is unknown. The other seven words answer `CLI_COMMAND_UNKNOWN`.

**The bare word prints `undefined`.** Six of the nine interpolate a missing
subcommand straight into the message. SPEC section 19.1 documents `workfile
card` as an entry point, so a reader following the spec is told `card undefined
requires an ID`.

## The fix

In the `card` and `doc` handlers, reject an unrecognised action before reaching
the ID guard, the way the other seven already do. Where no action was given at
all, say so instead of interpolating `undefined` — the usage banner is already
printed for `--help` and is the honest answer here.

## Acceptance criteria

- [x] `workfile doc index` reports an unknown command, not a missing ID
- [x] No error message contains the literal `undefined`
- [x] A test pins the answer for every command word, bare and with a bogus action

## Activity

- 2026-08-01 23:46Z illodev@local#e55eab30 · claimed
- 2026-08-02 00:22Z illodev@local#e55eab30 · doing → review
- 2026-08-02 00:37Z illodev@local#e55eab30 · review → done

