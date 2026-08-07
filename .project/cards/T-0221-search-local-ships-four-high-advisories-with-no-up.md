---
id: T-0221
title: search-local ships four high advisories with no upstream fix
status: done
type: bug
priority: high
area: infra
tags: [security]
effort: M
scope: [packages/search-local]
origin: [T-0148, ADR-0021]
created: 2026-08-07
updated: 2026-08-07
related: [ADR-0021, LRN-0032, CHG-0149]
verified:
  at: "2026-08-07T18:06:34.832Z"
  method: local
  commit: 4e8da0782fecb7e52899f7916be21ad7f3d4c775
  digest: "sha256:f8eb3b5d5eab96282b5f745d48b22b0dcf098fe8db5406588b5148a484b3644b"
---

Found while deciding the gate policy in T-0148, and the reason the consumer audit
ADR-0021 added is red.

`@illodev/workfile-search-local` declares `@huggingface/transformers: ^4.2.0` in
`dependencies`. Resolving that as a consumer does — no workspace, no overrides —
reports four packages at high, every one with no fix available:

- `sharp <0.35.0` — inherited libvips CVEs, GHSA-f88m-g3jw-g9cj
  (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591), reached
  through `@huggingface/transformers`, which pins `sharp: ^0.34.5`.
- `adm-zip <0.6.0` — GHSA-xcpc-8h2w-3j85, reached through `onnxruntime-node`,
  which pins `adm-zip: ^0.5.16`.
- `onnxruntime-node` and `@huggingface/transformers` themselves, for depending on
  those.

The repository has carried `pnpm.overrides` for `sharp` and `adm-zip` since T-0023
and T-0033, and the workspace audit has read clean ever since. Overrides do not
travel inside a published package, so they fixed this for this checkout and for
nobody who installed the package. `@huggingface/transformers@4.2.0` is the latest
release, so there is nothing to bump to.

Reproduce with `pnpm run audit:consumer`.

What makes this worth a card rather than a patch is that every route is a trade,
and the choice is not the gate's to make:

- **Drop the dependency.** `sharp` is image processing and `onnxruntime-node`
  carries `adm-zip` for archive extraction; this package does text embeddings
  only. If transformers can be replaced by something narrower — a text-only ONNX
  path, or `onnxruntime-web` — both advisories leave with it. Most work, best
  outcome.
- **Make the heavy dependency optional.** Move it to `optionalDependencies` or a
  peer the user installs deliberately, so the advisory is something a consumer
  opts into rather than something the package hands them. Cheap, and honest only
  if the package still does something useful without it.
- **Unpublish or park the package.** It is an opt-in extra; the core does lexical
  search without it and the README already teaches a guarded import. Blunt, and it
  reaches every existing consumer.
- **Accept and document.** Would need the allowlist ADR-0021 deliberately refused,
  so it means revisiting that decision rather than working around it.

## Acceptance criteria

- [x] `pnpm run audit:consumer` passes with no allowlist and no override.
- [x] The route taken is recorded, including what a consumer of the current version should do.
- [x] Semantic search still works, or the card records that the capability was withdrawn and why.

## Activity

- 2026-08-07 17:50Z illodev@local#42eb42f5 · claimed
- 2026-08-07 18:06Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 18:06Z illodev@local#42eb42f5 — Took route B: replaced @huggingface/transformers with onnxruntime-web and @huggingface/tokenizers, so nothing is asked of the consumer and the advisories leave rather than becoming opt-in.
What the pipeline was actually doing turned out to be four things: fetch tokenizer.json and the ONNX weights, tokenize, run the session, mean-pool over the attention mask and L2-normalize. About 130 lines to do it directly. Verified against the implementation it replaces on the same q8 weights and the same texts before committing to the route: per-vector cosine 0.9978, unit norms, identical ranking order. The residual is the WASM and native kernels disagreeing at quantized precision, not a difference in method.
Two corrections to what this card was filed with. optionalDependencies would not have worked at all — npm installs them by default, so the exposure would have stayed; the mechanism that removes a dependency from a consumer's tree is peerDependenciesMeta.optional, verified empirically both ways. And transformers 4.2.0 declares onnxruntime-node, onnxruntime-web and sharp in dependencies with no flag that omits them, so no configuration could have avoided this.
The sharp and adm-zip overrides were removed with the dependency: pnpm why finds neither package in the graph now, so those entries had become pins on packages that are not there. fast-uri and js-yaml stay, and they are the honest kind — devDependency-only, nothing shipped.
One cost that is real and is in CHG-0149: the model cache moved from the transformers.js cache to ~/.cache/workfile/models, so the first search after upgrading re-downloads about 135 MB once. Existing embedding caches stay valid, because they are keyed by model and content and the model is unchanged. The new modelDir option relocates it, and pointing model at a directory holding tokenizer.json and the ONNX file skips the download entirely — this now runs with no network at all, which it could not before.
The tests deserve a note. All seven pre-existing tests inject embedder, so none of them touched the new code; three were added for the parts that need no model, and the pooling one was mutation-checked. That check taught something worth keeping: after L2 normalization the pooling divisor cannot matter, because dividing by the padded width is a positive scalar and normalization cancels it. My first version of that test claimed the opposite in a comment, the mutation passed, and the comment was the thing that was wrong. What the test now pins is the mask — summing padded positions moves the direction about 45 degrees on its own data, and removing the guard fails both new tests. LRN-0032.
- 2026-08-07 18:06Z illodev@local#42eb42f5 — local verification: pnpm run audit:consumer: consumer tree clean at high and above, nothing below the threshold either, with no allowlist and the sharp/adm-zip overrides deleted. pnpm audit --audit-level=high exits 0. pnpm why sharp and pnpm why adm-zip both find nothing in the graph. pnpm run check green: 465 + 10 tests pass (3 new in search-local), strictNullChecks held at 488. pnpm run smoke:package passes against the packed tarball. Real model path driven end to end through the published entry point against Xenova/multilingual-e5-small q8: cold run 45.8s including the 135MB download, warm run 2.2-3.1s, ranking correct and byte-identical across runs. Faithfulness measured against the transformers.js implementation on the same texts: per-vector cosine 0.9978 on all three vectors, unit norms both sides, same ranking order. Pooling test mutation-checked: removing the attention-mask guard fails both new tests, restoring it returns 10/10. The workfile guarded-import test still passes.
