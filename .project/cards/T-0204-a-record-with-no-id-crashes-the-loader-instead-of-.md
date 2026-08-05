---
id: T-0204
title: A record with no id crashes the loader instead of being reported unreadable
status: review
type: bug
priority: high
area: core
tags: [protocol]
effort: S
scope: [packages/workfile/src/modules]
origin: [T-0199]
created: 2026-08-05
updated: 2026-08-05
---

Found while building a corpus for T-0199's missing-id refusal. A changelog
fragment or memory record whose frontmatter carries no `id:` line loads with
`id: undefined`, and the final sort in `loadChangelog` and `loadMemory` then
throws `TypeError: Cannot read properties of undefined (reading 'localeCompare')`.

Every other malformed record in the workspace is caught and reported under
`unreadable`, with the file named and the rest of the module still readable. This
one takes down the whole load, so a single hand-edited file makes `doctor`, the
server and every CLI command fail with a stack trace that names neither the file
nor the field.

The fix is the shape the loaders already use for every other failure: refuse the
record, name it, keep going. Worth checking whether the docs loader has the same
hole — it derives an id from the path when frontmatter carries none, so it may
not.

## Acceptance criteria

- [x] A record with no `id:` is reported under `unreadable` with its path, and the rest of its module still loads.
- [x] `doctor` reports it as an error rather than exiting on a stack trace.
- [x] The same input is checked against all four modules, and any that already handle it are left alone.
- [x] A test loads a workspace containing one, for each module that can hold one.

## Notes

- 2026-08-05 23:08Z illodev@local#bf4c5f67 — Finished the quarter the agent could not reach: cards had the same crash and src/modules/cards is another agent's scope, so loadCardDirectory now refuses a card with no id — or an empty one — where the same catch already routes every other malformed card to unreadable. Two tests added covering both shapes, and the whole loader answers instead of dying: doctor returns a report rather than a stack trace. Docs was already fine and is untouched, as the card guessed.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
