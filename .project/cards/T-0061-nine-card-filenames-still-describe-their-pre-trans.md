---
id: T-0061
title: Nine card filenames still describe their pre-translation titles
status: done
type: chore
priority: low
area: docs
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, housekeeping]
related: [T-0054]
created: 2026-07-31
updated: 2026-07-31
scope: [.project/cards, packages/workfile/ui/src/demo-data.json]
---

The `filename-stale` rule from [[T-0054]] found nine on its first run against
this repository: T-0002 through T-0010 carry Spanish filenames under English
titles. They were translated when [[CONV-0001]] was adopted and the files stayed
behind — the exact drift the rule exists to catch, sitting in the repository that
wrote it.

```
T-0004-card-release-degrada-una-card-done-a-next-salvo-qu.md
  title: card release demotes a done card to next unless --status is passed
```

`doctor --fix` renames all nine in one pass. It was deliberately not run,
because the rename is not self-contained:

`packages/workfile/ui/src/demo-data.json` embeds two of the filenames — at
`:201` and `:241`, plus the `path` fields at `:3189` and `:3665`. It is a
generated snapshot ([[LRN-0003]]) rebuilt by `pnpm demo:data`, and
`demo-parity.test.ts` checks it against the live workspace, so the rename and
the regeneration have to land together or the demo drifts.

## Scope

1. `pnpm workfile doctor --fix`
2. `pnpm demo:data`
3. Confirm `demo-parity.test.ts` is green and the media that shows the board
   still matches.

Worth deciding rather than doing on reflex: these are `done` cards from shipped
releases, and renaming them churns nine files of git history for records whose
identity is the ID, not the filename. The counter-argument is that leaving them
means this repository permanently reports nine warnings about a rule it ships.

## Activity

- 2026-07-31 22:22Z session-fube-triage · claimed
- 2026-07-31 22:24Z session-fube-triage · doing → done
- 2026-07-31 22:24Z session-fube-triage · released

## Verification

- 2026-07-31 22:24Z session-fube-triage — Done. `doctor --fix` renamed all nine, and `git status` scores every one as a pure rename (R, no content delta), so `git log --follow` still reaches the full history of each record — the churn argument in the body turns out to cost nothing. `pnpm demo:data` rebuilt the snapshot in the same change: the nine `file` fields and the four `path` fields now carry the English names, and the only surviving Spanish filename in the JSON is the one quoted as an example inside this card's own body. Runtime: `workfile doctor` reports 0 errors, 0 warnings against this repository for the first time; demo-parity and cards suites pass 8/8.
