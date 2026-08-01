---
id: T-0081
title: Search discards its own postings, and four mutators read the corpus twice
status: backlog
type: task
priority: medium
area: search
created: 2026-08-01
updated: 2026-08-01
---

Two independent cheap wins on the hottest paths.

## Postings discarded

`records/index.ts:610` attaches the postings index to the records **array** via `Object.defineProperty`. `search.ts` then runs `records.filter(...)` unconditionally before searching — a fresh array, so the postings are gone. The CLI, the HTTP list routes and MCP `project_search` all take this path.

`workfile search` has an inverted index and has never used it. Measured in the landscape study at L scale: direct 2.1 ms vs hybrid 96.4 ms; a query matching nothing still costs ~94 ms.

Fix: skip the filter when no kinds are requested — `searchProjectRecords` already applies `kinds` internally after `candidateIndices`.

## Corpus loaded twice

`mutateCard` accepts a `snapshot` option (`mutations.ts:131/146`) and its own comment explains why: "Reloading it per card turned a bulk edit of twenty cards into twenty full directory reads."

`claimCard` (:341), `releaseCard` (:425), `transitionCard` (:487) and `archiveCard` (:606) each call `loadCards`, then call `mutateCard` without passing it. Four one-line changes for a free 2x on the four most-used mutations at every scale.

Gate both with a body-read-counting test in the style `test/budgets.test.ts` established.
