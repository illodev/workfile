---
id: CHG-0114
title: The acceptance gate stops mistaking a heading it does not know for a card with nothing to prove
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
`## Acceptance criteria` was the only heading the reader knew. Everything else
— `## Acceptance`, `## Definition of done`, `## Success criteria`, or the same
words in another language — parsed as a card that declares no criteria at all,
and `done` let it through because there was nothing to hold. `doctor` reported
nothing, because it read the same answer.

Four cards in this repository were closed that way, under `## Acceptance`, with
eight unproven criteria between them. The report that surfaced it arrived from
outside, from a board written in Spanish.

The reader now knows the headings people write, but that is the smaller half.
The half that closes it: a card carrying unchecked boxes under a heading the
reader does not recognise is no longer described as declaring nothing.

- `card ac` says it found no heading it recognises, and lists what it saw.
- `doctor` warns — `acceptance-unreadable` — at any status, so the heading can
  be fixed while the card is still open.
- `done` refuses with `CARD_ACCEPTANCE_UNREADABLE`, and `--force` still gets
  through for a checklist that was never a criterion.

`## Activity` and `## Notes` are excluded, and a card that declares its region
properly can keep any other list it likes without being asked about it.
