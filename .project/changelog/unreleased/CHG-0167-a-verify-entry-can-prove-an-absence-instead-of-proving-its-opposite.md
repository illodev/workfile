---
id: CHG-0167
title: A verify entry can prove an absence, instead of proving its opposite
type: added
area: core
visibility: public
cards: [T-0239]
created: 2026-09-03
updated: 2026-09-03
---

`card verify` marks a criterion when its command exits 0, and the commands a project can put
behind a binding are searches. **A search exits 0 when it finds.** So a criterion asserting an
absence — "the literal is gone", "no caller does this any more" — bound to one marked itself
*exactly backwards*: satisfied while the claim was false, and silently.

Measured before this: a criterion of that shape was bound to a search, the literal was present
in two files, and the gate answered `checked`. The criterion was then machine-owned, so it
could not even be unticked by hand — the binding had to be removed first. And there was no way
to invert it: the allowlist requires the command to start with a search, and it is spawned
without a shell, so there is no `!`, no `;` and no `test $?`.

`expect: absent` on a verify entry makes it satisfied when the command exits **non-zero**,
which is a search finding nothing. The polarity is decided in one place, and what gets ticked,
what the card's trail says and whether the run reports `ok` all read that rather than
re-deriving it from the exit code — reading the exit code is what made the trap. The trail
line says what was proved: "found nothing, as expected", not "passed".

`expect` is validated against a closed set on purpose. An unrecognised value would read as
"not absent" and quietly restore the inversion, which is the failure this removes.

A `doctor` rule that flags negative-sounding criteria bound to searches was considered and
dropped after measuring it: over a 2 373-card board only ten cards declare `verify` at all,
and a negation-marker regex over their criteria is mostly incidental matches — "what it does
not measure", "tools that cannot export". A regex cannot tell whether the negation is the
subject of the claim.
