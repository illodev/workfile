---
id: T-0186
title: A verified card records the method, the commit and a digest of what it proved
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
depends: [T-0185, T-0200]
---

Per ADR-0016. `done` writes a `verified` block: `at`, `method`, `commit`,
`run` and `digest`. `method` is `local`, `ci`, `manual` or `forced`.

The tiers carry more weight than the digest does. `local` is a command that ran
on the author's machine and stays self-reported; `ci` has a witness; `manual`
is legitimate for a criterion no command expresses — "the recut demo video reads
correctly" — but must be labelled rather than left indistinguishable from a green
test; `forced` is what the previous card makes visible.

**The digest covers the criteria region and the `verify` block only.** It cannot
cover the body: the `done` transition appends a trail entry itself, so a
whole-body digest is invalidated by the write that creates it. The digest is
meaningless without the bindings in T-0185, which is the only sense in which
this card depends on it.

Staleness is reported, not enforced retroactively. A card verified at commit X
while HEAD is Y is information; invalidating history every time the scope is
touched again would make the field noise, and nobody would read it.

## Acceptance criteria

- [ ] Reaching `done` through any of the four doors writes a `verified` block.
- [ ] `method: manual` requires prose evidence and is refused without it.
- [ ] The digest is computed over the criteria region and `verify` block, and is stable across a trail append, proven by a test.
- [ ] Editing a criterion after verification makes `doctor` report the card as verified against changed text.
- [ ] `doctor` reports, without failing, a `done` card whose `commit` is not an ancestor of HEAD.
