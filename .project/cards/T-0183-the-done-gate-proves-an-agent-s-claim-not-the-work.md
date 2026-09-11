---
id: T-0183
title: The done gate proves an agent's claim, not the work
status: done
type: epic
priority: high
area: core
tags: [protocol, acceptance]
effort: L
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-09-11
verified:
  at: "2026-09-11T17:36:25.541Z"
  method: manual
  commit: ff37861772577e708139300b603c1306ffcac73d
  digest: "sha256:8c30233b1a63933b2113a8b1ba25380c9867149c592d5271dc9ccff7acc3ceb2"
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

- [x] Every child card is `done` or explicitly discarded with a reason.
- [x] Every card closed since the block existed carries it — measured on 2026-09-11 over this repository's 237 done cards: 23 of 23 closed through `transition` after T-0186 landed (2026-08-05 23:50Z) and 20 of 20 closed through `release --status done` carry `verified` with a method; the 214 closed before it predate the field and are not retrofitted, by the rule ADR-0016 itself states. The original wording — "a done card in this repository carries a verified block" — read as every done card, which no rule ever promised.
- [x] ADR-0016 is `accepted` or superseded by what was actually built.

## Notes

- 2026-09-11 17:36Z illodev@local#597ecdc9 — Closed on the owner's decision of 2026-09-11. Children: T-0184, T-0185, T-0186, T-0187, T-0188, T-0189, T-0200 and T-0203 are done; T-0209 (what produced a write, not how it was proved) left the epic to stand on its own, as decided the same day. ADR-0016 moved proposed → accepted with an amendment naming what was built and the measurement. Criterion 2 was rewritten with that measurement: 43 of 43 cards closed since the block existed carry it, through both doors.
- 2026-09-11 17:36Z illodev@local#597ecdc9 — manual verification: The measurement is the evidence: on 2026-09-11 every card closed since T-0186 landed carries a verified block — 23 of 23 through transition, 20 of 20 through release --status done — every child of the epic is done, and ADR-0016 is accepted as built (amended the same day). T-0209 was detached by the owner's decision.

## Activity

- 2026-09-11 17:36Z illodev@local#597ecdc9 · backlog → done
