---
id: CHG-0070
title: The next dist-tag is gone; every release is on latest
type: removed
area: infra
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
`npm install @illodev/workfile@next` used to install `0.1.0-rc.1` — a release
candidate from before the first stable version, behind `latest` by every
release the project has ever cut. The tag was set once during the 0.1.0
bootstrap and nothing ever moved it.

Nothing ever could. Releases publish through npm trusted publishing, whose
OIDC credential authorizes `npm publish` and no other registry write — so CI
can choose the channel a version publishes to and can never advance one
afterwards. A channel that cannot be advanced is worse than no channel, so the
channel is gone rather than the guarantee.

Every published version is now on `latest`, and a prerelease tag fails the
release instead of publishing. If you were pinned to `@next`, move to `@latest`
or to an explicit version; `@next` now errors rather than quietly serving
something thirteen releases old.
