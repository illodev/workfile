---
id: CHG-0015
title: The repository becomes a pnpm monorepo with commit hooks
type: changed
area: infra
visibility: internal
created: 2026-07-30
updated: 2026-07-30
---
The core package moved whole into `packages/workfile`; the workspace root is now a private shell that keeps the version as the lockstep source and delegates every script. The published npm surface is unchanged — the pack file list is identical before and after. husky arrives with commitlint (house narrative style, custom rules, no Conventional Commits) and `workfile doctor --severity error` as the pre-commit gate. release.yml now publishes only the `packages/*` loop; ci.yml needed zero changes.
