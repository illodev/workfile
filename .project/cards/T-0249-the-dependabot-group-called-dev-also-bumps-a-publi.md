---
id: T-0249
title: The Dependabot group called dev also bumps a published package's runtime deps
status: review
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

- [x] The npm updates are split into two groups: one for the `dependencies` of the publishable packages, one for everything else, each named for what it reaches.
- [x] The comment in `dependabot.yml` names the runtime dependencies as they are today, or points at the manifests instead of listing them.
- [x] A bump in the runtime group is labelled or titled so that the review knows it reaches consumers before opening the diff.

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: two npm groups — runtime, naming by pattern the dependencies of the published packages and labelled so the review knows it reaches consumers, and tooling for everything else — with the comment pointing at the manifests instead of listing them.
- 2026-09-11 17:35Z illodev@local#597ecdc9 — Split by dependency-type rather than by name: runtime is whatever packages/*/package.json declares under dependencies (today @types/node, @huggingface/tokenizers, onnxruntime-web) and tooling is development, so the split cannot go stale the way the old comment did. Dependabot titles a grouped PR after its group, so a runtime PR reads 'Bump the runtime group…' before the diff is open — criterion 3 by the group name. The comment points at the manifests and names the incident that motivated the split. Evidence is the first grouped PR Dependabot opens on the monthly schedule; until then this is configuration validated as YAML.

## Activity

- 2026-09-11 17:35Z illodev@local#597ecdc9 · released
