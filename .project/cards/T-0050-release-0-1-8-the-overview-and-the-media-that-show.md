---
id: T-0050
title: "Release 0.1.8: the Overview, and the media that shows it"
status: done
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog, packages/workfile/package.json, packages/search-local/package.json]
---
## Activity

- 2026-07-31 18:27Z claude-opus-7c645bf5 · claimed
- 2026-07-31 18:43Z claude-opus-7c645bf5 · doing → done
- 2026-07-31 18:43Z claude-opus-7c645bf5 · released

## Notes

- 2026-07-31 18:32Z claude-opus-7c645bf5 — 0.1.8 prepared locally and stopped short of publication on purpose. REL-0008 consumes CHG-0023 for a single public line; CHANGELOG.md rendered; npm version 0.1.8 wrote commit 8102495 and tag v0.1.8, with sync-workspace-versions --check confirming no workspace package drifted. check:release is green here — 173 core tests plus 7 in search-local, pnpm audit reporting no known vulnerabilities at high, and the packaged-tarball smoke installing and exercising init, Work, Docs, History, Memory, MCP and UI as 0.1.8.

Everything sits on branch release/0.1.8, five commits ahead of main, and nothing has been pushed. The tag is the trigger: the Release workflow fires on v* and publishes both packages to npm over OIDC, so pushing it is the irreversible step and it waits for an explicit decision. main is unchanged at ab15de3.
- 2026-07-31 18:43Z claude-opus-7c645bf5 — 0.1.8 is live as latest for both packages, published end to end by the tag pipeline (run 30656109374, publish job 1m26s): tag-version match, no workspace drift, check:release green in CI, no vulnerabilities at high, packaged smoke exercising the Overview-era UI, OIDC publish with no stored token. main fast-forwarded from ab15de3 to 42581a6, seven commits, and v0.1.8 points at the surface resync rather than the bare bump - the bump alone would have shipped plugin manifests still advertising 0.1.7.

Registry replication was confirmed rather than assumed, as in 0.1.7 where the core lagged ~40s behind search-local: this time both answered 0.1.8 on the first poll. dist-tags read latest 0.1.8 for the core (next still parked at the 0.1.0-rc.1 bootstrap) and latest 0.1.8 for search-local. The published tarball carries 179 files, 1.6 MB unpacked.

REL-0008 renders one public line: the Overview as an addition. The media round rides along without a fragment, which is right - it changes what the README shows, not what the package does.
