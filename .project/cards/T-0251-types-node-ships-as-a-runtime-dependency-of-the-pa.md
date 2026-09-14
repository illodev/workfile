---
id: T-0251
title: @types/node ships as a runtime dependency of the package
status: done
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
verified:
  at: "2026-09-14T19:22:17.702Z"
  method: manual
  commit: 1a49f8544a0dc388b2784bb19f8af027def2e3f5
  digest: "sha256:b33469d96d1f74536ef940b6dee0901705d5767ed77fed646c8529b13e13ec8c"
---

`packages/workfile/package.json` declares `"dependencies": { "@types/node": "26.5.0" }` — a type-definitions package, pinned to an exact version, as a **runtime** dependency. It has been there since 70588e7 (2026-07-31, "The workspace root turns private and delegates to the package"), and Dependabot has been bumping the pin ever since, so every release ships a newer `@types/node` to every consumer.

Measured in a consuming repository on 2026-09-11, moving `@illodev/workfile` from 0.10.0 to 0.13.0 with `pnpm add -D -w`: the lockfile diff re-keyed **79 entries** — every package in that tree whose peer-dependency chain carries `@types/node` — from the version the consumer had resolved to the one this package pins. None of them has anything to do with this package, and the consumer's own manifests had not asked for that major; this package did. `scripts/audit-consumer.ts` resolves exactly this `dependencies` map and its header says why it matters, and `docs/ui.md` calls zero runtime dependencies a published guarantee for the UI — the CLI's runtime imports nothing from `@types/node` either, because nothing can: it is types.

The fix is to move it to `devDependencies` (the compiler needs it; a consumer never does) and cut a patch. The Dependabot `runtime` group (T-0249) would then stop titling PRs for it as a runtime bump, which is also the honest reading.

## Acceptance criteria

- [x] `packages/workfile/package.json` has no `dependencies` entry for `@types/node`, and `pnpm run check:release` is green
- [x] `npm view @illodev/workfile@<patch> dependencies` answers nothing, verified against the published package
- [x] Moving a consuming repository from 0.13.0 to 0.13.1 changes no package version in its lockfile but this package's, the pinned `@types/node@26.5.0` leaving with its `undici-types`

Criterion 3 was written as «A consumer that moves to the patch sees only the package's own lockfile entry change, measured with `git diff --stat pnpm-lock.yaml` in a consuming repository». Its premise fails for the first move off 0.13.0, because that move also undoes what the pin did. Measured on 2026-09-14 on a scratch copy of a consuming repository's manifests and lockfile at HEAD (pnpm 11.4.0; a control `install --lockfile-only` changed 0 lines), then `pnpm add -D -w @illodev/workfile@0.13.1 --lockfile-only`: 349 changed lines, 79 of them removing the `@types/node@26.5.0` keys the pin had introduced (79 before, 0 after, none added). The package set differs only by `@illodev/workfile` 0.13.0 → 0.13.1 and the removal of `@types/node@26.5.0` and `undici-types@8.9.0`; eight snapshot variants collapse into the consumer's own `@types/node@25.9.5` ones, and the package's own entry resolves its optional peer to a version already in that tree. «Only its own entry» is the shape the next move after 0.13.1 should show.

## Activity

- 2026-09-14 18:49Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 18:58Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review
- 2026-09-14 19:22Z illodev@local#a112f2f3 via:undeclared/xhigh · review → done

## Notes

- 2026-09-14 18:51Z illodev@local#a112f2f3 via:undeclared/xhigh — Measured on 2026-09-14 before moving anything: the premise 'a consumer never does' is false for one consumer. 1 of the 88 published .d.ts files imports node types (server/http.d.ts, import("node:http") on createProjectServer and startProjectServer, re-exported from the main entry), and upgrade/update-check.d.ts names the NodeJS namespace. A consumer importing @illodev/workfile with the declarations copied outside any tree that holds @types/node: skipLibCheck false and no node types → 3 errors (TS2591 node:http twice, TS2503 NodeJS); skipLibCheck true → 0; with node types → 0. So the reason test/dependencies.test.ts gives holds for a strict TypeScript consumer without @types/node, and only for that one; the CLI and the runtime import nothing from it. Moving it to devDependencies alone would break that consumer; an optional peer dependency declares the need without installing or pinning anything.
- 2026-09-14 18:52Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided by the owner on 2026-09-14, after the measurement above: @types/node becomes an optional peer dependency (peerDependencies '*', peerDependenciesMeta optional) and a devDependency for the build. Nothing is installed or pinned into a consumer's tree, and the need a strict TypeScript consumer has is declared rather than imposed.
- 2026-09-14 18:58Z illodev@local#a112f2f3 via:undeclared/xhigh — Done on 2026-09-14 as decided: dependencies is empty, @types/node is an optional peer ('*', peerDependenciesMeta optional) and a devDependency pinned at 26.5.0 for the build. The workspace lockfile only moves the importer entry from dependencies to devDependencies (7 lines). test/dependencies.test.ts and design-system.test.ts pin the new shape; README and docs/ui.md say it. Found by the gate and fixed here: test/package-smoke.ts type-checked its pilot consumer with types ['node'] and had been getting node types for free from our dependencies, so it failed with TS2688 once they left — exactly the consumer the peer describes. The smoke now asserts the tarball brings no @types/node and installs it itself, pinned to our build version. pnpm run check:release green (exit 0): 532/532 and 10/10 tests, strict held, pnpm audit clean, consumer audit clean, package smoke passed. Criteria 2 and 3 need 0.13.1 published and a consumer moving to it.
- 2026-09-14 19:17Z illodev@local#a112f2f3 via:undeclared/xhigh — Criterion 2 verified on 2026-09-14 against the registry: npm view @illodev/workfile@0.13.1 answers no dependencies, peerDependencies { @types/node: '*' } and peerDependenciesMeta optional; npm install @illodev/workfile@0.13.1 into an empty consumer puts only @illodev/ under node_modules, and no @types/node. The release job's MCP Registry step failed on a propagation race after npm had accepted both packages; npm itself is complete.
- 2026-09-14 19:22Z illodev@local#a112f2f3 — manual verification: Verified against @illodev/workfile@0.13.1 as published on 2026-09-14. npm view answers no dependencies and an optional peer @types/node '*'; installed from the registry into an empty consumer it brings only @illodev/ and no @types/node. A consuming repository's lockfile (scratch copy at HEAD, pnpm 11.4.0) moved from 0.13.0 to 0.13.1 loses the 79 @types/node@26.5.0 keys the pin introduced, gains none, and changes no package version but this package's. pnpm run check:release was green on the commit that shipped.
