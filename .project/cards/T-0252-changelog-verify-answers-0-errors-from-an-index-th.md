---
id: T-0252
title: changelog verify answers 0 errors from an index that was never diagnosed
status: backlog
type: bug
priority: high
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007]
raised: derived
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-12
---

A consuming agent deleted a fragment file after a cut, left its id in the release record, ran `changelog verify` and read «0 errors». Reproduced on 2026-09-12 in a scratch workspace: two fragments, `changelog release 0.1.0`, the second fragment's file removed from `releases/0-1-0/fragments/`.

```
changelog verify   → Changelog: 0 errors, 0 warnings   (exit 0)
doctor --json      → error release-missing-fragment REL-0001 — Release fragment does not exist: CHG-0002
```

The cause is in `bin/workfile.ts`: the `verify` handler calls `buildProjectIndex(workspace)` with no options, and `records/index.ts` builds the per-module reports only when `options.diagnose === true` — otherwise every report is `{ diagnosed: false, issues: [] }`, which the handler prints as a clean verdict. The doctor asks for `{ diagnose: true }` and finds it. `memory verify` reads the same undiagnosed index (to confirm on the same line pattern). A command named `verify` that can only ever answer zero is worse than none: the agent believed it.

The fix is the option on the two calls, and a test that deletes a released fragment's file and expects `changelog verify` to exit 1 naming `release-missing-fragment`. `report.diagnosed === false` should also be impossible to print as a verdict — refuse it, so this cannot come back on a third command.

## Acceptance criteria

- [ ] With a released fragment's file deleted, `changelog verify` exits 1 and names `release-missing-fragment` for the release, matching what `doctor` reports
- [ ] `memory verify` is checked the same way and fixed if it reads an undiagnosed index
- [ ] Printing a verdict from a report with `diagnosed: false` is refused rather than shown as 0 errors, pinned by a test

## Notes

- 2026-09-12 09:06Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Confirmed on 2026-09-12: the memory verify handler in bin/workfile.ts is the same shape — buildProjectIndex(workspace) with no options, then index.reports.memory — so memory verify can only ever answer 0 errors too. card verify is a different path (it runs the card's verify entries) and is not affected.
