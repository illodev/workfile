---
id: ADR-0003
title: A release ships only when a public fragment exists
status: accepted
created: 2026-07-31
updated: 2026-07-31
---
## Context

Every card on the board reached `done` and the only unreleased fragment was `CHG-0016` — the `.mjs` to TypeScript migration of repository scripts and tests (T-0031), marked `internal` because consumers never run either. Cutting 0.1.5 looked like the obvious next move, and the version bump, the tag pipeline and the surface resync were all ready to run.

The diff against `v0.1.4` said otherwise. Nothing under `src/`, `bin/` or `search-local` had moved. The only changes reaching a published tarball were `.mjs` to `.ts` filename references inside `docs/mcp.md`, `docs/ui.md` and one comment in `ui/src/api.ts`, plus a regenerated `ui/src/demo-data.json` that `prepare-bin` explicitly forbids shipping as the real UI. The public renderer drops `internal` fragments, so `## 0.1.5` would have rendered as a header with nothing under it.

## Decision

A version is cut only when at least one fragment in it renders publicly. An all-internal batch stays in `.project/changelog/unreleased/` and rides the next release that carries real user-facing content.

Before any bump, check `changelog list --unreleased --json` for a `visibility: public` fragment. `changelog preview` is not that check — it renders every unreleased fragment regardless of visibility, which is exactly what made 0.1.5 look substantive.

## Consequences

- Version numbers stay meaningful: consumers reading the CHANGELOG never meet an empty section, and `npm` never carries two functionally identical versions.
- npm publishes are irreversible and a version number can never be reused, so the cost of a wrong call here is permanent while the cost of waiting is zero.
- Internal fragments accumulate across releases by design. They are not lost — `changelog release` gathers every unreleased fragment, so the TypeScript migration will appear in the release record of whatever version ships next, just not in the public rendering.
- Repository hygiene work — test flake fixes, build migrations, lockfile overrides that touch no published path — is expected to close without triggering a release.
