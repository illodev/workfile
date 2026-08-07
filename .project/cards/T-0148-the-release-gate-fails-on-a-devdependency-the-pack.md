---
id: T-0148
title: The release gate fails on a devDependency the package never ships
status: done
type: bug
priority: medium
area: infra
tags: [release, audit, dependencies]
created: 2026-08-03
updated: 2026-08-07
scope: [package.json, .github/workflows, scripts/audit-consumer.ts]
related: [ADR-0021, T-0221, T-0220]
verified:
  at: "2026-08-07T18:55:12.547Z"
  method: ci
  commit: aa0ac9df751eeaef6c6c4d2bc1868993a50ee96c
  run: "https://github.com/illodev/workfile/actions/runs/31208898683/job/92966664406"
  digest: "sha256:8b14d9b6ac816c9a47e215b59e9ef8ec8f5357c8ad169455e77e19ec407c5923"
---

The `Release` workflow for `v0.5.4` failed at `pnpm run check:release`. Build,
plugin build, strict ratchet and the tests of both packages had already passed;
`pnpm audit --audit-level=high` is what exited 1:

```
high  fast-uri vulnerable to host confusion via backslash authority introducer
      .>@commitlint/cli>@commitlint/load>@commitlint/config-validator>ajv>fast-uri
      Vulnerable >=3.0.0 <3.1.5 -> patched >=3.1.5
```

`fast-uri@3.1.4` arrives twice, both times through tooling: `@commitlint/cli`
and `shadcn` -> `@modelcontextprotocol/sdk`. Neither is in `dependencies`, and
`files` publishes only `dist`, `docs`, `README.md` and
`project.config.example.mjs` — so nothing vulnerable was ever going to reach a
user of `@illodev/workfile`. The gate still refused, correctly: it audits the
workspace, not the tarball.

Fixed the way this repository already fixes this, with a `pnpm.overrides` entry
beside `sharp` and `adm-zip`.

## What this cost

A published tag whose release did nothing. `Publish to npm` never ran, so no
artifact existed under `v0.5.4` and the tag was moved onto the fix rather than
burning the version.

## What is worth deciding

An advisory in a transitive devDependency will do this again, on whatever
schedule the ecosystem picks — and always at the least convenient moment,
because the gate only runs on a tag push. Two options, neither obviously right:

- Keep the gate as it is and absorb the occasional failed tag. Honest, noisy.
- Run `pnpm audit` in the ordinary CI check as well, so an advisory surfaces on
  a pull request instead of on a release. Cheap, and moves the failure to where
  it costs a re-run rather than a retag.

## Acceptance criteria

- [x] `pnpm audit --audit-level=high` passes on a clean install
- [x] The decision above is recorded, whichever way it goes
- [x] If the audit moves into ordinary CI, a pull request proves it fails there
      first

## Activity

- 2026-08-07 17:29Z illodev@local#42eb42f5 · claimed
- 2026-08-07 17:39Z illodev@local#42eb42f5 · released
- 2026-08-07 18:55Z illodev@local#42eb42f5 · review → done

## Notes

- 2026-08-07 17:39Z illodev@local#42eb42f5 — Decided jointly with T-0220 as one policy, recorded in ADR-0021: gates run on pull requests, and local pnpm run check gains neither because it runs constantly and both need the network. pnpm audit --audit-level=high is now its own blocking job in ci.yml at the release gate's threshold. Blocking rather than warning, because check:release would still block at tag time, so a non-blocking pull-request job would be noise people learn to ignore.
Criterion 1 was already met before this card was worked: the four pnpm.overrides make pnpm audit --audit-level=high exit 0 on a clean install, with one moderate remaining (hono via shadcn, below the gate).
And the finding that matters more than the timing question. This card's body reads the workspace/tarball distinction as reassuring — "nothing vulnerable was ever going to reach a user" — and for two of the four overrides it is the opposite. sharp and adm-zip both sit under @huggingface/transformers, which is a dependencies entry of the published @illodev/workfile-search-local. Overrides are a workspace-install mechanism and do not travel inside a published package, so those two entries made this gate green and fixed the advisories for nobody who installed it. Measured rather than reasoned: resolving what the publishable manifests declare, with no overrides, reports four packages at high — sharp <0.35.0 with the libvips CVEs, adm-zip <0.6.0, and onnxruntime-node and transformers through them — all with no fix available, and transformers 4.2.0 is the latest release and pins sharp ^0.34.5. So a third gate exists now that neither card asked for: scripts/audit-consumer.ts audits the tree a consumer resolves, blocking, with no allowlist. That no-allowlist posture is the maintainer's explicit call over a doctor-style baseline, and its consequence is deliberate — the gate is red today and stays red until the published tree changes. Tracked as T-0221 with the routes laid out, because choosing between them is a product decision.
Criterion 3 is unchecked on purpose: the job is wired and the command fails locally with the exit code CI will see, but nothing has run in CI, and this repository does not treat a local run as proof of a pull request. It needs one push.
- 2026-08-07 18:55Z illodev@local#42eb42f5 — Criterion 3 proven in CI, not locally. PRs #30 and #31 showed the audit job running and passing, which proves the wiring and the green path but not the one the criterion asks about. So a throwaway draft PR (#32) pinned hono to 4.12.33 — the version GHSA-8j4g-w8fx-2239 covers, which T-0222 had overridden away — and changed nothing else. The audit job failed on the pull request at the pnpm audit --audit-level=moderate step, naming the advisory, its patched range and the full path packages__workfile>shadcn>@modelcontextprotocol/sdk>hono, and exited 1: https://github.com/illodev/workfile/actions/runs/31208898683/job/92966664406 — closed unmerged, branch deleted, main untouched at aa0ac9d.
The same install also demonstrated T-0222's threshold change on one tree rather than in prose: exit 1 at --audit-level=moderate, exit 0 at --audit-level=high. An advisory that the old floor could not see is exactly what sat in the security tab for days.
So the shape T-0148 was filed about is closed: an advisory in a transitive devDependency now turns a pull request red, where a re-run fixes it, instead of failing a tag push and burning a version the way v0.5.4 did.
- 2026-08-07 18:55Z illodev@local#42eb42f5 — ci verification: The audit job failed on PR #32 at the pnpm audit --audit-level=moderate step with GHSA-8j4g-w8fx-2239 and exit code 1, naming the advisory, its patched range and the path packages__workfile>shadcn>@modelcontextprotocol/sdk>hono. Same install exits 0 at --audit-level=high, which demonstrates T-0222's floor change on one tree. PR closed unmerged and branch deleted; main is aa0ac9d and audits clean at moderate. The passing path was already recorded on PRs #30 (audit pass, 27s) and #31 (audit pass, 20s).
