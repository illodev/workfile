---
id: T-0189
title: CI runs a card's declared checks and writes back the evidence
status: backlog
type: feature
priority: medium
area: infra
parent: T-0183
tags: [protocol, acceptance]
effort: L
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
depends: [T-0188, T-0186]
---

The `ci` method from ADR-0016, and the only tier with a witness. The generated
workflow gains a job that reads the cards touched by the branch, runs their
`verify` commands, and writes the `verified` block back with the run URL.

Blocked by the allowlist card: this must not ship before arbitrary card-declared
shell is bounded.

Open questions to settle before implementing, not after:

- Where the evidence is written from a PR that cannot push to the branch. A
  commit back to the head ref is the obvious answer and is unavailable for fork
  PRs, which is where the security problem also lives.
- Whether a failing check blocks the merge or only refuses the `done`
  transition. The second is the smaller promise and probably the right one.
- One job per card or one job for all of them. The card format is deliberately a
  flat command list (ADR-0016 rejected stages), so the CI config decides this.

## Acceptance criteria

- [ ] The generated GitHub workflow runs the declared checks for cards touched by the branch.
- [ ] A passing run writes `verified` with `method: ci`, the commit and the run URL.
- [ ] A fork PR either records evidence safely or records none; it never fails open.
- [ ] The behaviour is documented in the CLI/CI reference, including what it does not do.
