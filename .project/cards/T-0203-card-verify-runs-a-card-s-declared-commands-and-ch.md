---
id: T-0203
title: card verify runs a card's declared commands and checks what they proved
status: backlog
type: feature
priority: high
area: core
parent: T-0183
depends: [T-0185, T-0188]
tags: [protocol, acceptance]
effort: M
scope: [packages/workfile/src/modules/cards]
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-08-05
---

Split out of T-0185, which built the binding: a criterion can name the command
that proves it, and `card ac --check` refuses it once it does. Nothing yet runs
those commands, so a bound criterion is currently a criterion nothing can check.

`workfile card verify ID` runs each `verify` entry, reports pass or fail per
entry, and checks exactly the criteria bound to the entries that passed.
`setCardAcceptance` already takes the `runner` argument that permits this and
refuses everything else: with it, an entry may write the criteria bound to it and
no others, because a runner allowed to check anything would be the same hole one
rung further in, reached by declaring a `verify` entry instead of by typing
`--check`.

Depends on T-0188 rather than merely relating to it. This is the command that
executes card-declared shell, and ADR-0016 states that its decision "is not
implementable without an allowlist of permitted command prefixes in project
config". LRN-0025 corrects what that allowlist is for — not the fork boundary,
which is elsewhere and already priced — but the local case is real and is exactly
this command: a maintainer running `card verify` on a branch they only meant to
read.

Decisions to make while implementing, not after:

- Whether `run` is a shell string or an argv list. An argv list with no shell is
  the only version the allowlist can reason about, and it is what makes a prefix
  match mean something.
- What a failing run does to a criterion that was checked by an earlier passing
  one. Unchecking it is the honest reading and is also a state change with no
  actor behind it, which is the failure mode T-0184 exists to prevent — so it
  needs a trail entry naming the run.
- Whether `--dry-run` belongs here at all. The flag is documented as "preview
  filesystem changes", and a dry run that spawns every declared command and only
  skips the write-back is not a preview.

## Acceptance criteria

- [ ] `card verify ID` runs the declared commands and reports pass or fail per entry, with `--json`.
- [ ] A passing entry checks exactly the criteria bound to it, and no others, proven by a test.
- [ ] A command the project's allowlist does not permit is refused before it runs.
- [ ] A run that changes a criterion's state leaves a trail entry naming the entry that changed it.
- [ ] The behaviour is documented in the CLI reference, including what it does not do.
