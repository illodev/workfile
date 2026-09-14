---
id: T-0254
title: A doctor report of hundreds of warnings does not say --new exists
status: review
type: task
priority: medium
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
scope: [packages/workfile/bin/workfile.ts, packages/workfile/test, packages/workfile/docs/cli.md]
---

A consuming agent reads 592 warnings from `doctor`, almost all `filename-stale` on old records, and reports that any new warning is lost in there — asking for «a baseline, or only what is new since X». Both exist: `doctor --accept-baseline` writes the current issue set and `doctor --new` reports only what appeared after it, documented in `docs/cli.md` as «did I make it worse». The agent did not find them because nothing in the place it was looking says so: the 592-line report ends with a count and no hint, and the usage line `doctor --help` prints lists `--json`, `--severity`, `--max-issues`, `--rebuild-cache` and `--fix` — neither baseline flag.

The feature is not the gap; the doorway is. When a report runs past a threshold of warnings (say fifty), the footer should name the two flags in one line, and the usage line should list them. The generated CI template could also run `doctor --new` once a baseline exists, which is what makes a consumer's pipeline able to fail on a regression instead of on inherited history — to be decided with the owner, since it changes what a red job means.

## Acceptance criteria

- [x] A `doctor` report with more than fifty warnings ends with one line naming `--new` and `--accept-baseline`, and a report under that does not
- [x] `doctor --help` lists both flags (measured on 2026-09-14: it already did, see below)
- [x] Whether the generated CI template should run `doctor --new` when a baseline exists is decided and recorded on this card

Criterion 2's premise in the body is wrong, measured on 2026-09-14 before changing anything: `workfile doctor --help` prints `workfile doctor --new   # only what appeared since the baseline; exits 1 on anything new` and `workfile doctor --accept-baseline   # record the current state as known` as its fifth and sixth usage lines, and the flags table under them lists both. They arrived with the baseline itself in e733e18 (2026-07-31); v0.10.0 and v0.13.0 print the same. What leaves them out is the first synopsis line, `workfile doctor [--json] [--severity error|warning] [--max-issues N] [--rebuild-cache] [--fix]`, repeated in docs/cli.md — the line this card's body quotes. So the criterion holds as written and needs no change to the help; the doorway that was missing is the report's own footer, criterion 1.

## Activity

- 2026-09-14 19:41Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 19:46Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 19:44Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided by the owner on 2026-09-14: the generated CI template stays on `doctor --json`. A red job keeps meaning 'there are errors now'; running `doctor --new` when a baseline exists would pass errors already accepted into it and turn any new warning red, which changes what red means, and what the consumer lacked was a way to read the report, which the footer gives.
- 2026-09-14 19:45Z illodev@local#a112f2f3 via:undeclared/xhigh — Built and verified locally on 2026-09-14. A text doctor report whose warnings exceed fifty ends with one line naming both flags; with no baseline it reads how to record one and then read against it, and once a baseline exists it says so. On the fixture plus 51 cards whose filenames no longer match their titles, the built CLI answered 'Workfile doctor: 0 errors, 59 warnings' and ended '59 warnings. `doctor --accept-baseline` records them as known, and `doctor --new` then shows only what appears after.'; after --accept-baseline the last line became '59 warnings. A baseline exists: `doctor --new` shows only what appeared since it, and `doctor --accept-baseline` records the current state as known.' The fixture as it is (8 warnings) still ends on its rule counts. --severity error, --new and --json print no hint. Pinned by cli.test.ts 'a doctor report past fifty warnings names the baseline flags, and a short one does not'; the help and flag-table tests stay green, strict held. docs/cli.md says it beside the baseline paragraph.
- 2026-09-14 19:46Z illodev@local#a112f2f3 via:undeclared/xhigh — Full suite on this build: typecheck:api and 535/535 tests (exit 0). Exit: review — all three criteria are met; the runtime evidence is the next published release carrying the footer.
