---
id: CHG-0067
title: doctor and card list understand declared axes
type: added
area: core
visibility: public
cards: [T-0103]
created: 2026-08-02
updated: 2026-08-02
---
Write-time validation only ever sees cards written after the axis was declared.
A repository that declares `context` over a hundred existing cards needs to be
told which of them carry a value that is not in the vocabulary, and which carry
none — the same service `area` already gets.

`doctor` now reports both:

- **error** `invalid-axis` — a value outside the declared vocabulary, naming the
  card and the accepted values. It is an error because it is a typo that
  silently matches nothing, which is the failure declaring an axis exists to
  prevent.
- **warning** `missing-axis` — an open card with no value for a declared axis.

Cards that are `done`, `discarded` or archived are exempt from the warning.
Declaring an axis must not turn a repository red, and a warning per finished
card floods just as badly in yellow: this repository would have emitted one for
each of its hundred-odd closed cards, and nobody classifies finished work
retroactively.

`card list --axis context=treasury` filters without going through `search`. A
comma list is an OR within one axis; a second `--axis` for another name is an
AND; and repeating the same name is refused, because only one value would
survive and the caller could not tell which.
