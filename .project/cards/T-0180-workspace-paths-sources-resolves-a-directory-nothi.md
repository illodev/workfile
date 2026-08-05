---
id: T-0180
title: workspace.paths.sources resolves a directory nothing creates or reads
status: backlog
type: chore
priority: low
area: core
created: 2026-08-05
updated: 2026-08-05
---

`loadWorkspace` resolves `storage.sources` to `.project/sources` and puts it
on `workspace.paths`. Nothing else in the package mentions it: no module reads
it, no command writes to it, and since [[T-0173]] `init` no longer creates it
— the generated config indexes `.project/specs`, so that is the directory that
now exists.

So the workspace object carries a resolved path to a directory that will not be
there, and `paths` is otherwise a set of places records actually live. A reader
reasonably concludes something uses it.

The spec lists `sources/` in the `.project/` layout alongside `specs/`, both
optional, so removing the path is a spec question rather than a cleanup. Either
the directory has a purpose that was never built, or the entry goes.

Low because nothing is broken by it. Recorded because the next person to read
`load-workspace.ts` will spend the same ten minutes finding out it is dead.

## Acceptance criteria

- [ ] Either `storage.sources` has a documented purpose or it is removed
- [ ] The spec layout and the workspace paths agree about which directories exist
