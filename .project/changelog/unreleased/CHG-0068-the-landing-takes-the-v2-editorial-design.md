---
id: CHG-0068
title: The landing takes the v2 editorial design
type: changed
area: docs
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
`site/index.html` replaces the centered card-grid landing with the v2 editorial layout: numbered sections against a 180px margin label, a hairline rule system instead of boxes, monospace furniture, and a hero that puts a real card file next to the pitch.

Ported out of the Claude Design artifact rather than copied. The DC runtime, the `{{ }}` bindings, the `style-hover` attributes and the theme prop all became plain CSS, `prefers-color-scheme` and nine lines of vanilla JS, because the landing deploys as static files.

The agent-session terminal now shows commands the CLI actually has. The artifact invented `workfile claim --paths` and `workfile done --evidence`; the page ships `card claim --scope`, `card transition`, and the real `CARD_ACCEPTANCE_UNMET` refusal that a card with unproven criteria gets.
