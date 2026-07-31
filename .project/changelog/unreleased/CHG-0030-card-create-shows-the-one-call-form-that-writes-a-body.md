---
id: CHG-0030
title: card create shows the one-call form that writes a body
type: changed
area: docs
visibility: public
cards: [T-0056]
created: 2026-07-31
updated: 2026-07-31
---

`card create --json-input FILE` has always taken the whole record — title, body,
parent, source, tags — in a single call. It appeared exactly once in the
documentation, in `SPEC.md`, while `--help`, the CLI reference and the README
all showed the four-flag form and stopped.

An agent reading those built every card in three calls and pushed bodies through
shell heredocs, where backticks and `$` corrupted content without a word. All
three surfaces now name the one-call form, and the CLI reference says plainly
that a JSON file is what to reach for when the card has a body.
