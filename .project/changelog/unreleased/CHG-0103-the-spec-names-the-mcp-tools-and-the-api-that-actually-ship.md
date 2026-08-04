---
id: CHG-0103
title: The spec names the MCP tools and the API that actually ship
type: fixed
area: docs
visibility: public
cards: [T-0150]
created: 2026-08-04
updated: 2026-08-04
---

`docs/SPEC.md` is the normative document and two of its sections described
surfaces that never existed.

Section 23 catalogued fourteen MCP tools in a verb-first naming scheme —
`project_list_cards`, `project_run_doctor`. The server shipped noun-first in
0.1.0 and grew to thirty tools, so from the first release the spec named
thirteen tools no client could call, and none of the thirty it can. The section
no longer restates the catalogue: `docs/mcp.md` documents every shipped tool
and `workfile mcp inspect` prints the same list from the definitions the server
answers `tools/list` with. What section 23 keeps is the naming rule, which is
the part a second copy could not drift from.

Section 16.2 stated the programmatic API as two copyable blocks. `createProject`,
`migrateProject` and `buildIndex` are really `initializeProject`,
`applyLegacyMigration` and `buildProjectIndex`; the types `Card`,
`ManagedDocument` and `ChangeFragment` are `CardRecord`, `DocumentRecord` and
`ChangeRecord`. Nine further lines hung module repositories off the workspace —
`workspace.cards.list(query)`, `workspace.memory.create(kind, input)` — an
object shape that has never existed. `ProjectWorkspace` exposes no methods; the
real API is free functions taking a workspace.

Three checks in `test/documentation.test.ts` now resolve documented tool names
against `listMcpTools`, documented imports against the built package's exports
and declarations, and every `workspace.<module>.<method>()` span against a
loaded workspace. All three fail on the spec as it stood, naming each defect,
and cost about 30 ms.
