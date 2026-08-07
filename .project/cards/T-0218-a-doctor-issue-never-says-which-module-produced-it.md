---
id: T-0218
title: A doctor issue never says which module produced it
status: done
type: task
priority: low
area: core
tags: [health]
effort: S
scope: [packages/workfile/src/modules/health]
origin: [T-0213, LRN-0029]
created: 2026-08-07
updated: 2026-08-07
verified:
  at: "2026-08-07T22:58:22.248Z"
  method: local
  commit: 9cfb0175194fc944ab34f527c800adf4c1b486d2
  digest: "sha256:61c9511a6a827f6742debb2f977250551ca11a5c12bfa39a84e008eb55a0a76d"
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

- [x] A doctor issue carries the module that produced it, integrations included.
- [x] An existing accepted baseline still matches, proven by a test.
- [x] The CLI and `/api/v2/health` consumers can tell an integration's finding from a core one.

## Activity

- 2026-08-07 22:17Z illodev@local#42eb42f5 · claimed
- 2026-08-07 22:58Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 22:26Z illodev@local#42eb42f5 — The card's premise was wrong and it changed where the fix goes. It says "every module that reports health returns `{ module, issues }`" — only the integration registry does. `diagnoseCards`, the docs, changelog and memory reports, `checkAgentInstructions` and `checkCiTemplates` all return `{ counts, ok, issues }` and no module at all, so stamping `report.module` onto each issue produced `module: undefined` on 1396 of the 1397 findings in a real workspace. Verified by running it against one rather than by reading.

So the module is named where `runDoctor` calls each reporter, which is the only place that knows which one it is calling — one table, and the reports hanging off the shared index are tagged rather than mutated so the routes that also serve them are untouched.

The other decision the card left open is settled the way it guessed: `module` is a field and `code` is untouched. Namespacing the code would read better and would change `issueIdentity`, which is what a baseline is matched by, so every baseline accepted with `--accept-baseline` would go stale at once for a cosmetic gain. Pinned by a test that fails if the identity grows the field.
- 2026-08-07 22:58Z illodev@local#42eb42f5 — local verification: Against Fube's 1397 findings: every one now names its module, 0 with none, where the first attempt produced `undefined` on 1396 because the card's premise about `{ module, issues }` was wrong. The CLI's summary groups by module and code, so `integration:<id>/<code>` is unmistakable. An accepted baseline still matches, pinned by a test that fails if `issueIdentity` grows the field — mutation-proven.
