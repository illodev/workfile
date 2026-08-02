---
id: T-0119
title: History reads edge to edge while Docs holds a measure
status: done
type: bug
priority: medium
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/History.tsx]
related: [T-0065]
created: 2026-08-02
updated: 2026-08-02
---

[[T-0065]] gave the reading views one measure, named once in `ui/src/layout.ts`, and Docs applies it to the whole reading pane. History never took it: its right pane is `px-6 py-5` with `max-w-[70ch]` sprinkled on three inner blocks, so the fragment title, the metadata line and the derived changelog all run the full width of a wide display, and the body sits left while everything around it does not.

The derived changelog is the pane's resting state — the first thing anyone sees in this view — and it is the widest thing in it.

## Acceptance criteria

- [x] The history pane reads at `READING_MEASURE`, centred, like Docs
- [x] Both states take it: the selected record and the derived changelog
- [x] The per-block `max-w-[70ch]` patches are gone rather than nested inside the new measure

## Activity

- 2026-08-02 18:07Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:08Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Verified: the history pane is 960px wide and its content column 792px, with an 84px gap on each side — centred at the shared measure, in both states.
