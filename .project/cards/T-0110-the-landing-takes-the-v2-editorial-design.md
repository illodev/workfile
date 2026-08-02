---
id: T-0110
title: The landing takes the v2 editorial design
status: review
type: feature
priority: medium
area: docs
created: 2026-08-02
updated: 2026-08-02
scope: [site]
---

`Workfile Landing v2.dc.html` is a Claude Design artifact: numbered sections, a 180px margin label per section, monospace furniture and a hairline rule system, replacing the centered card-grid landing at `site/index.html`.

Porting it is not a copy. The artifact runs inside the DC runtime (`support.js`, `<x-dc>`, `{{ }}` bindings, `style-hover` attributes, a `theme` prop that stamps `data-wf-theme`). The deployed landing is plain static HTML on Vercel with `outputDirectory: "."`, so every one of those has to become real CSS, real markup and a few lines of vanilla JS.

## What has to change on the way in

- Asset names differ: the artifact wants `geist.woff2`, `geist-mono.woff2`, `flow-light.png`, `history-light.png`; the deployed names are `geist-latin-wght-normal.woff2`, `geist-mono-latin-wght-normal.woff2`, `flow.png`, `history.png`.
- The theme prop must become `prefers-color-scheme`, which is what the current landing ships.
- The artifact previews at 1440px only. It needs breakpoints, or the two-column grids collapse into unreadable columns on a phone.
- The SEO head — title, canonical, OG, Twitter card, inline SVG favicon — exists only in `site/index.html` and must survive.

## The commands in the artifact are fictional

The agent-session terminal shows `workfile claim T-0142 --paths` and `workfile done T-0142 --evidence ci:run/8841`. Neither exists. Verified against the built CLI:

- `workfile card claim T-0142 --scope src/api` → `T-0142 claimed by claude-code`
- `workfile card transition T-0142 done` on a card with unchecked criteria → `CARD_ACCEPTANCE_UNMET: ... has 2 unproven acceptance criteria`
- touching a card another actor holds → `CARD_CLAIM_OWNER_MISMATCH: T-0002 is claimed by other-agent. Pass force with a reason to take it over.`
- `workfile mcp inspect --json` reports exactly 30 tools, so the "30 tools" figure holds.

The landing ships the real commands and the real refusals.

## Acceptance criteria

- [x] `site/index.html` renders the v2 layout with no DC runtime and no `support.js`
- [x] Every asset path resolves against `site/assets/`
- [x] Light and dark both readable; layout holds from 360px to 1440px
- [x] Every command and error code shown is one the built CLI actually produces
- [x] Verified in a browser, not only by reading the markup

## Activity

- 2026-08-02 11:13Z illodev@local#849a844d · claimed
- 2026-08-02 11:24Z illodev@local#849a844d · doing → review

