---
id: T-0018
title: Ship a local embeddings semantic search provider as an optional package
status: done
type: feature
priority: medium
area: search
created: 2026-07-30
updated: 2026-07-30
scope: [packages/search-local, pnpm-workspace.yaml, package.json, test]
---
## Goal

A first-party semantic search provider that never sends repository content to the network: local embeddings (transformers.js / ONNX on CPU, a small multilingual model such as `multilingual-e5-small`), shipped as an optional separate package (`@illodev/workfile-search-local`) so the core stays dependency-light.

## Notes

- Depends on the loading mechanism from [[T-0020]]: the package exports a `defineProjectIntegration`-compatible object the user adds to `integrations` in `project.config.mjs`.
- Embedding cache under the workspace cache dir keyed by record path + revision, so unchanged records are never re-embedded.
- Model download happens once, on first use, with a clear message; everything after that is offline.
- Decide package location: subdirectory with its own package.json vs separate repository.
- 2026-07-30 19:21Z claude-fable-e341b469 — Decisions (2026-07-30): the package lives in this repo as a pnpm workspace (pnpm-workspace.yaml + packages/search-local/; the root package stays publishable as-is). Scheduled for the next session. The loading mechanism it depends on (T-0020) is done: declare the integration via the named integrations export in project.config.mjs.
- 2026-07-30 19:31Z claude-fable-e341b469 — Implemented as pnpm workspace package packages/search-local (plain ESM, no build step; hand-written index.d.ts). localSearchIntegration() returns a defineProjectIntegration-compatible object; embedder injectable for tests; on-disk embedding cache keyed by content hash per model; dtype q8 default. Evidence: 160/160 tests (5 new, fake embedder, no network in CI); real model runs: cold 6.3s / warm 5ms; CLI end-to-end on a scratch workspace: Spanish query with zero lexical overlap returns the right card (mode hybrid, provider local-embeddings) while --mode lexical returns 0. Publication to npm tracked in T-0021. CHG-0007.
- 2026-07-30 20:12Z claude-fable-e341b469 — Publication gate cleared: 0.1.0 shipped manually (T-0021) and 0.1.2 shipped via the automated lockstep release. Package live under latest. Graduating review -> done.

## Activity

- 2026-07-30 19:21Z claude-fable-e341b469 · backlog → next
- 2026-07-30 19:25Z claude-fable-e341b469 · claimed
- 2026-07-30 19:31Z claude-fable-e341b469 · doing → review
- 2026-07-30 19:31Z claude-fable-e341b469 · released
- 2026-07-30 20:12Z claude-fable-e341b469 · review → done
- 2026-07-30 20:12Z claude-fable-e341b469 · released

