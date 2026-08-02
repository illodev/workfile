---
id: CHG-0091
title: The landing footer no longer links a directory that does not exist
type: fixed
area: docs
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0110]
---
The footer's "docs" pointed at `github.com/illodev/workfile/tree/main/docs`,
which returns 404: this repository has no top-level `docs/`, and its documents
live under `.project/docs`.

The header nav had already settled what the word means on this page — the Docs
view of the live demo — so the footer says the same thing instead of a second,
broken answer.