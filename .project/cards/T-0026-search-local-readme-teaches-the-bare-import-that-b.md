---
id: T-0026
title: search-local README teaches the bare import that breaks the generated CI job
status: backlog
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
