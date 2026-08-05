---
id: T-0187
title: The project declares which verification methods each area accepts
status: review
type: feature
priority: medium
area: core
parent: T-0183
tags: [protocol, acceptance]
effort: S
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
depends: [T-0186]
---

Per ADR-0016, and the point where determinism actually lands. `project.config.mjs`
states the accepted methods per area — `ci` for `core`, `manual` allowed for
`docs` — and the `done` gate reads that value instead of relying on each agent
remembering the rule.

A gate every agent must remember to respect is a convention. A gate whose policy
is a declared value is a rule, and it is the only version of this that survives
a new agent joining the repository.

Depends on the `verified` block existing, since there is nothing to check a
policy against until then. Defaults must keep existing projects working: no
declaration means every method is accepted, which is today's behaviour.

## Acceptance criteria

- [x] `cards.verification` is declared in project config and reported by `workfile schema`.
- [x] `done` is refused when the card's method is not accepted for its area, naming the accepted ones.
- [x] A project that declares nothing behaves exactly as before, proven by a test.
- [x] `doctor` reports `done` cards whose recorded method the current policy no longer accepts.

## Notes

- 2026-08-05 23:08Z illodev@local#bf4c5f67 — Verified end to end: with methods {*: [ci, manual], docs: [manual]} declared, closing an api card with --method local is refused — CARD_VERIFICATION_METHOD_REFUSED names the method offered, the area, and the methods that area accepts, and points at force with a reason as the way past. The same close with --method manual succeeds. workfile schema reports both halves of cards.verification including the timeout, so an agent can read the policy instead of discovering it by being refused.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
