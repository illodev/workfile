---
id: T-0189
title: CI runs a card's declared checks and writes back the evidence
status: doing
type: feature
priority: medium
area: infra
parent: T-0183
tags: [protocol, acceptance]
effort: L
created: 2026-08-05
updated: 2026-08-07
origin: [ADR-0016]
depends: [T-0188, T-0186]
claimed_by: "illodev@local#42eb42f5"
claimed_at: "2026-08-07T20:49:06.844Z"
scope: [packages/workfile/src/modules/ci, packages/workfile/src/modules/cards/runner.ts, packages/workfile/bin/workfile.ts]
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
- [x] A passing run writes `verified` with `method: ci`, the commit and the run URL.
- [ ] A fork PR either records evidence safely or records none; it never fails open.
- [x] The behaviour is documented in the CLI/CI reference, including what it does not do.

## Activity

- 2026-08-07 20:49Z illodev@local#42eb42f5 · claimed

## Notes

- 2026-08-07 21:09Z illodev@local#42eb42f5 — The three open questions the card said to settle first, settled.

Where the evidence is written from a PR that cannot push: two jobs, and the owner chose it. The job that runs card-declared commands holds `permissions: {}` and leaves no credentials in .git/config; a second job holds `contents: write` and runs no repository code at all — not even Workfile, because every Workfile command import()s project.config.mjs from the checkout. It applies a patch bounded to the protocol directory. A fork gets a read-only token from GitHub for pull_request, so nothing is recorded there whatever the workflow says, and the job condition declines to start in order to say so rather than fail at the last step.

Whether a failing check blocks the merge or refuses done: it refuses done, which the card guessed right. A failing command unchecks the criteria it owns, and assertAcceptanceMet then refuses the transition. The job also exits non-zero so the run is visibly red, but nothing is gated on that.

One job per card or one for all: one for all. The card format is a flat command list and the CI config decides the shape, per ADR-0016.

And one thing the card did not anticipate. T-0188 left a tripwire in ci-targets.test.ts, asserting that no generated target contains the string `card verify` or an Actions expression, commented as "the pin that keeps the next card honest" — and this is that card. What it was protecting is real and stands: a verify[].run is an argument vector so that no shell parses it, and an Actions expression inside a run: block is expanded before the shell sees it. Neither is what invoking the runner does: the card's command never appears in the workflow, and the tool spawns it with no shell. So the two blanket assertions are replaced by the two rules they stood for — no target reads a card's verify block into the template, and no Actions expression reaches a shell line, checked by indentation across run: and script: in all three formats.

The first version of that second check was broken in the dangerous direction: a mutation putting an Actions expression on a continuation line passed it. Found by mutating, not by reading. It is a line-based scan now, with a per-format floor so a scan that stops matching fails loudly instead of reporting a clean sweep over nothing.
