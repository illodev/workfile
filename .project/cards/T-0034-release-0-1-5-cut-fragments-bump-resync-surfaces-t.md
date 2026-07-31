---
id: T-0034
title: "Release 0.1.5: cut fragments, bump, resync surfaces, tag"
status: done
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json, .claude, .project/agents, plugins/workfile, AGENTS.md, CLAUDE.md, .claude-plugin, .project/generated]
---
## Activity

- 2026-07-31 08:52Z claude-opus-4df73848 · claimed
- 2026-07-31 08:55Z claude-opus-4df73848 · released
- 2026-07-31 09:24Z unknown · deferred → next
- 2026-07-31 09:24Z claude-opus-4df73848 · claimed
- 2026-07-31 09:28Z claude-opus-4df73848 · doing → done
- 2026-07-31 09:28Z claude-opus-4df73848 · released

## Notes

- 2026-07-31 08:55Z claude-opus-4df73848 — Held before cutting. The only unreleased fragment is CHG-0016 (internal): the public renderer drops it, so 0.1.5 would render as an empty section. Against v0.1.4 nothing under src/, bin/ or search-local moved; the publishable diff is .mjs -> .ts filename references in docs/mcp.md, docs/ui.md and one comment in ui/src/api.ts, plus a regenerated ui/src/demo-data.json that prepare-bin forbids shipping as the real UI. Alvaro chose to wait for user-facing content rather than burn a version number on a functionally identical package. Policy recorded as ADR-0003. Resume this card when a public fragment exists: changelog release VERSION, npm version, workfile upgrade + build:plugin, check:release, tag.
## Notes

- 2026-07-31 09:30Z claude-opus-4df73848 — Shipped. 0.1.5 is live on npm as `latest`, published end to end by the tag pipeline with no manual step touching the registry.

  **What unblocked it.** The hold recorded above was correct at the time: `CHG-0016` was the only unreleased fragment and it is `internal`, so the public section would have rendered empty. T-0035 and T-0036 supplied two `public` fragments, and ADR-0003's condition was met.

  **Sequence.** `changelog release 0.1.5` cut REL-0005 over three fragments; `changelog render --write` rendered two of them, correctly omitting the internal one. `npm version 0.1.5 --no-git-tag-version` bumped the root and both packages through the `version` hook — deliberately untagged, so the tag could land on the final commit instead of being moved afterwards as it was for 0.1.4. `workfile upgrade` resynced fifteen managed surfaces in one pass, `build:plugin` stamped the distributable, and `demo:data` regenerated the hosted snapshot (36 cards, 23 history, 6 memory records).

  **Gate.** `pnpm run check:release` locally: exit 0, 165 + 7 tests, 0 failures, `No known vulnerabilities found`, and the packaged smoke installed 0.1.5 into a clean consumer and exercised init, Work, Docs, History, Memory, MCP and UI. `sync-workspace-versions.ts --check` confirmed lockstep before tagging.

  **Runtime evidence.** Release run 30619966987 completed green — every step through `Publish to npm`. The registry answers `@illodev/workfile@0.1.5` and `@illodev/workfile-search-local@0.1.5`, both on `latest`.

  **Discovered gap.** There is no CLI path to title a release record: `changelog patch` rejects a REL id with `CHANGE_FRAGMENT_NOT_FOUND`, and `changelog release` takes no title. REL-0005 therefore reads "Version 0.1.5" like REL-0002 and REL-0003, while REL-0001 and REL-0004 carry hand-written descriptive titles. Left alone rather than hand-editing frontmatter, which the protocol reserves for emergencies. Filed as T-0037.
