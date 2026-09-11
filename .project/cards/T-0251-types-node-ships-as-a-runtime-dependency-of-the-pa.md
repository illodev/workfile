---
id: T-0251
title: @types/node ships as a runtime dependency of the package
status: backlog
type: bug
priority: medium
area: infra
source: packages/workfile/package.json
tags: [consumer]
raised: derived
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
created: 2026-09-11
updated: 2026-09-11
---

`packages/workfile/package.json` declares `"dependencies": { "@types/node": "26.5.0" }` — a type-definitions package, pinned to an exact version, as a **runtime** dependency. It has been there since 70588e7 (2026-07-31, "The workspace root turns private and delegates to the package"), and Dependabot has been bumping the pin ever since, so every release ships a newer `@types/node` to every consumer.

Measured in a consuming repository on 2026-09-11, moving `@illodev/workfile` from 0.10.0 to 0.13.0 with `pnpm add -D -w`: the lockfile diff re-keyed **79 entries** — every package in that tree whose peer-dependency chain carries `@types/node` — from the version the consumer had resolved to the one this package pins. None of them has anything to do with this package, and the consumer's own manifests had not asked for that major; this package did. `scripts/audit-consumer.ts` resolves exactly this `dependencies` map and its header says why it matters, and `docs/ui.md` calls zero runtime dependencies a published guarantee for the UI — the CLI's runtime imports nothing from `@types/node` either, because nothing can: it is types.

The fix is to move it to `devDependencies` (the compiler needs it; a consumer never does) and cut a patch. The Dependabot `runtime` group (T-0249) would then stop titling PRs for it as a runtime bump, which is also the honest reading.

## Acceptance criteria

- [ ] `packages/workfile/package.json` has no `dependencies` entry for `@types/node`, and `pnpm run check:release` is green
- [ ] `npm view @illodev/workfile@<patch> dependencies` answers nothing, verified against the published package
- [ ] A consumer that moves to the patch sees only the package's own lockfile entry change, measured with `git diff --stat pnpm-lock.yaml` in a consuming repository
