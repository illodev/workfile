---
id: CHG-0071
title: The activity trail records moves, not commands
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0108]
---
A card's `## Activity` section recorded commands rather than moves.
`card transition ID review` on a card already in `review` appended
`review → review`; claiming a card you already hold appended a second
`claimed`; releasing a card nobody holds appended `released` again. On a
scratch card, the sequence an agent following the start-work workflow produces
left eight lines describing three events.

The trail exists to be read from a diff months later — five to fifteen lines
over a card's whole life. Lines that record nothing happening do not merely pad
it, they remove the reader's ability to tell a real move from a repeated
command.

All four writers now go through one gate, so the CLI, the HTTP routes, the MCP
tools and `card patch` inherit the rule together rather than one of them
remembering it. A real move still writes exactly one line, and a redundant
command still does its other work: re-claiming with a wider scope saves the
scope, it just does not claim the card twice.
