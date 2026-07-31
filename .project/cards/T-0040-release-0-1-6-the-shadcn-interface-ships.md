---
id: T-0040
title: "Release 0.1.6: the shadcn interface ships"
status: done
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json, .claude, .project/agents, plugins/workfile, AGENTS.md, CLAUDE.md, .claude-plugin, .project/generated, packages/workfile/ui/src/demo-data.json]
---
## Activity

- 2026-07-31 11:37Z claude-fable-4df73848 · claimed
- 2026-07-31 11:40Z claude-fable-4df73848 · doing → done
- 2026-07-31 11:40Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 11:40Z claude-fable-4df73848 — 0.1.6 live on the registry as latest for both packages, published end to end by the tag pipeline (run 30627757056): tag-version match, check:release green in CI (167+7 tests, no vulnerabilities, packaged smoke exercising the new UI), OIDC publish. No manual step touched the registry. REL-0006 renders one public line for the whole migration; the tag sits on the bump commit directly, same discipline as 0.1.5. The hosted demo snapshot shipped inside the package carries the migration story it was built by.
