---
id: T-0204
title: A record with no id crashes the loader instead of being reported unreadable
status: backlog
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

- [ ] A record with no `id:` is reported under `unreadable` with its path, and the rest of its module still loads.
- [ ] `doctor` reports it as an error rather than exiting on a stack trace.
- [ ] The same input is checked against all four modules, and any that already handle it are left alone.
- [ ] A test loads a workspace containing one, for each module that can hold one.
