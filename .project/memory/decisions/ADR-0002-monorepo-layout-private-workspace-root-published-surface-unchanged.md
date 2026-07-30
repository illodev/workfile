---
id: ADR-0002
title: "Monorepo layout: private workspace root, published surface unchanged"
status: accepted
created: 2026-07-30
updated: 2026-07-30
---
## Context

The core published from the repository root while `@illodev/workfile-search-local` lived under `packages/` — an asymmetry with a concrete cost: the root manifest was simultaneously the published package and the workspace shell, so an install-time `prepare` hook (needed for husky) would have shipped to every consumer, and `dependencies.test.mjs` rightly forbade it.

## Decision

The repository is a pnpm workspace with a **private root**. The root manifest keeps exactly three responsibilities: the `version` field every published package syncs to (lockstep via the `npm version` hook and `scripts/sync-workspace-versions.mjs`), workspace-wide tooling (husky, commitlint, playwright, the sharp override), and delegator scripts under the names CI and the docs already call. Everything publishable lives under `packages/`, each manifest with `publishConfig` and its own trusted-publisher registration; `release.yml` publishes only the `packages/*` loop.

Repository layout and npm packaging are independent decisions: the published surface stays one core package plus optional provider packages (SPEC 6.1). Provider packages are not a split of the core — they exist to keep heavy optional dependencies away from consumers who did not opt in.

## Consequences

- The pack file list was byte-identical across the move (175 files) — verified with `npm pack --dry-run` before and after.
- `dist/` stays a sibling of the package manifest, so every `package.json` climb inside `src/` and the strict-ratchet baseline survived unedited.
- The root can now run install-time tooling forever guarded by the extended dependencies test: no `packages/*` manifest may declare install hooks, and the root must stay `private: true`.
- The tag-time publish path changes shape; it is fully proven only at the next release tag.
