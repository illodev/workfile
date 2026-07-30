---
id: T-0028
title: search-local saturates the machine embedding large corpora
status: backlog
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Context

First hybrid search over a real workspace embeds every candidate record on the spot.
`localSearchIntegration()` exposes no thread, batch or priority control (options are id,
model, dtype, cacheDir, passageChars, embedder), so ONNX takes every CPU core for as
long as the embedding pass lasts.

On Fube (~3,800 records, maxProviderRecords raised to 5000 because of T-0027) the pass
ran for many minutes at full load and **took down the user's graphical session twice**.
The trigger is any hybrid search: the CLI, the board UI, or the MCP server that Claude
Code loads in every session — none of them warn before paying the cost.

An aggravating detail: with an integration declared and `search.provider: null`, the
provider is auto-selected ("first one that offers it"), so merely having the package
wired makes every search a potential machine-killer. Fube's mitigation was an env-var
opt-in in the config (`WORKFILE_SEMANTIC=1`), defaulting to lexical.

## Proposed fix (in rough order of value)

- Expose `numThreads` (ONNX session option) and an inter-record yield/batch size in
  `localSearchIntegration` options, with a conservative default (e.g. half the cores).
- Make the first-pass cost visible: when more than N records need embedding, log a
  line with the count and an ETA instead of silently pegging the CPU.
- Consider an explicit `workfile search --warm` (or `index` subcommand) so the
  expensive pass is a deliberate act, resumable and abortable, rather than a side
  effect of the first innocent query.

## Acceptance

- [ ] A full-corpus first pass on a 4,000-record workspace leaves the machine usable
- [ ] The embedding pass reports progress and can be interrupted without corrupting the cache

## Notes

- 2026-07-30 — found on Fube right after wiring the provider; the workspace deactivated
  semantic search by default until this is fixed. Related: T-0027 (candidate slice).
