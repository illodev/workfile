---
id: ADR-0015
title: Archiving a card is a trail milestone, and it names who filed it
status: accepted
created: 2026-08-05
updated: 2026-08-05
---

[[T-0168]] set out to make every HTTP mutation name its actor and listed
`archive` among the routes to fix. Checking it found no argument to pass one
to: `archiveCard` set `status` to the status the card already had, so no
transition line was written and there was nowhere for an actor to appear. The
missing argument was not the finding. The asymmetry it exposed was — the trail
recorded a card coming *out* of the archive and nothing about it going in, on
the one mutation that takes a card off the board entirely.

**Archiving appends one `archived` milestone, and every surface — CLI, HTTP,
MCP — resolves an actor for it.**

The argument against, which the card stated fairly: archiving is reversible,
`reopen` already records, and the file move shows up in git. The first two are
true and neither is a reason — a reversible move is still a move, and recording
only the reversal is the asymmetry, not a mitigation of it. The third is the
one worth answering: git does record it, and the trail exists precisely so that
"who, and when" is answerable without reading git across a rename. Archiving is
the one event that always renames, so it is the one case where `git log` needs
`--follow` to answer at all.

It is written as `archived`, not `done → done`, for the reason
`transitionCard` already writes `unarchived`: the move is the milestone even
though the status reads the same on both sides, and spelling it as a status
change would record a transition that did not happen. Archiving an
already-archived card returns before the mutation, so there is no second line
claiming a second move — the same "a command that moved nothing appends
nothing" rule the rest of the trail follows.

The actor is resolved, never demanded — the same rung `reopen` uses. `--actor`
is accepted for the cases it is accepted elsewhere, claiming on someone's
behalf and CI acting as a bot, and a hand-typed one arms the two traps the CLI
already warns about: the edit guard asking about your own claim, and `release`
refusing until you reproduce the string.
