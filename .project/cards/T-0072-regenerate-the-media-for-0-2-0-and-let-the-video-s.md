---
id: T-0072
title: Regenerate the media for 0.2.0, and let the video show the board reacting
status: done
type: task
priority: medium
area: ui
tags: [media, launch]
created: 2026-07-31
updated: 2026-07-31
scope: [scripts, docs/media, assets]
---

The stills and the tour predate the whole 0.2.0 interface pass: accents off the
border, the card spacing variable, the reading measure, the responsive collapse
and the Overview and Explorer work. Every frame shows the old build.

Two defects in the tour itself, reported watching it back:

1. The pointer sits pinned to the top-left corner for the opening seconds. The
   cursor element is created at `0,0` and only moves when Playwright dispatches
   its first `mousemove`, which does not happen until the third scene.
2. The most interesting thing the interface does is missing. The Overview
   rewrites its verdict as work moves — watched live during a session — and the
   tour only ever shows it standing still.

## Scope

1. `scripts/demo-video.ts`: hide the pointer until it has somewhere to be, and
   seed its position off-camera so the first glide starts from a resting point
   rather than sweeping in from the corner.
2. A live beat before the closing call to action: hold the camera on the
   verdict and drive real mutations through the running server, so the sentence
   and the counters change on screen without a reload. The stream is already
   there — `store/live.ts` over `/api/v2/events`, and the shell reloads cards on
   any `/cards/` write — so this stages the real mechanism rather than faking it.
3. `pnpm demo:shots` and `pnpm demo:video`, then replace the committed media.

## Constraint

Whatever the beat shows has to be true. The verdict is a strict ladder, worst
first, so the mutations have to move the *worst* thing on the board or the
sentence will not change at all.

## Activity

- 2026-07-31 23:21Z session-fube-triage · claimed
- 2026-07-31 23:21Z session-fube-triage · claimed
- 2026-07-31 23:34Z session-fube-triage · doing → done
- 2026-07-31 23:34Z session-fube-triage · released

## Verification

- 2026-07-31 23:34Z session-fube-triage — Done. Twenty stills regenerated against the 0.2.0 build and the six the README serves replaced, plus the video thumbnail. They now show the accents inset off the border, the board columns rounded on all four corners, and the Memory collection headers at the 8px spacing the call site asks for.

The pointer: it starts hidden and the tour parks it at 880,660 before it is ever visible, so the first glide leaves from rest instead of sweeping in from the corner. A camera push asks for it back through `__cursorRestore`, which stays silent until the tour has armed it — otherwise the very first push would have ended by revealing a pointer that had never moved. Checked frame by frame: the opening second is clean, and the pointer fades in mid-frame over the board in scene two. The old thumbnail was that exact defect frozen — the committed `demo-thumb.jpg` had the arrow pinned at 0,0 — so recutting it fixed the most-seen instance of the bug.

The live beat is real, not staged footage. Cards are transitioned on disk while the camera holds; the watcher fires, `/api/v2/events` pushes, and the shell reloads. Verified in the recording: the verdict walks '2 cards are blocked' → '1 card is blocked: T-0046 is waiting on the outside' → '11 cards are in flight: T-0028 is doing', the open tile ticks 43 → 42, and the trail gains its rows — with the two unblocks collapsed onto one line by the actor-and-minute grouping, which is the trail behaving exactly as designed on live input.

The first take framed it wrong: centred on the paragraph, which pushed its own left edge and the whole open tile out of shot. The shot is now measured — the union of the sentence and the three tiles, at whatever scale fits it with a margin — rather than an offset guessed from the middle. 61.2s, H.264, 13.6 MB.
