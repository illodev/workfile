---
id: CHG-0141
title: done records how it was proved, and a card can only run what the project permits
type: added
area: core
visibility: public
cards: [T-0186, T-0187, T-0188, T-0203]
tags: [protocol, acceptance]
created: 2026-08-05
updated: 2026-08-05
---

The gate that stands behind `done` now records what happened rather than only
refusing what has not.

**A card can declare how it is proved, and only the runner may say so.**
`workfile card verify ID` runs a card's declared commands and checks exactly the
criteria bound to the entries that passed. `card ac --check` refuses a bound
criterion and names the command that owns it.

**`run` is an argument vector, not a shell line.** That is what makes the
project's allowlist mean something: the array a matcher compares is the one the
operating system receives, with no shell in between, so a prefix match is
element-wise equality rather than a guess about what a shell would do with the
rest of the line. `cards.verification.commands` is empty by default — a project
that declares nothing can run nothing — and a command outside it is refused when
the card is written **and** reported by `doctor`, because a card that arrives as
a file in a pull request never calls a mutation at all.

**Reaching `done` writes a `verified` block** — when, by what method, at which
commit, with what witnessed it, and a digest over the criteria and the commands.
`method` is `local`, `ci`, `manual` or `forced`, and `manual` is refused without
prose saying what was checked. Leaving `done` clears it.

**A project declares which methods each area accepts.** `done` reads that value
instead of relying on everyone remembering the rule, and says which methods the
area does accept when it refuses. A project that declares nothing accepts
everything, exactly as before.

What the allowlist is not: a boundary between a fork's pull request and your CI
runner. That boundary is elsewhere and is documented — see the security notes on
what a generated CI target already executes.
