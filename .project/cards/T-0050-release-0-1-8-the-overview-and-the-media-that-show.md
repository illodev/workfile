---
id: T-0050
title: "Release 0.1.8: the Overview, and the media that shows it"
status: doing
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
claimed_by: claude-opus-7c645bf5
claimed_at: "2026-07-31T18:27:52.065Z"
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json]
---
## Activity

- 2026-07-31 18:27Z claude-opus-7c645bf5 · claimed

## Notes

- 2026-07-31 18:32Z claude-opus-7c645bf5 — 0.1.8 prepared locally and stopped short of publication on purpose. REL-0008 consumes CHG-0023 for a single public line; CHANGELOG.md rendered; npm version 0.1.8 wrote commit 8102495 and tag v0.1.8, with sync-workspace-versions --check confirming no workspace package drifted. check:release is green here — 173 core tests plus 7 in search-local, pnpm audit reporting no known vulnerabilities at high, and the packaged-tarball smoke installing and exercising init, Work, Docs, History, Memory, MCP and UI as 0.1.8.

Everything sits on branch release/0.1.8, five commits ahead of main, and nothing has been pushed. The tag is the trigger: the Release workflow fires on v* and publishes both packages to npm over OIDC, so pushing it is the irreversible step and it waits for an explicit decision. main is unchanged at ab15de3.
