---
id: T-0252
title: changelog verify answers 0 errors from an index that was never diagnosed
status: done
type: bug
priority: high
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-14
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/records/index.ts, packages/workfile/test]
verified:
  at: "2026-09-14T19:17:27.633Z"
  method: manual
  commit: 1a49f8544a0dc388b2784bb19f8af027def2e3f5
  digest: "sha256:68caff095011e56524ae19b7730bd9501ba00cb88babdb1842116f4ada89ed3d"
---

A consuming agent deleted a fragment file after a cut, left its id in the release record, ran `changelog verify` and read «0 errors». Reproduced on 2026-09-12 in a scratch workspace: two fragments, `changelog release 0.1.0`, the second fragment's file removed from `releases/0-1-0/fragments/`.

```
changelog verify   → Changelog: 0 errors, 0 warnings   (exit 0)
doctor --json      → error release-missing-fragment REL-0001 — Release fragment does not exist: CHG-0002
```

The cause is in `bin/workfile.ts`: the `verify` handler calls `buildProjectIndex(workspace)` with no options, and `records/index.ts` builds the per-module reports only when `options.diagnose === true` — otherwise every report is `{ diagnosed: false, issues: [] }`, which the handler prints as a clean verdict. The doctor asks for `{ diagnose: true }` and finds it. `memory verify` reads the same undiagnosed index (to confirm on the same line pattern). A command named `verify` that can only ever answer zero is worse than none: the agent believed it.

The fix is the option on the two calls, and a test that deletes a released fragment's file and expects `changelog verify` to exit 1 naming `release-missing-fragment`. `report.diagnosed === false` should also be impossible to print as a verdict — refuse it, so this cannot come back on a third command.

## Acceptance criteria

- [x] With a released fragment's file deleted, `changelog verify` exits 1 and names `release-missing-fragment` for the release, matching what `doctor` reports
- [x] `memory verify` is checked the same way and fixed if it reads an undiagnosed index
- [x] Printing a verdict from a report with `diagnosed: false` is refused rather than shown as 0 errors, pinned by a test

## Notes

- 2026-09-12 09:06Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Confirmed on 2026-09-12: the memory verify handler in bin/workfile.ts is the same shape — buildProjectIndex(workspace) with no options, then index.reports.memory — so memory verify can only ever answer 0 errors too. card verify is a different path (it runs the card's verify entries) and is not affected.
- 2026-09-14 18:48Z illodev@local#a112f2f3 via:undeclared/xhigh — Fixed and verified locally on 2026-09-14 against the built CLI. Both verify handlers go through verifyModule (bin/workfile.ts), which builds the index with { diagnose: true } and reads the report through diagnosedReport (records/index.ts): a report without diagnosed: true is refused with REPORT_NOT_DIAGNOSED, and every diagnosed report now carries diagnosed: true. runDoctor reads its docs, changelog and memory reports through the same guard, so a caller handing it an undiagnosed index is refused instead of passing three unchecked modules. The card's reproduction, rerun: changelog verify → 'Changelog: 1 errors, 0 warnings / ERROR release-missing-fragment REL-0001: Release fragment does not exist: CHG-0002', exit 1, and doctor names the same issue. Found in the same helper and fixed there: --json returned before setting the exit code, so a JSON caller got 0 on a failing verdict; it now exits 1. memory verify with a learning that has no id → ERROR unreadable-memory-record, exit 1. Pinned by cli.test.ts 'changelog verify and memory verify answer what doctor finds on the same tree' and budgets.test.ts 'diagnosis is opt-in and its absence is visible'. pnpm test 532/532 (exit 0), strict held, doctor 0 errors. Exit: review — every criterion is met; the runtime evidence is 0.13.1 as published, which the owner decided on 2026-09-14 to cut.
- 2026-09-14 19:17Z illodev@local#a112f2f3 — manual verification: Verified against @illodev/workfile@0.13.1 as published on npm, installed from the registry into a scratch consumer on 2026-09-14. On the card's scenario (two fragments, release 0.1.0, CHG-0002's file deleted) the published CLI answers changelog verify 'Changelog: 1 errors, 0 warnings / ERROR release-missing-fragment REL-0001: Release fragment does not exist: CHG-0002' with exit 1, --json exits 1, and doctor names the same issue. memory verify on a learning with no id answers ERROR unreadable-memory-record with exit 1.

## Activity

- 2026-09-14 18:36Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 18:48Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review
- 2026-09-14 19:17Z illodev@local#a112f2f3 via:undeclared/xhigh · review → done
