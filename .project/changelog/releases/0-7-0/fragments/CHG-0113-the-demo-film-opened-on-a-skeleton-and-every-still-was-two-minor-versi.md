---
id: CHG-0113
title: The demo film opened on a skeleton, and every still was two minor versions old
type: fixed
area: docs
visibility: public
created: 2026-08-05
updated: 2026-08-05
cards: [T-0163, T-0164]
---
The launch film opened on the app's loading state. Recording starts with the page and `networkidle` is satisfied while the board is still drawing placeholders, so the first frames — the ones a feed freezes into a thumbnail — showed an unfinished product. The tour now waits for the composed stage and real cards, and the head is trimmed there.

Click pulses were drawn somewhere the pointer was not. The stage relocates every node added to `document.body` into a `scale(.85)` box so Radix portals land inside the browser frame, and a pulse is created per click, so it could not be excluded by identity the way the cursor and caption were. Inside the transformed box its `position: fixed` resolved against the wrong ancestor: measured offsets of 0 to 69 px, varying with screen position. Two constant errors sat underneath — a border outside the ring's box, and a pointer anchored by its corner rather than its tip.

The closest shot in the film captioned over its own subject. Pushing into the presence strip clamps the frame to keep it covering the screen, which drives a low target lower still, straight under a caption pinned to the bottom edge. The caption now reads the projected position of the push and moves to the opposite edge.

The film also promised four collections in its opening line and showed two. Docs, Memory and the Workflow graph are in the tour now.

Every still under `.github/media` was captured at 0.3.0 against a package that publishes 0.6.0, and `scripts/screenshots.ts` had never listed `workflow` at all — so the view that draws the record graph was missing from the README, the landing page, and the regression net the script exists to be. Recaptured, with the view documented and added to the gallery.
