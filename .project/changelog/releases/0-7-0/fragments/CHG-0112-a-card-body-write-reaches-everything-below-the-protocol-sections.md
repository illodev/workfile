---
id: CHG-0112
title: A card body write reaches everything below the protocol sections
type: fixed
area: core
visibility: public
created: 2026-08-04
updated: 2026-08-04
cards: [T-0157]
decisions: [ADR-0011]
---
`card write` protected `## Activity` and `## Notes` by position: it kept the
stored body from the first of those headings **to the end of the document**.
Anything a card carried below its notes — acceptance criteria, in practice —
could never be corrected, and the command reported success.

The headings were also found by `indexOf`, which finds them in two places they
are not: inside fenced blocks, and inside inline code. Every writer shared that
reading, so the damage was written *by* the protocol:

- a card quoting `## Notes` in an example had three quarters of its body frozen
- `card note` appended into the quoted block, where a reader sees literal text
- the trail of four cards in this repository was written into their prose, one
  of them its entire four-entry history, because a card written *about* the
  trail is a card that names it in a sentence
- `card ac` read a card's criteria out of a quoted example — the reading that
  gates `done`

A body is now read by scanning lines with fence state, shared by every writer.
A write applies in full and reports in `ignored` any protocol heading whose
content it declined to take, on the CLI, HTTP and MCP alike. `doctor` reports
stray trail entries as `misplaced-trail`, and `doctor --fix` moves them back.
