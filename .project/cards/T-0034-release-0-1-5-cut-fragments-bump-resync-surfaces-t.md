---
id: T-0034
title: "Release 0.1.5: cut fragments, bump, resync surfaces, tag"
status: deferred
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json, .claude, .project/agents, plugins/workfile, AGENTS.md, CLAUDE.md, .claude-plugin]
---
## Activity

- 2026-07-31 08:52Z claude-opus-4df73848 · claimed
- 2026-07-31 08:55Z claude-opus-4df73848 · released

## Notes

- 2026-07-31 08:55Z claude-opus-4df73848 — Held before cutting. The only unreleased fragment is CHG-0016 (internal): the public renderer drops it, so 0.1.5 would render as an empty section. Against v0.1.4 nothing under src/, bin/ or search-local moved; the publishable diff is .mjs -> .ts filename references in docs/mcp.md, docs/ui.md and one comment in ui/src/api.ts, plus a regenerated ui/src/demo-data.json that prepare-bin forbids shipping as the real UI. Alvaro chose to wait for user-facing content rather than burn a version number on a functionally identical package. Policy recorded as ADR-0003. Resume this card when a public fragment exists: changelog release VERSION, npm version, workfile upgrade + build:plugin, check:release, tag.
