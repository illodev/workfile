---
id: CHG-0150
title: The audit gates block at moderate, the floor Dependabot already alerts on
type: changed
area: infra
visibility: internal
cards: [T-0222]
decisions: [ADR-0021]
tags: [security, ci]
created: 2026-08-07
updated: 2026-08-07
---

Both supply-chain gates — `pnpm audit` on the workspace and the consumer-tree audit — now fail at `moderate` instead of `high`.

The old floor was the release gate's, which looked consistent and was not. Dependabot alerts at `moderate`, so a moderate advisory could never turn a build red: it went to the security tab and stayed there. GHSA-8j4g-w8fx-2239 in `hono` did exactly that for days before anyone acted on it.

It cost nothing to change — both trees audited clean at `low` at the time — and what it buys is that the next one fails a pull request rather than waiting to be noticed. What it will cost is real and worth expecting: an advisory published against a transitive devDependency now turns unrelated pull requests red until an override lands.
