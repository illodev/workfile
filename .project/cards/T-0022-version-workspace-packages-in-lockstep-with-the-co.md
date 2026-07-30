---
id: T-0022
title: Version workspace packages in lockstep with the core and publish them on release
status: review
type: feature
priority: medium
area: infra
created: 2026-07-30
updated: 2026-07-30
scope: [scripts, package.json, packages, .github/workflows/release.yml, test]
---
## Activity

- 2026-07-30 19:59Z claude-fable-e341b469 · claimed
- 2026-07-30 20:01Z claude-fable-e341b469 · doing → review
- 2026-07-30 20:01Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 20:01Z claude-fable-e341b469 — scripts/sync-workspace-versions.mjs (sync + --check), root version lifecycle hook, release.yml verifies parity and publishes packages/* with the same dist-tag, test/versions.test.mjs enforces parity on every commit. search-local synced 0.1.0 -> 0.1.1 in-repo (npm keeps 0.1.0; next release publishes both). Evidence: 161/161 tests; live hook run in a scratch git repo - npm version 1.1.0 produced one bump commit containing root and workspace package.json at 1.1.0. Remaining before it can prove itself in CI: register the repo + release.yml as trusted publisher for @illodev/workfile-search-local on npmjs.com; then the 0.1.2 tag exercises the full pipeline.
