---
id: T-0031
title: Migrate repository scripts and tests from .mjs to TypeScript
status: done
type: task
priority: medium
area: infra
created: 2026-07-30
updated: 2026-07-30
scope: [scripts/, packages/workfile/scripts/, packages/workfile/test/, packages/search-local/test/, package.json, packages/workfile/package.json, packages/search-local/package.json, .github/workflows/release.yml, packages/workfile/tsconfig.strict.json]
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

## Activity

- 2026-07-30 23:21Z claude-fable-e341b469 · claimed
- 2026-07-30 23:21Z claude-fable-e341b469 · claimed
- 2026-07-30 23:26Z claude-fable-e341b469 · doing → done

## Notes

- 2026-07-30 23:26Z claude-fable-e341b469 — 45 files renamed with git mv (11 scripts, 33 tests, package-smoke + 2 support), every exact-name reference updated (package.json x3, release.yml, cross-imports, assertion strings, docs). tsconfig.strict.json now includes scripts and tests plus the repo-level scripts (rootDir ../.., allowImportingTsExtensions), so the ratchet holds them to only-improves: baseline re-recorded at 60 files / 647 errors, none new. Runtime evidence: full check green with all suites executing .ts under Node 22 type stripping, packaged smoke green, build:demo (build-demo-data.ts) green, sync-workspace-versions.ts --check green, build-plugin.ts assembled the plugin inside check. hooks.mjs, vite/commitlint/project configs and fixtures deliberately stay .mjs.
