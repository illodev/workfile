---
id: T-0110
title: The landing takes the v2 editorial design
status: done
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
- 2026-08-02 20:38Z illodev@local#aed59c5e · claimed
- 2026-08-02 20:43Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 20:43Z illodev@local#aed59c5e — Verified in a browser rather than by reading the markup, which is what the last
criterion asked for. Served from `site/` over HTTP so relative paths resolve the
way Vercel serves them, at 360, 768, 1024 and 1440 in both colour schemes.

    scheme  width   bg                        overflow   requests
    light   360px   oklch(0.982 0.002 264)      0px       all 200
    light   768px   oklch(0.982 0.002 264)      0px       all 200
    light  1024px   oklch(0.982 0.002 264)      0px       all 200
    light  1440px   oklch(0.982 0.002 264)      0px       all 200
    dark    360px   oklch(0.16 0.008 264)       0px       all 200
    dark    768px   oklch(0.16 0.008 264)       0px       all 200
    dark   1024px   oklch(0.16 0.008 264)       0px       all 200
    dark   1440px   oklch(0.16 0.008 264)       0px       all 200

Zero horizontal overflow at every width, both themes rendering their own
background, no console errors, no failed request. `prefers-color-scheme` is
doing the work the DC `theme` prop used to.

Readability measured rather than eyeballed: 83 text nodes per theme, each
against the colour actually behind it, walking up past transparent ancestors.
Worst case 6.57:1 in light and 6.43:1 in dark, against WCAG AA thresholds of
4.5 for body text and 3.0 for large. Nothing below AA in either.

The first measurement was wrong and is worth recording as such: the page is
authored in `oklch()`, which `getComputedStyle` returns verbatim, so parsing
the numbers out as RGB produced a ratio of exactly 1.00 for all 83 nodes. A
uniform, implausible answer rather than a wrong-looking one. Redone by painting
each colour onto a 1x1 canvas and reading the pixel back, which is the only
conversion that cannot disagree with what the browser shows.

Re-checked what the page asserts, against the CLI built at 0.4.0 rather than
the one that existed when this was written: `workfile init`, `card claim`,
`card transition` and `agents context --card` all resolve; `CARD_ACCEPTANCE_UNMET`
and `CARD_CLAIM_OWNER_MISMATCH` are both raised in `modules/cards/mutations.ts`;
and `mcp inspect --json` still reports exactly 30, which is the figure the page
prints.

One defect found and fixed. The footer linked `github.com/illodev/workfile/tree/main/docs`,
which is a 404 — there is no top-level `docs/` in this repository, the documents
live under `.project/docs`. The header nav had already settled what the word
means on this page, linking the demo Docs view, so the footer now matches it.
Confirmed live: the old target returns 404, the new one is the same URL the
header has been serving all along.

Six local asset references, all resolving under `site/assets/`; six external
references, all links, no external script or font.
