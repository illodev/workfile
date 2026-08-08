---
id: CHG-0149
title: search-local runs on onnxruntime-web, clearing four high advisories it used to ship
type: security
area: search
visibility: public
cards: [T-0221]
decisions: [ADR-0021]
tags: [security, dependencies]
created: 2026-08-07
updated: 2026-08-07
---

`@illodev/workfile-search-local` no longer depends on
`@huggingface/transformers`. It now reaches the same ONNX weights through
`onnxruntime-web` and `@huggingface/tokenizers`.

**Why this matters if you installed it.** `@huggingface/transformers` depends on
`sharp` and `onnxruntime-node` — image processing and an archive extractor this
package never used — and both carry high-severity advisories with no upstream
fix: the libvips CVEs in `sharp <0.35.0` (GHSA-f88m-g3jw-g9cj) and
GHSA-xcpc-8h2w-3j85 in `adm-zip <0.6.0`, which arrives under
`onnxruntime-node`. Installing 0.8.1 or earlier put all of them in your tree.
This repository's audit had read clean the whole time, because `pnpm.overrides`
rewrote resolution here and overrides do not travel inside a published package.
Auditing the tree a consumer resolves is now its own gate.

**What you should do.** Upgrade, then reinstall so the old transitive tree is
dropped. Nothing in the public API changed.

**One cost, and it is not free.** The model cache moved from the transformers.js
cache to `~/.cache/workfile/models`, so the first search after upgrading
re-downloads the model — about 135 MB of tokenizer and weights, once. The new
`modelDir` option relocates it, and pointing `model` at a directory that holds
`tokenizer.json` and the ONNX file skips the download entirely, which is how this
now runs with no network at all.

Embeddings are computed through the WASM execution provider rather than the
native binding. Verified against the implementation it replaces on the same q8
weights: per-vector cosine 0.9978, unit norms, identical ranking order. Existing
embedding caches stay valid — they are keyed by model and content, and the model
is unchanged.
