---
id: T-0163
title: "Demo video: skeleton opening, misplaced click pulses, buried footer caption"
status: done
type: bug
priority: high
area: docs
created: 2026-08-05
updated: 2026-08-05
scope: [scripts/demo-video.ts, scripts/demo-stage.mjs]
---

The launch film has four defects and one omission, found while reviewing it as the asset a launch post would carry.

**The opening is a skeleton.** Playwright starts recording when the page is created, and the tour navigates afterwards, so the first seconds are `about:blank` and then the app's loading state. The film opens on the one frame that says "unfinished".

**Click pulses land somewhere the cursor is not.** `demo-stage.mjs` installs a `MutationObserver` that relocates every node added to `document.body` into `#demo-scaler`, so Radix portals resolve inside the frame. The click pulse is appended to `document.body` too, so it is relocated as well — and `#demo-scaler` carries `transform: scale(.85)`, which makes the pulse's `position: fixed` resolve against the transformed box instead of the viewport. The cursor stays body-level and is excluded from the observer. So the two are drawn in different coordinate spaces and diverge by the scale factor, worst at the edges.

**The footer push puts the caption over its own subject.** Scene 1 pushes to 2.2x on the presence strip, which sits at the bottom of the window. `__zoomTo` clamps so the frame keeps covering the screen, so a target that low ends up near the bottom of the viewport — exactly where the caption is pinned at `bottom: 26px`. The shot the script calls "the essential shot" is the one the caption covers.

**The Workflow view is missing.** The provenance graph postdates the film. It is the view that shows the four collections as one graph rather than four lists, which is the thing the project is actually claiming.

**The opening caption promises four collections and the film shows two.** "Work, docs, history and memory" — Docs and Memory never appear. History does, Work does.

## Acceptance criteria

- [x] The first frame is the composed stage with real content, not a skeleton or blank page
- [x] Click pulses render concentric with the pointer, verified at more than one screen position
- [x] No caption overlaps the subject of its own shot
- [x] The Workflow view appears in the tour
- [x] Every collection the opening caption names is shown
- [x] Verified frame by frame on the produced mp4

## Activity

- 2026-08-05 09:05Z illodev@local#b2ee1fa3 · claimed
- 2026-08-05 09:22Z illodev@local#b2ee1fa3 · doing → done

## Notes

- 2026-08-05 09:22Z illodev@local#b2ee1fa3 — Four defects, four causes, all measured rather than eyeballed.

The skeleton opening was a timeline problem, not a rendering one: recording starts with the page, and `networkidle` is satisfied while the app is still drawing placeholders. The tour now waits for the stage frame and for real cards inside it, marks that moment, and ffmpeg cuts the head there — 1.5s of boot trimmed, first frame verified as the composed board at 0.6.0 with both claims in the footer.

The click pulse was being relocated. `demo-stage.mjs` moves every node added to `document.body` into `#demo-scaler` so Radix portals land inside the frame; the cursor and caption were excluded by identity, but a pulse is created per click and could not be. Inside a `scale(.85)` box its `position: fixed` resolves against the transformed ancestor, so the ring drifted with screen position. Measured against the unfixed stage at three points: offsets of (0,19), (63,-30) and (-69,62) px, parent=scaler. With an attribute-based exclusion: (0,0) at all three, parent=body.

Two constant errors hid underneath that one. The ring's 3px border sat outside its 30px box (content-box), moving its centre 3px off the point; and the pointer anchored its top-left at the event, while the arrow tip is drawn (6.6,2.6)x26/24 into its own box — so the tip pointed seven pixels past whatever it clicked. Ring is border-box now and the pointer anchors at its tip, which is what a real cursor does.

The footer caption was the clamp, not the caption. `__zoomTo` clamps so the pushed frame keeps covering the screen, and that clamp drives a low target lower still — the presence strip, the shot this film exists for, came to rest under a caption pinned to bottom:26px. The caption now reads the projected position of the push and moves to the opposite edge. Verified at t=10s: caption at top, both claims legible and uncovered.

Two scenes added, one of them a promise the film was already making. Workflow draws 46 nodes and 44 edges over the curated corpus — the only view that shows the four collections as one object. Docs and Memory were named in the opening caption and never shown; Memory's push lands on 'Markdown is canonical; there is no database', which is the project's own thesis in its own corpus.

Found while adding them: a plain `caption()` outlives its view, unlike `punchIn`, which clears its own. The Docs line was still on screen over Memory a beat and a half after the view changed. Cleared explicitly.

83s, up from ~60s.
