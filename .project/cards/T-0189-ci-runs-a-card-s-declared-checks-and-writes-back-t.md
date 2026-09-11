---
id: T-0189
title: CI runs a card's declared checks and writes back the evidence
status: done
type: feature
priority: medium
area: infra
parent: T-0183
tags: [protocol, acceptance]
effort: L
created: 2026-08-05
updated: 2026-09-11
origin: [ADR-0016]
depends: [T-0188, T-0186]
scope: [packages/workfile/src/modules/ci, packages/workfile/src/modules/cards/runner.ts, packages/workfile/bin/workfile.ts]
verified:
  at: "2026-09-11T17:35:05.106Z"
  method: ci
  commit: 7637b342ce7250a699cda98e9581b07cf08db343
  run: "https://github.com/illodev/workfile/actions/runs/31220115910"
  digest: "sha256:7ff410861c4fe56a7a9fa088739e833d7f9e6ba6c1ed3b282618ac93da73a104"
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

- [x] The generated GitHub workflow runs the declared checks for cards touched by the branch.
- [x] A passing run writes `verified` with `method: ci`, the commit and the run URL.
- [x] A fork PR records no evidence, and the workflow says so rather than failing at the last step — measured on what GitHub enforces, not run from a second account: `pull_request` from a fork receives a read-only token, so the `record` job's push cannot land whatever the file says, and the job carries `if: github.event.pull_request.head.repo.full_name == github.repository` so it declines to start; the trigger is pinned as `pull_request` and never `pull_request_target` by ci-targets.test.ts. The original criterion — "either records evidence safely or records none; it never fails open" — asked for a fork PR that only a second account can open; the owner chose the measurement on 2026-09-11.
- [x] The behaviour is documented in the CLI/CI reference, including what it does not do.

## Activity

- 2026-08-07 20:49Z illodev@local#42eb42f5 · claimed
- 2026-08-07 21:43Z illodev@local#42eb42f5 · doing → review
- 2026-09-11 17:35Z illodev@local#597ecdc9 · review → done

## Notes

- 2026-08-07 21:09Z illodev@local#42eb42f5 — The three open questions the card said to settle first, settled.

Where the evidence is written from a PR that cannot push: two jobs, and the owner chose it. The job that runs card-declared commands holds `permissions: {}` and leaves no credentials in .git/config; a second job holds `contents: write` and runs no repository code at all — not even Workfile, because every Workfile command import()s project.config.mjs from the checkout. It applies a patch bounded to the protocol directory. A fork gets a read-only token from GitHub for pull_request, so nothing is recorded there whatever the workflow says, and the job condition declines to start in order to say so rather than fail at the last step.

Whether a failing check blocks the merge or refuses done: it refuses done, which the card guessed right. A failing command unchecks the criteria it owns, and assertAcceptanceMet then refuses the transition. The job also exits non-zero so the run is visibly red, but nothing is gated on that.

One job per card or one for all: one for all. The card format is a flat command list and the CI config decides the shape, per ADR-0016.

And one thing the card did not anticipate. T-0188 left a tripwire in ci-targets.test.ts, asserting that no generated target contains the string `card verify` or an Actions expression, commented as "the pin that keeps the next card honest" — and this is that card. What it was protecting is real and stands: a verify[].run is an argument vector so that no shell parses it, and an Actions expression inside a run: block is expanded before the shell sees it. Neither is what invoking the runner does: the card's command never appears in the workflow, and the tool spawns it with no shell. So the two blanket assertions are replaced by the two rules they stood for — no target reads a card's verify block into the template, and no Actions expression reaches a shell line, checked by indentation across run: and script: in all three formats.

The first version of that second check was broken in the dangerous direction: a mutation putting an Actions expression on a continuation line passed it. Found by mutating, not by reading. It is a line-based scan now, with a per-format floor so a scan that stops matching fails loudly instead of reporting a clean sweep over nothing.
- 2026-08-07 21:43Z illodev@local#42eb42f5 — Criterion 1 proven on PR #36, which is this branch. The `cards` job discovered T-0161 as a card the branch touched, ran its declared command, checked the four criteria bound to it, left the fifth alone, and the `record` job pushed commit 5b61847 — a github-actions[bot] commit whose only change is those four boxes plus a trail line naming runner@local and the command. Run: https://github.com/illodev/workfile/actions/runs/31220115910

And one thing the run corrected. The workflow comment claimed the push converges because the second run finds nothing to write. True, but not the operative reason: a push made with GITHUB_TOKEN does not start a workflow run at all. Observed as two runs created in action_required that never executed. Both reasons are stated now, first one first, because someone debugging a loop would otherwise look at the wrong one.

Criterion 3 is argued and pinned rather than run: demonstrating it needs a pull request from a fork, which needs a second account. What GitHub enforces is that `pull_request` from a fork gets a read-only token, so the push cannot land; the job condition declines to start on top of that, and a test pins the condition.
- 2026-09-11 17:35Z illodev@local#597ecdc9 — ci verification: Run 31220115910 on PR #36: the cards job found T-0161 as touched, ran its declared command, checked the four bound criteria, and the record job pushed 5b61847 as github-actions[bot] with only those boxes and a trail line. Criterion 3 is the measurement written into it: a fork gets a read-only token on pull_request and the record job declines to start on a non-same-repository head; the trigger pin lives in ci-targets.test.ts. Decided by the owner on 2026-09-11 instead of a second-account fork PR.
