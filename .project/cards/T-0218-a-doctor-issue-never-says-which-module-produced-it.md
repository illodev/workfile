---
id: T-0218
title: A doctor issue never says which module produced it
status: backlog
type: task
priority: low
area: core
tags: [health]
effort: S
scope: [packages/workfile/src/modules/health]
origin: [T-0213, LRN-0029]
created: 2026-08-07
updated: 2026-08-07
---

Found while auditing T-0213.

Every module that reports health returns `{ module, issues }` — `diagnoseCards`,
the docs, changelog and memory reports, `checkCiTemplates`, and
`healthReports` with `module: "integration:<id>"`. `runDoctor` then does
`reports.flatMap((report) => report.issues)` and the module is gone. What
reaches the reader is a flat list where nothing says where a finding came from.

Mostly this is invisible, because a core `code` implies its module to anyone who
knows the codebase. It stops being invisible for integrations, which are the one
source that is not ours: a diagnostic a repository's own `healthCheck` returned
reads exactly like one Workfile produced. ADR-0019 made the three
`integration-health-check-*` failures name their integration, but only because
those are authored here — a well-formed diagnostic from a hook still arrives
anonymous.

The fix is small and the decision is what to do with `code`. Stamping the module
into the issue is additive and safe; namespacing the `code` would be clearer and
would break `issueIdentity`, so every baseline accepted with
`doctor --accept-baseline` would go stale at once. Probably: carry `module` as a
field, leave `code` alone, and have the CLI and the Health view group by it.

## Acceptance criteria

- [ ] A doctor issue carries the module that produced it, integrations included.
- [ ] An existing accepted baseline still matches, proven by a test.
- [ ] The CLI and `/api/v2/health` consumers can tell an integration's finding from a core one.
