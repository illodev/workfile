---
id: T-0203
title: card verify runs a card's declared commands and checks what they proved
status: done
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
verified:
  at: "2026-08-05T23:50:03.791Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:100abe8d2cb3d9937f6e16a602ac5e245a8133ee1104f940e321a402ca9f136c"
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

- [x] `card verify ID` runs the declared commands and reports pass or fail per entry, with `--json`.
- [x] A passing entry checks exactly the criteria bound to it, and no others, proven by a test.
- [x] A command the project's allowlist does not permit is refused before it runs.
- [x] A run that changes a criterion's state leaves a trail entry naming the entry that changed it.
- [x] The behaviour is documented in the CLI reference, including what it does not do.

## Notes

- 2026-08-05 23:08Z illodev@local#bf4c5f67 — Verified end to end: card verify ran the declared entry and reported 'PASSED proof (0.0s) node -e process.exit(0) — checked #1', then the card read 1 of 2 met. It checked exactly the criterion bound to that entry and left the other alone, which is the guarantee setCardAcceptance's runner argument exists for. Before the run, card ac --check on the same criterion was refused with CARD_ACCEPTANCE_MACHINE_OWNED naming the command that owns it.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Scratch workspace: card verify ran the declared 'node -e' entry, checked exactly the one criterion bound to it and reported per-entry JSON with the acceptance state. A hand check of that same criterion was refused with CARD_ACCEPTANCE_MACHINE_OWNED naming the entry, and a command outside the allowlist was refused before it ran.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done
