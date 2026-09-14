---
id: T-0261
title: The site header wraps into two ragged rows on a phone
status: done
type: bug
priority: high
area: docs
source: .project/cards/T-0259-the-site-addresses-the-agent-reading-it-and-gives-.md
scope: [site, scripts/build-site.ts]
raised: reported
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-14
updated: 2026-09-14
verified:
  at: "2026-09-14T22:25:10.618Z"
  method: manual
  commit: d79226f835d1c6105e208481fee2e80d5113a035
  digest: "sha256:1d1a44c4ea2f8f1bfdc229946e4c15ca972b591aaf419636ecf84daf48d7e01d"
---

Reported by the owner on 2026-09-15: the header of the site looks poor on a phone.

The bar was built as one flex row that wraps. At 360–390px the landing breaks it into a row holding the mark and the reader switch, and a second row of links hanging from the left edge; the docs and comparison pages wrap their four links the same way. The bar is sticky, so the extra row is paid on every screen, and the hero's `min-height: calc(100svh - var(--bar))` assumes a single 52px row.

## Acceptance criteria

- [x] At 360 and 390px the header of the landing, a docs page and a comparison page is a single row, with the site links reachable from it
- [x] The header at 1024 and 1440px looks as it did
- [x] The site links stay in the HTML a crawler reads, and are visible without JavaScript
- [x] No element is clipped past the viewport from 360 to 1440px in either scheme
- [x] Verified on the deployed site

## Activity

- 2026-09-14 22:12Z illodev@local#b67ed9cd via:undeclared/xhigh · claimed
- 2026-09-14 22:25Z illodev@local#b67ed9cd via:undeclared/xhigh · doing → done

## Notes

- 2026-09-14 22:18Z illodev@local#b67ed9cd via:undeclared/xhigh — At 761px and below the bar is one row: the mark, the reader switch on the landing, and a menu button; the four site links fold into a full-width panel under the bar, closed by a link, by Escape, and by growing past 760px. The button and the folding only apply once an inline head script sets .js on the root, so without JavaScript the links stay in the bar. Measured with headless Chromium against the regenerated site: at 360 and 390px, light and dark, on the landing, /docs/mcp and /vs/beads, no link is visible closed, all four open, none after Escape, and nothing in the bar crosses the viewport; with JavaScript disabled at 390 and 1440px all four links are visible. The context meter on the landing wrapped under the bar at 768px before this change as well; it now hides below 900px, and the 768, 1024 and 1440px captures show a single row matching the previous desktop header. The clipping scan over 7 pages, 5 widths, both schemes and both reader modes found nothing in 80 renders. Left: criterion 5, the deployed site.
- 2026-09-14 22:25Z illodev@local#b67ed9cd via:undeclared/xhigh — Verified on production, workfile.illodev.com at d79226f, merged from PR #47 with CI green on ubuntu, macOS and Windows for Node 22 and 24. Headless Chromium against the live site, on the landing, /docs/mcp and /vs/beads at 360 and 390px in both schemes: the bar is one row, no site link shows with the menu closed, all four show open, none after Escape, nothing in the bar crosses the viewport. At 768, 1024 and 1440px the links sit in the bar and the menu button is hidden. With JavaScript disabled at 390 and 1440px all four links are visible. The clipping scan over 7 pages, 5 widths, both schemes and both reader modes found nothing in 80 renders.
- 2026-09-14 22:25Z illodev@local#b67ed9cd — manual verification: Production at d79226f (PR #47, CI green on all runners): headless Chromium on the landing, a docs page and a comparison page — one-row bar at 360 and 390px with the menu opening, closing and closing on Escape; links in the bar and no button at 768 to 1440px; links visible with JavaScript off; no clipping in 80 renders across 7 pages, 5 widths, both schemes and both reader modes.
