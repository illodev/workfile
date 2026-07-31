---
id: T-0051
title: "Release 0.1.9: the front door, the second density and the empty backlog"
status: done
type: task
priority: high
area: infra
created: 2026-07-31
updated: 2026-07-31
scope: [package.json, CHANGELOG.md, .project/changelog]
---
## Activity

- 2026-07-31 19:10Z claude-opus-7c645bf5 · claimed
- 2026-07-31 19:36Z claude-opus-7c645bf5 · doing → done
- 2026-07-31 19:36Z claude-opus-7c645bf5 · released

## Notes

- 2026-07-31 19:36Z claude-opus-7c645bf5 — 0.1.9 is live as latest for both packages, published by the tag pipeline (run 30659595991): tag-version match, no workspace drift, check:release green in CI, no vulnerabilities, packaged smoke, OIDC publish. Both answered 0.1.9 on the first poll.

REL-0009 is the first release in this repository with a name of its own - 'The front door' - because T-0037 was fixed one commit earlier and the flag it uncovered was used on the very next cut. Three public lines across added, changed and fixed.

Worth recording how this one nearly went wrong. main was pushed without the tag, so for about an hour the repository advertised 0.1.9 - package.json, both plugin manifests, the generated surfaces - while npm still served 0.1.8 to anyone installing. The Release workflow fires on v* only; pushing the branch publishes nothing. The asymmetry is invisible from the branch itself and only shows up by comparing 'npm view' against package.json, which is worth doing whenever a release looks finished.
