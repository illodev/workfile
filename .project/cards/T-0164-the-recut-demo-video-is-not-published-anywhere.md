---
id: T-0164
title: The recut demo video is not published anywhere
status: blocked
type: task
priority: medium
area: docs
created: 2026-08-05
updated: 2026-08-05
scope: [site, scripts/screenshots.ts, .github/media, README.md]
---

T-0163 recut the film, but nothing downstream points at the new file.

`artifacts/` is gitignored, so `artifacts/demo-video/workfile-demo.mp4` exists only on the machine that rendered it. The README embeds the old cut through a GitHub user-attachments URL (README:26), which is content GitHub hosts and not a path in this repository — so it cannot be updated by editing a file. Someone has to upload the new mp4 to GitHub and replace the URL.

`.github/media/demo-thumb.jpg` is the old cut's thumbnail and now shows a frame the film no longer opens on.

The stills under `.github/media/` are a separate staleness: `flow.png` and the rest were captured at 0.3.0 and the package publishes 0.6.0. `pnpm run screenshots` regenerates them.

## Acceptance criteria

- [ ] The README plays the recut film, not the old one
- [x] The thumbnail is a frame from the cut it introduces
- [x] The stills carry a version that matches what npm serves

## Activity

- 2026-08-05 09:33Z illodev@local#b2ee1fa3 · claimed
- 2026-08-05 09:42Z illodev@local#b2ee1fa3 · doing → blocked

## Notes

- 2026-08-05 09:42Z illodev@local#b2ee1fa3 — Site and stills done; the README embed is the one thing that cannot be done from a checkout.

The landing page carries the recut film. `site/assets/workfile-demo.mp4` is the 83s cut, and `site/assets/demo-poster.jpg` is its first frame — which is worth something now that the first frame is the composed board rather than a skeleton: the poster is what the page shows before anyone presses play, and what a link preview picks up. `.github/media/demo-thumb.jpg` regenerated the same way.

The video block's copy was wrong before this change and would have got worse: it said 'A forty-second tour' over a 59s film, and now describes 83 seconds and names the scenes that exist. Worth noticing that the number drifts every recut and nothing checks it.

Stills recaptured at 0.6.0 from the curated corpus, all 2880x1800: overview, explorer, timeline, history, flow, memory-dark for `.github/media`, and flow, history for the landing page. `site/assets/overview.png` was refreshed too, though nothing references it — the landing page loads only flow, history, the poster, the mp4 and two fonts.

`scripts/screenshots.ts` was missing `workflow` entirely, so the view had never been captured by the safety net this file exists to be. Added in nav order, and `.github/media/workflow.png` is new.

Writing the README caption for it surfaced T-0165: the graph draws 46 nodes and 44 edges and every one of them is a card, because the curated corpus declares no frontmatter relation from a doc or a memory record to a card. The caption was rewritten to describe the picture, and the tour's caption with it — it had claimed 'Cards, docs, releases and memory' over a shot showing cards.

Not done: README:26 embeds the old cut through a GitHub user-attachments URL. That is content GitHub hosts, not a path in this repository, so no edit here can change it — the mp4 has to be uploaded to GitHub (drag it into an issue or PR comment) and the URL swapped. `artifacts/` is gitignored, so the file to upload is `site/assets/workfile-demo.mp4`.

doctor 0/0, strict ratchet unchanged at 549 known errors.
