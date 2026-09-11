---
id: CHG-0172
title: The title cap is stated where a caller reads, not only in the refusal
type: changed
area: core
visibility: public
cards: [T-0243]
tags: [cli, schema, mcp]
created: 2026-09-11
updated: 2026-09-11
---

A card title is refused past 80 characters and a document title past 120, and until now those two numbers lived only in the refusal: not in `--help`, not in `docs/cli.md`, not in `workfile schema`. A consumer's agent lost seven of eleven creations in one session to a bound it could not have read first. `workfile schema --json` now reports `cards.limits.title` and `docs.limits.title`, the `--title` usage lines state the cap, the MCP `project_doc_create` input schema carries `maxLength` the way `project_card_create` already did, and `CARD_TITLE_TOO_LONG` and `DOC_TITLE_TOO_LONG` say how long the title was. Truncating with a warning was suggested and declined: the title is the line the board shows.
