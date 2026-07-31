---
id: T-0046
title: "Release 0.1.7: the drawer, the honest search, the folding sidebar"
status: done
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json, .claude, .project/agents, plugins/workfile, AGENTS.md, CLAUDE.md, .claude-plugin, .project/generated, packages/workfile/ui/src/demo-data.json]
---
## Activity

- 2026-07-31 15:21Z claude-fable-4df73848 · claimed
- 2026-07-31 15:25Z claude-fable-4df73848 · doing → done
- 2026-07-31 15:25Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 15:25Z claude-fable-4df73848 — 0.1.7 live as latest for both packages, published end to end by the tag pipeline (run 30642631132): tag-version match, check:release green in CI, no vulnerabilities, packaged smoke exercising drawer-era UI, OIDC publish. The registry read lagged ~40s behind the publish for the core package - search-local answered 0.1.7 while the core still served 0.1.6; a poll loop confirmed replication rather than assuming it. REL-0007 renders three public lines: regex+mode search and the icon-rail sidebar as additions, the drawer as the change. Demo snapshot inside the package: 46 cards, 29 history records.
