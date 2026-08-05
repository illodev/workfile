---
id: T-0185
title: A criterion can bind to a command, and only the runner may check it
status: doing
type: feature
priority: high
area: core
parent: T-0183
tags: [protocol, acceptance]
effort: M
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
depends: [T-0200]
related: [LRN-0025]
claimed_by: "illodev@local#bf4c5f67"
claimed_at: "2026-08-05T19:52:50.201Z"
scope: [packages/workfile/src/modules/cards]
---

Per ADR-0016. Frontmatter carries a `verify` list — `id`, `run`, and the criteria
each command proves — and a criterion bound to one becomes machine-owned:
`card ac --check` refuses it and names the command that owns it. That refusal is
the whole point of the card. It is what moves a criterion from something an agent
asserts to something a command decided.

The binding is a hash of the criterion's normalised text, **not its index**.
`acceptance.ts` is explicit that indices are positional and that the card lock
plus `expectedRevision` refuse a concurrent reorder; that protects the write, not
the interval between proving criterion 2 and reaching `done`. A text hash makes a
reorder harmless and makes an edit to the criterion break the binding, which is
wanted in both directions.

Normalisation is trim and collapse internal whitespace, and nothing else. Reflow
and re-indentation are not changes to what a criterion says; case and punctuation
are.

This card is the binding and its refusal. **`workfile card verify` — the runner
that executes the commands and writes the results back — moved to T-0203**,
because a runner that executes card-declared shell is the exact thing T-0188
exists to bound, and ADR-0016 says outright that the decision "is not
implementable without an allowlist". Landing the model first is worth doing on
its own: a bound criterion is refused to a hand-written check whether or not
anything can yet run it.

Two corrections to what this card assumed. `card ac` has exactly one surface —
the CLI — so the refusal is one door, not four; there is no HTTP route and no MCP
tool for acceptance. And `verify` was not writable at all until T-0200: ADR-0016
draws it as a block sequence of mappings, which the frontmatter codec classified
as opaque and refused on the first write.

## Acceptance criteria

- [ ] `verify` entries validate on write; an unknown key, a duplicate id, a missing command or a digest matching no criterion is refused with a named error.
- [ ] The binding is a hash of the criterion's normalised text, and normalisation survives reflow but not a change of wording.
- [ ] Reordering the criteria list leaves every binding intact, proven by a test.
- [ ] `card ac --check` refuses a bound criterion and names the command that owns it.
- [ ] Editing a bound criterion's text breaks its binding and `doctor` reports it.

## Activity

- 2026-08-05 19:52Z illodev@local#bf4c5f67 · claimed
