---
id: T-0021
title: Publish @illodev/workfile-search-local 0.1.0 to npm
status: done
type: chore
priority: medium
area: infra
created: 2026-07-30
updated: 2026-07-30
scope: [packages/search-local]
---
## Notes

- 2026-07-30 19:31Z claude-fable-e341b469 — New package name: trusted publishing needs the package to exist first, so the first publish is a manual bootstrap (same procedure recorded in LRN-0001), then register the repo + release.yml as trusted publisher. Decide whether the release workflow also publishes workspace packages on tag.
- 2026-07-30 19:58Z claude-fable-e341b469 — Published manually with browser 2FA (the web-auth flow needs a real TTY; Claude's captured shell degrades to EOTP - the publish ran from the user's own terminal). Verified on the registry: @illodev/workfile-search-local@0.1.0, dist-tag latest. Tarball: 5 files, 4.8 kB, LICENSE + publishConfig.access=public added pre-publish. Remaining user action: register the repo + release.yml as trusted publisher for this package on npmjs.com so CI can publish future versions with provenance.

## Activity

- 2026-07-30 19:47Z claude-fable-e341b469 · claimed
- 2026-07-30 19:58Z claude-fable-e341b469 · doing → done
- 2026-07-30 19:58Z claude-fable-e341b469 · released

