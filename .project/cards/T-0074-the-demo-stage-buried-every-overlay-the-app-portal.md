---
id: T-0074
title: The demo stage buried every overlay the app portals to body
status: done
type: bug
priority: high
area: ui
tags: [media, launch]
created: 2026-08-01
updated: 2026-08-01
scope: [scripts, .github/media, site]
---

Reported watching the film back: a camera push held on empty backdrop with a
caption over it. The cause was two scenes deep.

`scripts/demo-video.ts` moves `#root` inside `#demo-stage`, a fixed opaque
layer at `z-index: 2147483000`. Radix portals every overlay to `document.body`,
which is outside that layer, and `SheetContent` carries `z-50` — so the
inspector sheet and the command palette painted *underneath* the stage.

Both scenes were recorded, encoded, committed and published without the thing
they exist to show:

- Scene 2 opened T-0028. The breadcrumb read `.project / cards / T-0028`, the
  app state was correct, and the drawer was invisible. The camera then pushed
  onto where it should have been, which is the empty gradient in the report.
- Scene 5 typed a query into the palette. The caption read "One search across
  everything" over a History view with no palette on screen.

The script's own comment claimed the opposite — that the stage "conveniently
keeps the app's own overlays (the palette) inside the frame". True before
[[T-0038]] moved the interface onto Radix; false and unnoticed since.

## Fix

The stage relocates each body-level portal into `#demo-scaler`, where
`position: fixed` resolves against the transformed box like the app's own
layout. Three things fall out of that and all three had to be handled:

1. Re-parenting blurs the moved subtree's focus, and these overlays autofocus.
   The palette lost its caret and the tour typed into nothing.
2. React unmounts a portal by calling `removeChild` on the container it was
   given. Moving the node makes that throw inside cleanup and takes the tree
   down — closing the palette left the nav unreachable for the rest of the run.
3. A push centred near an edge slid the window off screen. `__zoomTo` now
   clamps, so the worst case is an off-centre subject rather than none.

## Also found

The app formats dates through `Intl` with no locale, so a capture inherits the
machine's. Invisible all through July — spelled the same in both languages —
and the first August run wrote "1 ago" into an English film. Both capture
scripts pin `en-US`; the app is left alone, because a Spanish workspace should
keep Spanish months.

## Activity

- 2026-08-01 00:14Z session-fube-triage · claimed
- 2026-08-01 00:14Z session-fube-triage · claimed
- 2026-08-01 00:20Z session-fube-triage · doing → done
- 2026-08-01 00:20Z session-fube-triage · released

## Verification

- 2026-08-01 00:20Z session-fube-triage — Fixed and verified frame by frame. The inspector drawer now renders — properties, claim, scope, references, backlinks, activity — and the push at 0:13 lands on the CLAIM row instead of on gradient. The palette renders with real results: typing 'watcher' returns four across cards, docs, memory and history, where the shipped film showed a History view and a caption about a search nobody could see.

Three follow-on defects surfaced while fixing it, each only visible because the previous one was fixed:

1. Relocating the portal blurred it, so the palette opened with no caret and the tour typed into nothing. Focus is captured and restored across the move, and the tour types into the located input rather than at whatever holds focus.
2. Closing the palette then killed the app. React unmounts a portal by calling `removeChild` on the container it was given, and the node was no longer there — the throw landed inside cleanup and took the tree with it, which is why the run died reaching for the nav. `removeChild` is made tolerant in the stage, where the lie is told.
3. `__zoomTo` centred blindly, so a target near an edge slid the window off screen. It clamps now: the worst case is an off-centre subject rather than no subject.

The stage moved to `scripts/demo-stage.mjs`. It is browser code and was being typechecked as Node, which is why the strict ratchet carried 32 unresolved-name errors for this file and had stopped reading them — the bug above lived in exactly that blind spot. Loaded by path like `hooks.mjs`, for the same stated reason. `demo-video.ts` is now clean at zero, and the baseline goes 637 → 615 across 59 files.

Rejected on the way: `/// <reference lib="dom" />` looked like a one-line fix and dropped the program by 65, but the per-file diff showed `schema-parity.test.ts` going 12 → 28. It changes what typechecks everywhere, in both directions, which is not a local fix dressed as one.

Runtime: `pnpm check` green at 182 + 7, ratchet 615 none new; video 59.6s H.264. Media reinstalled in both places from this take, so the README thumbnail, the landing poster and the film are all frames of the same recording.
