---
id: T-0150
title: SPEC describes an MCP surface and a public API that do not exist
status: done
type: bug
priority: high
area: docs
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/docs/SPEC.md, packages/workfile/test/documentation.test.ts]
---

SPEC.md is the normative document. Two of its sections describe surfaces that
shipped differently and were never reconciled, and nothing reads either one.

## 23 names 13 MCP tools that do not exist

SPEC:1689-1704 lists "Recommended tools" in a verb-first naming scheme. The
server ships 30 tools in a noun-first scheme. Verified against `workfile mcp
inspect --json` today:

| SPEC 23 | shipped |
|---|---|
| `project_get_workspace` | `project_workspace` |
| `project_list_cards` | `project_card_list` |
| `project_get_card` | folded into `project_get_record` |
| `project_create_card` | `project_card_create` |
| `project_claim_card` | `project_card_claim` |
| `project_transition_card` | `project_card_transition` |
| `project_release_card` | `project_card_release` |
| `project_list_docs` | `project_doc_list` |
| `project_get_document` | folded into `project_get_record` |
| `project_create_changelog_fragment` | `project_changelog_add` |
| `project_list_memory` | `project_memory_list` |
| `project_create_memory` | `project_memory_add` |
| `project_run_doctor` | `project_doctor` |

Only `project_search` survives unchanged. SPEC names 0 of the 30 shipped tools.
`docs/mcp.md` names all 30 and has no phantom — it is the document that is
right, which is why this is a SPEC defect and not an MCP defect.

## 16.2 describes a public API that does not exist

SPEC:1119-1153, checked against `dist/src/index.js` (228 runtime exports) and
`dist/src/types.d.ts`:

- value exports absent: `createProject`, `migrateProject`, `buildIndex`. The
  real names are `initializeProject`, `applyLegacyMigration` /
  `applySchemaMigration`, `buildProjectIndex`.
- types absent: `Card`, `ManagedDocument`, `ChangeFragment`. The real names are
  `CardRecord`, `DocumentRecord`, `ChangeRecord`.
- the whole second block is fiction. `workspace.cards.list(query)`,
  `workspace.docs.search(query)`, `workspace.memory.create(kind, input)` and
  `workspace.changelog.createFragment(input)` describe module repositories
  hanging off `ProjectWorkspace`. That interface (`src/types.ts`) carries
  `root`, `configPath`, `config`, `version`, `paths`, `schema`, `readOnly`,
  `packageManager`, `cli` and `integrations` — and no repositories at all. The
  real API is free functions taking a workspace: `loadCards(workspace)`,
  `createCard(workspace, input)`.

`test/types/public-api.ts` typechecks the API that exists; nothing checks the
API a reader is told exists.

## Why the existing test misses both

`test/documentation.test.ts` opens SPEC.md four times, and T-0088 added the
check that resolves every documented command path against the dispatcher. Both
sections here are below its regex: `INVOCATION` matches `workfile <word>`, and
neither a `project_*` identifier nor a TypeScript import is an invocation.

## The fix

Two checks in `documentation.test.ts`, measured against behaviour rather than
against a second list — the same shape T-0088 used:

1. every `project_[a-z_]+` identifier in the documented set resolves against
   `listMcpTools()`, which is what the server answers `tools/list` with.
2. every identifier inside a fenced ```ts block that imports from
   `@illodev/workfile` resolves against the runtime export names, and every
   `workspace.<module>.<method>()` span resolves against `ProjectWorkspace`.

Check 2 earns its keep only if it is narrow. Do not try to typecheck fenced
blocks: they are fragments, most will not compile, and a harness that reports
40 false positives gets deleted. Name resolution is the honest signal.

Then rewrite 23 to point at `docs/mcp.md` rather than restate 30 tool names
SPEC would only drift from again, and correct 16.2 to the API that exists.

## Acceptance criteria

- [x] A test resolves documented MCP tool names against `listMcpTools()`
- [x] It fails on SPEC as it stands, naming all 13
- [x] A test resolves documented public-API identifiers against the real exports
- [x] It fails on SPEC as it stands, naming the 3 exports and the 3 types
- [x] 23 and 16.2 are corrected and both tests pass
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 19:22Z illodev@local#cfe281b4 · claimed
- 2026-08-04 19:28Z illodev@local#cfe281b4 · doing → review
- 2026-08-04 20:32Z illodev@local#cfe281b4 · review → done

## Notes

- 2026-08-04 19:28Z illodev@local#cfe281b4 — Runtime evidence, all local. The three checks fail on SPEC as it stood and name every defect: 13 tool names at SPEC:1690-1703, the 3 exports at :1120 and the 3 types at :1129, the 9 workspace lines at :1144-1152. After the corrections, documentation.test.ts is 10/10 at 89 ms for the three new ones. pnpm run check exit 0; suite 272/272 (was 269); strict ratchet held at 554 across 56 files, none new; doctor 0/0.

Two things the card did not anticipate. The drift is older than it looked: git dates both defects to v0.1.0, so the spec named tools no client could call from the first tagged release, not for six as I first wrote — corrected in both the section and the test comment before committing to it. And section 23 keeps the naming rule rather than a corrected catalogue, because a second copy of thirty tools is only right until one of them moves; docs/mcp.md and workfile mcp inspect are the two that cannot disagree with the server.

Not yet verified on Windows. The three checks read files and one loads a temp workspace, which is the class T-0140 and T-0142 came from, so this stays in review until CI is green on both platforms. Uncommitted: the working tree carries the SPEC edit, the tests and CHG-0103.
- 2026-08-04 20:29Z illodev@local#cfe281b4 — CI green on all eight matrix jobs at 86be3c0 (PR #14, run 30947778231): ubuntu, macos and windows on node 22 and 24, plus smoke, codeql and doctor. Windows 22 in 1m59s, Windows 24 in 3m42s. That closes the platform gap every note above flagged — the checks resolve paths through new URL against a document base, and Windows checkouts are where that has broken before.

Staying in review rather than done: the protocol reads review as 'awaiting verification, deployment or approval', and this is awaiting approval. The runtime evidence exists; the merge does not.
