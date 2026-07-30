---
id: CHG-0008
title: Workspace packages version and release in lockstep with the core
type: changed
area: infra
visibility: public
cards: [T-0022]
created: 2026-07-30
updated: 2026-07-30
---

npm version now carries every packages/* package to the same version inside the same bump commit, the release workflow refuses tags where versions drifted, and publishes the core plus every workspace package under the same dist-tag. One ecosystem, one version: a provider tested against core X ships as X.
