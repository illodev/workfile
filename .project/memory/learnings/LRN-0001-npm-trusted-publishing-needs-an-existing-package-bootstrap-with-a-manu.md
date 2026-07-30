---
id: LRN-0001
title: "npm trusted publishing needs an existing package: bootstrap with a manual rc"
status: active
created: 2026-07-30
updated: 2026-07-30
---
npm's trusted publisher (OIDC) can only be configured on a package that already exists on the registry, so a repo that starts with CI-only publishing has a chicken-and-egg step: the very first publish must be manual.

What worked for `@illodev/workfile` (2026-07-30):

1. Remove `"private": true` from `package.json`.
2. `npm publish --provenance=false --tag next` for a prerelease (`0.1.0-rc.1`) — provenance is impossible outside CI, and parking the bootstrap under the `next` dist-tag keeps `latest` clean.
3. On npmjs.com, register the GitHub repository plus `release.yml` as the package's trusted publisher.
4. Every later release publishes from CI with provenance; stable versions land on `latest`.

Operational detail like this belongs here, not in the public README — the README documents the steady-state release circuit only.
