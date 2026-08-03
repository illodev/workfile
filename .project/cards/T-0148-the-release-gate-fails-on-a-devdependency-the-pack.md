---
id: T-0148
title: The release gate fails on a devDependency the package never ships
status: backlog
type: bug
priority: medium
area: infra
tags: [release, audit, dependencies]
created: 2026-08-03
updated: 2026-08-03
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

- [ ] `pnpm audit --audit-level=high` passes on a clean install
- [ ] The decision above is recorded, whichever way it goes
- [ ] If the audit moves into ordinary CI, a pull request proves it fails there
      first
