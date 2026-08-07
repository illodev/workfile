---
id: T-0213
title: doctor calls a healthCheck the repository declares, on every runner
status: done
type: audit
priority: high
area: infra
tags: [security]
effort: S
scope: [packages/workfile/src/modules/integrations, packages/workfile/src/modules/health, packages/workfile/src/modules/ci, packages/workfile/test/integrations.test.ts, packages/workfile/test/ci-targets.test.ts, packages/workfile/strict-baseline.json]
origin: [T-0188, LRN-0028]
created: 2026-08-05
updated: 2026-08-07
related: [ADR-0019, LRN-0029, T-0218]
verified:
  at: "2026-08-07T16:48:16.725Z"
  method: local
  commit: 4e8da0782fecb7e52899f7916be21ad7f3d4c775
  digest: "sha256:0d50a6371d79d42b7d4bd6d0ac6b1ec47f552ff820f2f7ebc6708756b7be3d0f"
---

Found while auditing T-0188, and one hop further out than LRN-0025 recorded.

`loadWorkspace` imports `project.config.mjs` from the checkout, which is the
first channel: a pull request that edits it runs its own module body on the
runner. `runDoctor` then builds an integration registry from that same module's
`integrations` export and calls each declared `healthCheck`. So the repository
does not merely get its top-level code executed — it gets to hand `doctor` a
function and have `doctor` call it, inside the one command the generated
workflow exists to run.

That is not a new exposure on GitHub, where a fork's pull request already builds
the fork's head without the base repository's secrets. It matters in the two
places the generated templates cannot protect: a GitLab job, which sees every
unprotected CI/CD variable on any branch push, and the generic script, which
inherits whatever environment invokes it. It also matters for a maintainer
running `doctor` locally on a branch they only meant to read — the same case the
command allowlist covers for `verify[].run`, and this path has no allowlist at
all.

Filed as an audit because the question is what the integration surface is
supposed to be, not how to patch one call. An integration that cannot run
arbitrary code is a different feature from the one that exists, and deciding
that is the work.

What to establish, in order:

- Which surfaces call a declared `healthCheck`, and which of them run somewhere a
  repository is not already trusted.
- Whether `doctor` should call them at all, or only a command a person asked for.
- Whether the config module's execution can be bounded, or whether the honest
  answer is that it cannot and the containment belongs to the job.

## Acceptance criteria

- [x] Every surface that calls repository-declared code is listed, with where it runs.
- [x] A decision is recorded on whether `doctor` calls a declared `healthCheck`, with the reason.
- [x] The generated CI documentation states what a repository's own config can execute, rather than leaving it to be discovered.
- [x] If the behaviour changes, a project that declares no integrations behaves exactly as before, proven by a test.

## Activity

- 2026-08-07 16:32Z illodev@local#42eb42f5 · claimed
- 2026-08-07 16:48Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 16:48Z illodev@local#42eb42f5 — Audited and closed. The premise the card was filed on holds — runDoctor does hand doctor a repository-supplied function and call it — but the conclusion does not: removing the call closes nothing, because loadWorkspace already import()s project.config.mjs in every command, so the module body runs earlier and more quietly than any hook. LRN-0029 lists all three channels with their callers; ADR-0019 records the decision. What the audit actually found was a robustness defect, verified against the packaged CLI on a scratch workspace: a healthCheck that threw propagated out of runDoctor and took the command down with a raw Error, so the report that would have named the broken integration never printed — the CLI, /api/v2/health, /api/health and both MCP doctor surfaces all died with it. A hook returning { severity: "catastrophe" } wrote NaN into doctor's counts, landed in no bucket, left ok true, and made the severity comparator sort on NaN — an integration could decide whether the repository passed, by typo. And a hook that never settled had no bound at all. Now each call is isolated, bounded at 10s and validated: real binary, two hooks declared, reports integration-health-check-failed naming "no credentials configured" and integration-health-check-invalid naming "1 of 1 diagnostics that could not be counted", both error, ok: false, exit 1. Hanging hook at the real default: integration-health-check-timeout with timeoutMs 10000 after 11s wall clock, report printed. No integrations declared: 0 errors, 0 warnings, zero integration findings. The bound is partial on purpose and the code says so — a hook runs on doctor's own event loop, so it catches an awaited hang and cannot catch a synchronous spin. One trap worth the record: the timer was unref'd in the first draft, which let Node exit before the bound fired and printed no report at all — strictly worse than the hang. Filed T-0218 for the provenance gap the audit surfaced: doctor flattens away the module that produced an issue, so a well-formed diagnostic from a repository's own hook is indistinguishable from one Workfile wrote.
- 2026-08-07 16:48Z illodev@local#42eb42f5 — local verification: pnpm run check green: 460+7 tests pass, strictNullChecks held at 488 with registry.ts ratcheted 10 to 9. Packaged CLI against scratch workspaces: throwing and malformed hooks reported as integration-health-check-failed and -invalid at error severity with ok false and exit 1 instead of crashing runDoctor; hanging hook bounded at the 10s default (timeoutMs 10000, 11s wall clock, report printed); a workspace declaring no integrations reports 0 errors, 0 warnings and zero integration findings. Repo doctor 0/0, memory verify 0/0.
