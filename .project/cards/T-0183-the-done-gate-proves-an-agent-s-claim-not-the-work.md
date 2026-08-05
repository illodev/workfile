---
id: T-0183
title: The done gate proves an agent's claim, not the work
status: backlog
type: epic
priority: high
area: core
tags: [protocol, acceptance]
effort: L
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-08-05
---

`assertAcceptanceMet` (`packages/workfile/src/modules/cards/mutations.ts:432`)
refuses `done` while a criterion is unchecked, and covers all four doors. What
it cannot cover is that the agent checks its own boxes: `card ac --check 3` is a
write the same actor performs on the way to `done`. The gate proves that
somebody asserted a criterion was met.

Two holes sit under that. `--force` leaves no trace — the trail entry is
`${current.status} → ${wanted}` (`mutations.ts:622`) and nothing else, so a
forced `done` and a proven one are the same line. And nothing binds the criteria
to the state that satisfied them, so checking every box and then rewriting the
criteria is free.

ADR-0016 records the design: criteria stay prose, a criterion may bind to a
command by text hash, a bound criterion is machine-owned, `done` records the
method that proved it (`local` / `ci` / `manual` / `forced`) with a digest over
the criteria region and the `verify` block, and the accepted methods are
declared per area in project config rather than remembered per agent.

This card is the umbrella. The children are independently shippable and land in
that order; the first two are worth having even if the rest never ships.

## Acceptance criteria

- [ ] Every child card is `done` or explicitly discarded with a reason.
- [ ] A `done` card in this repository carries a `verified` block naming its method.
- [ ] ADR-0016 is `accepted` or superseded by what was actually built.
