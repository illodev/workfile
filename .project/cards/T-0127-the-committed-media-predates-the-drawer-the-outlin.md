---
id: T-0127
title: The committed media predates the drawer, the outline and the brand blue
status: done
type: task
priority: medium
area: ui
tags: [media, launch]
scope: [site, .github/media]
related: [T-0072, T-0118, T-0123]
created: 2026-08-02
updated: 2026-08-02
---

Every still the README serves and every frame of the landing's film shows the interface before this batch: a blank square where the mark goes, a near-black primary action, board columns that cannot collapse, no outline beside a document, and Memory's record in a panel wedged between the lanes.

[[T-0072]] left the procedure and the trap it cost: the README media and the landing carry **separate copies**, and regenerating one and not the other ships a stale film on the surface that actually plays it.

What has to be replaced:

- `.github/media/`: `overview.png`, `explorer.png`, `timeline.png`, `history.png`, `flow.png` (light) and `memory-dark.png` (dark), plus `demo-thumb.jpg`.
- `site/assets/`: `flow.png`, `history.png`, `workfile-demo.mp4` and `demo-poster.jpg`.

`site/assets/overview.png` is tracked and no longer referenced by `index.html` — the mirror image of the case T-0072 decided, and left alone on the same reasoning.

## Acceptance criteria

- [x] The README stills come from the current build
- [x] The landing's stills, film and poster come from the same take as each other
- [x] The poster and the thumbnail keep the dimensions the surfaces expect

## Activity

- 2026-08-02 18:38Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:44Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:44Z illodev@local#c0b2d745 · review → done

## Verification

- 2026-08-02 18:44Z illodev@local#c0b2d745 — Regenerated against the current build, both surfaces from the same take.

Six stills replaced in `.github/media` (five light, `memory-dark` dark, 2880x1800 as before) and the two the landing serves in `site/assets`. The film re-recorded clean at 59.3s H.264, 13MB — the tour scenes all still hold, including the inspector beat, which now runs through the shared drawer.

Poster and thumbnail are cut from scene 1 of this take rather than a different one, which is the trap T-0072 hit: 1152x720 for the landing, 1280x800 for the README, both scaled from the same 1440x900 frame.

`site/assets/overview.png` left alone — `index.html` stopped referencing it, which is the mirror of the case T-0072 decided for `flow.png`, so it is a deletion to make on purpose, not an asset to keep refreshing.

Worth naming rather than silently accepting: the tour never visits Docs or Memory, so the outline and the record drawer — the two most demo-worthy things in this batch — are in the stills but not in the film. Extending the tour is a change to the script, not a regeneration.
