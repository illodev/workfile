---
id: CHG-0143
title: A record with no id is reported, not fatal
type: fixed
area: core
visibility: public
cards: [T-0204]
created: 2026-08-05
updated: 2026-08-05
---

A card, changelog fragment or memory record whose frontmatter had lost its `id:`
line — a hand edit, a bad merge — took down the whole load with
`TypeError: Cannot read properties of undefined (reading 'localeCompare')`, from
inside a sort, after every file had already been read. `doctor`, the server and
every command failed with a stack trace naming neither the file nor the field.

It now goes where every other malformed record already went: reported as
unreadable, with its path, and the rest of the workspace still loads.

Documents were never affected — they derive an id from their path.
