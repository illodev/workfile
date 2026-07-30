---
id: T-0030
title: Restructure the repository into a pnpm monorepo with commit hooks
status: doing
type: task
priority: high
area: infra
created: 2026-07-30
updated: 2026-07-30
claimed_by: claude-fable-e341b469
claimed_at: "2026-07-30T22:25:19.902Z"
scope: [package.json, packages/, scripts/, .github/, .husky/, commitlint.config.mjs, project.config.mjs, vercel.json, .gitignore, README.md]
---
## Intent

The repository publishes `@illodev/workfile` from the root while `@illodev/workfile-search-local` lives under `packages/` — an asymmetry that complicates organisation and blocks install-time tooling (a root `prepare` hook would today ship to every consumer). Restructure into a full pnpm monorepo: the core moves to `packages/workfile` (npm name unchanged), the root becomes a private workspace shell that keeps `version` as the lockstep source of truth. Add husky + commitlint (house narrative style, not Conventional Commits) and `workfile doctor --severity error` as the pre-commit gate — the protocol guarding its own repository.

## Decisions (user-approved)

- Layout: `packages/workfile` holds src/, bin/, ui/, test/, docs/, tsconfigs, strict baseline, vite config and its core-coupled scripts. Repo-level `scripts/` keeps sync-workspace-versions, build-plugin, screenshots, screenshot-workspace, demo-video. `plugins/`, `.claude-plugin/`, `site/`, `design/`, `.project/` stay at root.
- commitlint: custom rules — header ≤ 100 chars, opens with uppercase or digit (version-bump commits like `0.1.4`), no trailing period, blank line before body. No `extends`.
- Hooks: commit-msg → commitlint; pre-commit → doctor (loud skip when dist is missing, never auto-build). No pre-push.
- The `.mjs → .ts` script/test migration is deliberately out of scope; carded separately.

## Acceptance criteria

- Published surface parity: `npm pack --dry-run` file list from `packages/workfile` matches the pre-move root baseline (175 files) plus the package README and LICENSE.
- `pnpm run check`, `build:demo`, `smoke:package`, `build:plugin` idempotence, and doctor all green from the new layout; strict baseline byte-identical.
- `release.yml` publishes only `packages/*/` (root is private); `ci.yml` needs zero changes because root scripts delegate.
- commitlint accepts real history samples ("Upgrade: …", "0.1.2", "README: …", "T-0022 done: …") and rejects lowercase openers, >100-char headers and body without leading blank.

## Activity

- 2026-07-30 22:25Z claude-fable-e341b469 · claimed
- 2026-07-30 22:25Z claude-fable-e341b469 · claimed

