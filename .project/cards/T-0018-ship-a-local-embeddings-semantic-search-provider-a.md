---
id: T-0018
title: Ship a local embeddings semantic search provider as an optional package
status: backlog
type: feature
priority: medium
area: search
created: 2026-07-30
updated: 2026-07-30
---
## Goal

A first-party semantic search provider that never sends repository content to the network: local embeddings (transformers.js / ONNX on CPU, a small multilingual model such as `multilingual-e5-small`), shipped as an optional separate package (`@illodev/workfile-search-local`) so the core stays dependency-light.

## Notes

- Depends on the loading mechanism from [[T-0020]]: the package exports a `defineProjectIntegration`-compatible object the user adds to `integrations` in `project.config.mjs`.
- Embedding cache under the workspace cache dir keyed by record path + revision, so unchanged records are never re-embedded.
- Model download happens once, on first use, with a clear message; everything after that is offline.
- Decide package location: subdirectory with its own package.json vs separate repository.
