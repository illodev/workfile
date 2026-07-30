---
id: T-0031
title: Migrate repository scripts and tests from .mjs to TypeScript
status: backlog
type: task
priority: medium
area: infra
created: 2026-07-30
updated: 2026-07-30
---
## Intent

`.mjs` is not mandatory: Node >= 22.18 strips types by default (`node --test test/*.test.ts`, `node scripts/foo.ts` run without a build step), and `engines` already demands `>=22` while CI pins 22/24. Migrating the 11 repo/package scripts and 40+ test files to TypeScript buys typing where bugs actually hide — path plumbing and fixture builders.

## Constraints

- Erasable syntax only (no enums, no namespaces, no parameter properties) — that is what the default stripping supports.
- `src/runtime/claude/hooks.mjs` stays `.mjs` on purpose: it must not import the package and prepare-bin copies it byte for byte.
- Do it AFTER the monorepo restructure (T-0030) so every path only changes once.

## Known exact-name references to update (located during T-0030)

- Root + package `package.json`: every `node ./scripts/*.mjs` invocation and the `node --test test/*.test.mjs` globs.
- `.github/workflows/release.yml`: `node ./scripts/sync-workspace-versions.mjs --check`.
- Test imports of scripts: `budgets/events/search.test.mjs` and `test/support/workspace.mjs` import `scripts/bench-workspace.mjs`; `versions.test.mjs` spawns `sync-workspace-versions.mjs`.
- Assertion strings that NAME files: `claude-surface.test.mjs` ("run `node scripts/build-plugin.mjs`"), messages inside `strict-ratchet.mjs` and `sync-workspace-versions.mjs`.
- Docs: `docs/mcp.md`, `docs/ui.md` name script/test files; README development section.
