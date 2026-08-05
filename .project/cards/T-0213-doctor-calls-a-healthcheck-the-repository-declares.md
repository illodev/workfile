---
id: T-0213
title: doctor calls a healthCheck the repository declares, on every runner
status: backlog
type: audit
priority: high
area: infra
tags: [security]
effort: S
scope: [packages/workfile/src/modules/integrations]
origin: [T-0188, LRN-0028]
created: 2026-08-05
updated: 2026-08-05
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

- [ ] Every surface that calls repository-declared code is listed, with where it runs.
- [ ] A decision is recorded on whether `doctor` calls a declared `healthCheck`, with the reason.
- [ ] The generated CI documentation states what a repository's own config can execute, rather than leaving it to be discovered.
- [ ] If the behaviour changes, a project that declares no integrations behaves exactly as before, proven by a test.
