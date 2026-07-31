---
id: T-0070
title: "Release 0.2.0: what it already did"
status: done
type: task
priority: high
area: infra
tags: [release]
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, .claude-plugin, plugins]
---

Sixteen fragments, against one to three in every release before it. The
minor rather than another patch: `workfile next`, `doctor --new` and the `wf`
bin are three new capabilities, and the interface stopped assuming a desktop
across seven views.

Named for what the batch turned out to be about. A session in another
repository filed seven complaints; three of them were about capabilities that
already shipped, which is recorded as [[LRN-0004]] — a feature request from a
competent agent is first a documentation bug report.

## Sequence

1. `changelog release 0.2.0 --title ... --date ...`
2. `npm version 0.2.0` at the root; the `version` hook carries `packages/*`.
3. `workfile upgrade` resyncs every surface carrying a managed marker.
4. The two plugin manifests, which carry the version outside those markers.
5. `check:release`, then tag and push.

## The failure mode this repository has already hit

0.1.9 pushed `main` without the tag. The Release workflow fires on `v*` only,
so for about an hour the repository advertised a version npm was not serving.
Branch and tag go up together, and `npm view` is compared against
`package.json` before this card closes.

## Activity

- 2026-07-31 23:03Z session-fube-triage · claimed
- 2026-07-31 23:03Z session-fube-triage · claimed
- 2026-07-31 23:12Z session-fube-triage · doing → done
- 2026-07-31 23:12Z session-fube-triage · released

## Verification

- 2026-07-31 23:12Z session-fube-triage — 0.2.0 is live as latest for both packages, published by the tag pipeline (run 30672136501, green in 1m13s). Verified against the registry rather than against the branch: `npm view` answers 0.2.0 for @illodev/workfile and @illodev/workfile-search-local, dist-tags reads latest 0.2.0, and package.json agrees — on the first poll, no drift. That comparison is the one [[T-0051]] recorded as missing when 0.1.9 advertised a version npm was not serving for an hour; branch and tag went up in one `git push origin main v0.2.0` this time, so the window never opened.

The tag sits on the plugin-manifests commit, matching where v0.1.9 sits, so it captures the release state and not the bookkeeping commit above it. `check:release` was green locally before the push — 182 + 7 tests, strictNullChecks 647 known and none new, no vulnerabilities, and the packed tarball smoke-tested as 0.2.0 through install, init, Work, Docs, History, Memory, MCP and UI.

Sixteen fragments against one to three in every release before it, and the minor rather than another patch because three of them are new capabilities. Two things worth carrying forward: the release record turned out to be writable exactly once, which is [[T-0071]], and the demo snapshot is refreshed after this card closes rather than during the cut, because regenerating while the card is still claimed freezes a live claim into the JSON.
