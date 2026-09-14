---
id: T-0251
title: @types/node ships as a runtime dependency of the package
status: review
type: bug
priority: medium
area: infra
source: packages/workfile/package.json
tags: [consumer]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-11
updated: 2026-09-14
scope: [packages/workfile/package.json, pnpm-lock.yaml]
---

`packages/workfile/package.json` declares `"dependencies": { "@types/node": "26.5.0" }` — a type-definitions package, pinned to an exact version, as a **runtime** dependency. It has been there since 70588e7 (2026-07-31, "The workspace root turns private and delegates to the package"), and Dependabot has been bumping the pin ever since, so every release ships a newer `@types/node` to every consumer.

Measured in a consuming repository on 2026-09-11, moving `@illodev/workfile` from 0.10.0 to 0.13.0 with `pnpm add -D -w`: the lockfile diff re-keyed **79 entries** — every package in that tree whose peer-dependency chain carries `@types/node` — from the version the consumer had resolved to the one this package pins. None of them has anything to do with this package, and the consumer's own manifests had not asked for that major; this package did. `scripts/audit-consumer.ts` resolves exactly this `dependencies` map and its header says why it matters, and `docs/ui.md` calls zero runtime dependencies a published guarantee for the UI — the CLI's runtime imports nothing from `@types/node` either, because nothing can: it is types.

The fix is to move it to `devDependencies` (the compiler needs it; a consumer never does) and cut a patch. The Dependabot `runtime` group (T-0249) would then stop titling PRs for it as a runtime bump, which is also the honest reading.

## Acceptance criteria

- [x] `packages/workfile/package.json` has no `dependencies` entry for `@types/node`, and `pnpm run check:release` is green
- [ ] `npm view @illodev/workfile@<patch> dependencies` answers nothing, verified against the published package
- [ ] A consumer that moves to the patch sees only the package's own lockfile entry change, measured with `git diff --stat pnpm-lock.yaml` in a consuming repository

## Activity

- 2026-09-14 18:49Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 18:58Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 18:51Z illodev@local#a112f2f3 via:undeclared/xhigh — Measured on 2026-09-14 before moving anything: the premise 'a consumer never does' is false for one consumer. 1 of the 88 published .d.ts files imports node types (server/http.d.ts, import("node:http") on createProjectServer and startProjectServer, re-exported from the main entry), and upgrade/update-check.d.ts names the NodeJS namespace. A consumer importing @illodev/workfile with the declarations copied outside any tree that holds @types/node: skipLibCheck false and no node types → 3 errors (TS2591 node:http twice, TS2503 NodeJS); skipLibCheck true → 0; with node types → 0. So the reason test/dependencies.test.ts gives holds for a strict TypeScript consumer without @types/node, and only for that one; the CLI and the runtime import nothing from it. Moving it to devDependencies alone would break that consumer; an optional peer dependency declares the need without installing or pinning anything.
- 2026-09-14 18:52Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided by the owner on 2026-09-14, after the measurement above: @types/node becomes an optional peer dependency (peerDependencies '*', peerDependenciesMeta optional) and a devDependency for the build. Nothing is installed or pinned into a consumer's tree, and the need a strict TypeScript consumer has is declared rather than imposed.
- 2026-09-14 18:58Z illodev@local#a112f2f3 via:undeclared/xhigh — Done on 2026-09-14 as decided: dependencies is empty, @types/node is an optional peer ('*', peerDependenciesMeta optional) and a devDependency pinned at 26.5.0 for the build. The workspace lockfile only moves the importer entry from dependencies to devDependencies (7 lines). test/dependencies.test.ts and design-system.test.ts pin the new shape; README and docs/ui.md say it. Found by the gate and fixed here: test/package-smoke.ts type-checked its pilot consumer with types ['node'] and had been getting node types for free from our dependencies, so it failed with TS2688 once they left — exactly the consumer the peer describes. The smoke now asserts the tarball brings no @types/node and installs it itself, pinned to our build version. pnpm run check:release green (exit 0): 532/532 and 10/10 tests, strict held, pnpm audit clean, consumer audit clean, package smoke passed. Criteria 2 and 3 need 0.13.1 published and a consumer moving to it.
