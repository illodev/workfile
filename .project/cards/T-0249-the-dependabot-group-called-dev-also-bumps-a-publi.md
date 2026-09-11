---
id: T-0249
title: The Dependabot group called dev also bumps a published package's runtime deps
status: backlog
type: task
priority: low
area: infra
source: .github/dependabot.yml
tags: [dependabot, supply-chain]
scope: [.github/dependabot.yml]
raised: derived
created: 2026-09-11
updated: 2026-09-11
---

`.github/dependabot.yml` has one npm group, `dev`, with the pattern `*`, and a comment saying the published packages declare only `@types/node` and `@huggingface/transformers` — "everything else is a devDependency, so an update can break the build but never a consumer". Measured on 2026-09-11 while reviewing PR #45: `@illodev/workfile-search-local` declares `@huggingface/tokenizers` and `onnxruntime-web` as `dependencies`, and `@illodev/workfile` declares `@types/node`. The group titled *dev* therefore carried, in one PR with eight tooling bumps, a 0.x minor of `tokenizers` (0.1.3 → 0.2.0) and an `onnxruntime-web` bump whose release notes announce deprecations and whose npm releaser changed — both reaching every consumer of the search package, and both reviewed under a title that says they cannot.

The comment is stale (T-0221 replaced transformers with tokenizers + onnxruntime-web), and the grouping hides the one distinction a reviewer needs: does this bump ship to a consumer or not.

## Acceptance criteria

- [ ] The npm updates are split into two groups: one for the `dependencies` of the publishable packages, one for everything else, each named for what it reaches.
- [ ] The comment in `dependabot.yml` names the runtime dependencies as they are today, or points at the manifests instead of listing them.
- [ ] A bump in the runtime group is labelled or titled so that the review knows it reaches consumers before opening the diff.
