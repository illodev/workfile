---
id: T-0148
title: The release gate fails on a devDependency the package never ships
status: review
type: bug
priority: medium
area: infra
tags: [release, audit, dependencies]
created: 2026-08-03
updated: 2026-08-07
scope: [package.json, .github/workflows, scripts/audit-consumer.ts]
related: [ADR-0021, T-0221, T-0220]
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
- [ ] If the audit moves into ordinary CI, a pull request proves it fails there
      first

## Activity

- 2026-08-07 17:29Z illodev@local#42eb42f5 · claimed
- 2026-08-07 17:39Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 17:39Z illodev@local#42eb42f5 — Decided jointly with T-0220 as one policy, recorded in ADR-0021: gates run on pull requests, and local pnpm run check gains neither because it runs constantly and both need the network. pnpm audit --audit-level=high is now its own blocking job in ci.yml at the release gate's threshold. Blocking rather than warning, because check:release would still block at tag time, so a non-blocking pull-request job would be noise people learn to ignore.
Criterion 1 was already met before this card was worked: the four pnpm.overrides make pnpm audit --audit-level=high exit 0 on a clean install, with one moderate remaining (hono via shadcn, below the gate).
And the finding that matters more than the timing question. This card's body reads the workspace/tarball distinction as reassuring — "nothing vulnerable was ever going to reach a user" — and for two of the four overrides it is the opposite. sharp and adm-zip both sit under @huggingface/transformers, which is a dependencies entry of the published @illodev/workfile-search-local. Overrides are a workspace-install mechanism and do not travel inside a published package, so those two entries made this gate green and fixed the advisories for nobody who installed it. Measured rather than reasoned: resolving what the publishable manifests declare, with no overrides, reports four packages at high — sharp <0.35.0 with the libvips CVEs, adm-zip <0.6.0, and onnxruntime-node and transformers through them — all with no fix available, and transformers 4.2.0 is the latest release and pins sharp ^0.34.5. So a third gate exists now that neither card asked for: scripts/audit-consumer.ts audits the tree a consumer resolves, blocking, with no allowlist. That no-allowlist posture is the maintainer's explicit call over a doctor-style baseline, and its consequence is deliberate — the gate is red today and stays red until the published tree changes. Tracked as T-0221 with the routes laid out, because choosing between them is a product decision.
Criterion 3 is unchecked on purpose: the job is wired and the command fails locally with the exit code CI will see, but nothing has run in CI, and this repository does not treat a local run as proof of a pull request. It needs one push.
