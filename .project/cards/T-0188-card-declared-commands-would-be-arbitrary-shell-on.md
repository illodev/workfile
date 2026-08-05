---
id: T-0188
title: Card-declared commands would be arbitrary shell on the CI runner
status: backlog
type: audit
priority: high
area: infra
parent: T-0183
tags: [protocol, acceptance]
effort: S
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
---

Blocks the `ci` method. A card is a Markdown file; in a repository that takes
pull requests, a card can arrive from a fork. `verify[].run` executed by CI is
then remote code execution on the runner, with whatever the job holds.

The generated GitHub workflow already sets `permissions: contents: read`
(`packages/workfile/src/modules/ci/ci.ts`), which is necessary and nowhere near
sufficient — it does not stop exfiltration of anything else in the environment,
and it says nothing about the other two generated targets.

Two mitigations, both wanted: an allowlist of permitted command prefixes
declared in project config, refused at write time rather than at run time so the
card never lands; and card checks running in a job that holds no secrets.

Filed as an audit rather than a task because the same question needs asking of
the GitLab and generic targets, which have their own permission models, and the
answer may differ per target.

## Acceptance criteria

- [ ] `verify[].run` is refused on write unless it matches a prefix the project declares.
- [ ] The allowlist is empty by default: a project that declares nothing can run nothing.
- [ ] The three generated CI targets are each reviewed for what a card-declared command can reach, and the finding is recorded.
- [ ] A card carrying a disallowed command is refused with a named error, proven by a test.
