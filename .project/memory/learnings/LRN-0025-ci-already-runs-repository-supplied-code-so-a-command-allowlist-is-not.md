---
id: LRN-0025
title: CI already runs repository-supplied code, so a command allowlist is not the boundary
status: active
confidence: high
related: [T-0188, ADR-0016]
tags: [ci, security]
created: 2026-08-05
updated: 2026-08-05
---

ADR-0016 says its decision "is not implementable without an allowlist of permitted
command prefixes in project config", and T-0188 was filed to build one because
`verify[].run` executed by CI would be remote code execution on the runner. Both
read as if the allowlist were the boundary between a fork's pull request and the
runner. It is not, and it never was.

The generated GitHub target triggers on `pull_request`, which checks out the pull
request's head — a fork's head included. Two channels already execute that
checkout's code before any card is read:

- `loadWorkspace` does `await import(url.href)` on `project.config.mjs` from the
  checkout (`src/workspace/load-workspace.ts`). Every command that loads a
  workspace runs that file, `doctor` included, which is the one command the
  generated workflow exists to run.
- This repository's own workflow additionally runs `pnpm install
  --frozen-lockfile` and `pnpm run build:core` before it gets there, which is
  install scripts and a compiler over the same untrusted tree.

So the runner has been executing repository-supplied code since the first
generated workflow. That is the ordinary, accepted cost of building a pull
request, and GitHub prices it accordingly: a fork PR gets a read-only
`GITHUB_TOKEN` and no secrets.

**Why:** stating the allowlist's value wrongly makes it look sufficient, and a
control believed to be a boundary stops anyone looking for the real one. What
actually bounds the damage is the job, not the card: no secrets, no write token,
and no evidence written back from a fork's head.

**How to apply:** the allowlist is worth building for what it does do — it keeps
a declared command reviewable, and it stops a card silently introducing one that
runs where the repository's code is not otherwise executed, such as a maintainer
running `card verify` on a branch they only meant to read. Argue it that way, in
the card and in the ADR. Any card claiming to close the fork-RCE hole should be
refused on the grounds that the hole is elsewhere and is priced, not on the
grounds that the allowlist closes it.
