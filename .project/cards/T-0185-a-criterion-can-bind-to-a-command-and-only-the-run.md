---
id: T-0185
title: A criterion can bind to a command, and only the runner may check it
status: backlog
type: feature
priority: high
area: core
parent: T-0183
tags: [protocol, acceptance]
effort: M
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
---

Per ADR-0016. Frontmatter carries a `verify` list — `id`, `run`, and the
criteria each command proves — and `workfile card verify ID` runs them and
checks what passed.

The binding is a hash of the criterion's normalised text, **not its index**.
`acceptance.ts` is explicit that indices are positional and that the card lock
plus `expectedRevision` refuse a concurrent reorder; that protects the write,
not the interval between proving criterion 2 and reaching `done`. A text hash
makes a reorder harmless and makes an edit to the criterion break the binding,
which is wanted in both directions.

Once bound, the criterion is machine-owned: `card ac --check` must refuse it.
That refusal is the whole point of the card — it is what moves the criterion
from something an agent asserts to something a command decided.

Normalisation needs pinning down before implementation: trim, collapse internal
whitespace, and nothing else. Case and punctuation are meaning in a criterion.

## Acceptance criteria

- [ ] `verify` entries validate on write; an unknown key or a criterion hash matching nothing is refused with a named error.
- [ ] `card verify ID` runs the commands and reports pass/fail per entry, with `--json`.
- [ ] A passing run checks exactly the criteria bound to that entry, and no others.
- [ ] `card ac --check` refuses a bound criterion and names the command that owns it.
- [ ] Reordering the criteria list leaves every binding intact, proven by a test.
- [ ] Editing a bound criterion's text breaks its binding and `doctor` reports it.
