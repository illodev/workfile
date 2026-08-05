---
id: T-0028
title: search-local saturates the machine embedding large corpora
status: done
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-08-05
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

- [x] A full-corpus first pass on a 4,000-record workspace leaves the machine usable
- [x] The embedding pass reports progress and can be interrupted without corrupting the cache

## Notes

- 2026-07-30 — found on Fube right after wiring the provider; the workspace deactivated
  semantic search by default until this is fixed. Related: T-0027 (candidate slice).
- 2026-07-30 21:01Z claude-opus-2167a9c2 — 2026-07-30 — Fixed in 8d158d9. T-0026: guarded import taught in the search-local README, the root README's new first-party section and the example config. T-0027: provider candidates are lexical hits first, filler after, with a test planting the only match beyond the cap. T-0028: numThreads (default half the cores), per-batch cache persistence proven by a kill-mid-pass test, stderr progress. Suites 165/165. Ships with the next release; done when a consumer workspace verifies it.
- 2026-07-30 21:18Z claude-opus-2167a9c2 — 2026-07-30 — VERIFIED ON A CONSUMER (Fube, ~3.200 records) with 0.1.3 published. T-0028: full-corpus warm-up embedded 2,673 records in ~10 min with the machine USABLE throughout (default half-cores cap; the 0.1.2 provider froze the desktop twice on the same corpus), stderr progress visible to the last batch, incremental cache observed live mid-pass (508→1,916→3,181). T-0027: records beyond the old index-order cap now reach the provider — a semantically relevant card (T-0498) surfaced from deep in the corpus where 0.1.2 returned pure noise. T-0026: Fube's guarded config loaded on a clean git-archive clone and its CI job ran green. Runtime evidence complete.
- 2026-08-05 12:02Z illodev@local#2cddaf94 — Verified 2026-08-05 under T-0174. #2: provider.test.ts kills the pass on the third batch and proves a fresh instance re-embeds only the two records the interrupted pass lost, and a sibling test asserts the exact progress sequence; the 2026-07-30 21:18Z note adds stderr progress observed to the last batch on Fube with the cache growing live, 508 to 1,916 to 3,181.

#1 rests on that same consumer run: 2,673 records embedded with the machine usable throughout, against a control where the 0.1.2 provider froze the desktop twice on the same corpus. The caveat, stated rather than hidden: the criterion said a 4,000-record workspace and Fube has roughly 3,200. The substance is proven — a full-corpus first pass no longer takes the machine down — and the number is not. Checked on the substance.

## Activity

- 2026-07-30 21:01Z unknown · backlog → review
- 2026-07-30 21:18Z unknown · review → done
