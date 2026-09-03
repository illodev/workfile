---
id: CHG-0166
title: The protocol names its two exits, and two guards make them observable
type: changed
area: core
visibility: public
cards: [T-0237]
created: 2026-09-03
updated: 2026-09-03
---

The shipped protocol defined `review` as "implementation finished" and never said what to
do when a turn ends with work still inside the card. Both outcomes were written with the
same word, so a board could not tell them apart afterwards. Measured in a consuming
repository: **181 of 249 cards in `review`** had been put there by automated agents with a
**seven-minute median between claim and review**, and separating the finished from the
abandoned cost an audit of the whole board.

**The protocol** now names two exits — `review` only when every criterion is met and just
runtime evidence is missing, otherwise `next`/`blocked` with the reason in a note — and says
where a reason actually keeps. It also gains an acceptance-criteria section (the heading
`card ac` reads, checkboxes being only for criteria, one claim per criterion, a false premise
rewritten with its measurement), the verify polarity trap, a `blocked` that means "waiting on
a hand that is not yours", and the counterweight to carding everything: finish it when it is
the same file and the same run, and let a batch that advances update its own card. A test
fails if any of those is dropped from the generated surfaces.

**`doctor` reports a card in `review` with not one criterion met.** Deliberately blunt, and
measured before it shipped: over a real 245-card review column, 71 % have every criterion
met, 19 % are partial and **2 % are zero**. Warning on the partials would have covered a
fifth of the column, most of it correct. On the board it was measured against it names four
cards.

**A reason that would be dropped is now refused.** `claim --reason` is required and
persisted; the same flag on `transition`, `patch` and `release` was read only when `force`
actually waived a gate, and otherwise accepted and thrown away in silence. An agent that
learned the flag where it works carried the habit to the three doors where it does not,
believed the card said why, and the card said nothing. The refusal names `card note`, which
is the door that keeps it. `card reap` is untouched: it forces past gates it never trips and
passes no reason.
