---
id: T-0070
title: "Release 0.2.0: what it already did"
status: doing
type: task
priority: high
area: infra
tags: [release]
created: 2026-07-31
updated: 2026-07-31
claimed_by: session-fube-triage
claimed_at: "2026-07-31T23:03:45.128Z"
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

