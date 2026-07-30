---
id: T-0026
title: search-local README teaches the bare import that breaks the generated CI job
status: done
type: bug
priority: low
area: docs
created: 2026-07-30
updated: 2026-07-30
---
## Context

`packages/search-local/README.md` (and the commented example in
`project.config.example.mjs`) teach wiring the provider like this:

```js
// project.config.mjs
import { localSearchIntegration } from "@illodev/workfile-search-local";
export const integrations = [localSearchIntegration()];
```

That is the exact defect class fixed for `defineProject` in 8fbd1d2 (T-2026 in the Fube
workspace): a bare specifier the config resolves from the consumer's `node_modules`, while
the generated CI job runs `npx --yes @illodev/workfile@X doctor` on a clean clone with no
install. Follow the README, wire the CI template, and the job dies loading the config:

```
Cannot find package '@illodev/workfile-search-local' imported from project.config.mjs
```

Unlike T-2026 there is no way to drop the import entirely — the integration carries a
function, which is precisely why it lives in a named export. The fix is to teach the
guarded form.

## What Fube deployed (works, verified against a clean `git archive` clone)

```js
export const integrations = await (async () => {
    try {
        const { localSearchIntegration } = await import(
            "@illodev/workfile-search-local"
        );
        return [localSearchIntegration()];
    } catch {
        return []; // no node_modules (CI via npx): search degrades to lexical
    }
})();
```

Top-level await is valid in `.mjs` and the loader's `await import(url)` resolves it.

## Acceptance

- [ ] README and example teach the guarded form, with the one-line why
- [ ] A test loads a config using the guarded form from a directory where the package
      does not resolve and asserts integrations === []

## Notes

- 2026-07-30 — found while wiring the provider into Fube minutes after fixing the same
  trap for `defineProject`. Same family as T-2026/8fbd1d2.
- 2026-07-30 21:01Z claude-opus-2167a9c2 — 2026-07-30 — Fixed in 8d158d9. T-0026: guarded import taught in the search-local README, the root README's new first-party section and the example config. T-0027: provider candidates are lexical hits first, filler after, with a test planting the only match beyond the cap. T-0028: numThreads (default half the cores), per-batch cache persistence proven by a kill-mid-pass test, stderr progress. Suites 165/165. Ships with the next release; done when a consumer workspace verifies it.
- 2026-07-30 21:18Z claude-opus-2167a9c2 — 2026-07-30 — VERIFIED ON A CONSUMER (Fube, ~3.200 records) with 0.1.3 published. T-0028: full-corpus warm-up embedded 2,673 records in ~10 min with the machine USABLE throughout (default half-cores cap; the 0.1.2 provider froze the desktop twice on the same corpus), stderr progress visible to the last batch, incremental cache observed live mid-pass (508→1,916→3,181). T-0027: records beyond the old index-order cap now reach the provider — a semantically relevant card (T-0498) surfaced from deep in the corpus where 0.1.2 returned pure noise. T-0026: Fube's guarded config loaded on a clean git-archive clone and its CI job ran green. Runtime evidence complete.

## Activity

- 2026-07-30 21:01Z unknown · backlog → review
- 2026-07-30 21:18Z unknown · review → done

