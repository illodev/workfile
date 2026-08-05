---
id: CHG-0127
title: Accepted decisions past the context limit are listed by title instead of dropped
type: changed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---

`agents context` no longer cuts accepted decisions and conventions at `--limit`. Those that do not fit in full are listed by ID and title under **Also in force**, so a workspace with fifty accepted ADRs still hands an agent every rule it must not contradict, at the cost of a line rather than a summary.

The bundle already exempted normative records from the relevance filter, then dropped them at the cap — so the guarantee held only in workspaces small enough not to need it. The `--json` output carries them in a new `digest` field, separate from `omitted`, because they are in the bundle rather than left out of it.
