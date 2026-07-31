---
id: T-0044
title: "A density toggle in the UI: data-density has no home"
status: done
type: feature
priority: low
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/main.tsx]
---
## Activity

- 2026-07-31 18:58Z claude-opus-7c645bf5 · claimed
- 2026-07-31 19:04Z claude-opus-7c645bf5 · doing → review
- 2026-07-31 19:09Z claude-opus-7c645bf5 · review → done
- 2026-07-31 19:09Z claude-opus-7c645bf5 · released

## Notes

- 2026-07-31 19:04Z claude-opus-7c645bf5 — data-density has a home. The stylesheet has carried two densities since the shadcn migration - --row-h at 40px on :root and 48px under :root[data-density="comfortable"] - and Explorer, Boards, the shell skeleton and both Overview lists all key their row heights off that token. Nothing ever wrote the attribute, so half of it was unreachable CSS shipping in every bundle.

The toggle mirrors the theme switch exactly, which is the point: same useState-from-localStorage shape, same effect writing to documentElement.dataset, same icon-sm ghost button in the topbar. One asymmetry is deliberate - compact is the bare :root with no selector of its own, so the effect deletes the attribute rather than writing data-density="compact", which would match nothing and read as though a rule were missing.

Runtime evidence against the served UI: --row-h computes 40px on load, the toggle moves it to 48px with data-density=comfortable on the root and "comfortable" in localStorage, and a reload still computes 48px. Compact remains the default for a first visit.
