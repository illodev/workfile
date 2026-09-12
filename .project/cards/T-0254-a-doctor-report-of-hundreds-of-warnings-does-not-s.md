---
id: T-0254
title: A doctor report of hundreds of warnings does not say --new exists
status: backlog
type: task
priority: medium
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

A consuming agent reads 592 warnings from `doctor`, almost all `filename-stale` on old records, and reports that any new warning is lost in there — asking for «a baseline, or only what is new since X». Both exist: `doctor --accept-baseline` writes the current issue set and `doctor --new` reports only what appeared after it, documented in `docs/cli.md` as «did I make it worse». The agent did not find them because nothing in the place it was looking says so: the 592-line report ends with a count and no hint, and the usage line `doctor --help` prints lists `--json`, `--severity`, `--max-issues`, `--rebuild-cache` and `--fix` — neither baseline flag.

The feature is not the gap; the doorway is. When a report runs past a threshold of warnings (say fifty), the footer should name the two flags in one line, and the usage line should list them. The generated CI template could also run `doctor --new` once a baseline exists, which is what makes a consumer's pipeline able to fail on a regression instead of on inherited history — to be decided with the owner, since it changes what a red job means.

## Acceptance criteria

- [ ] A `doctor` report with more than fifty warnings ends with one line naming `--new` and `--accept-baseline`, and a report under that does not
- [ ] `doctor --help` lists both flags
- [ ] Whether the generated CI template should run `doctor --new` when a baseline exists is decided and recorded on this card
