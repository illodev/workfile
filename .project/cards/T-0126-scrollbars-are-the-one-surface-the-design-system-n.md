---
id: T-0126
title: Scrollbars are the one surface the design system never styled
status: done
type: chore
priority: low
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/styles.css]
created: 2026-08-02
updated: 2026-08-02
---

Every scroller in the app — the lanes, the rails, the table, the reading panes — renders the platform's default scrollbar. On Linux and Windows that is a 15px light-grey trough that ignores the theme entirely, so a dark workspace grows a bright gutter down the side of every column, and the board's 268px lanes lose 6% of their width to it.

The app already carries the tokens a scrollbar needs; nothing has ever pointed them at one. `scrollbar-width`/`scrollbar-color` covers Firefox and the `::-webkit-scrollbar` family covers the rest, both from the same token pair.

The thing to be careful about is that a scrollbar is also a control: styling it thin is fine, styling it invisible until hover is how a scroller stops announcing that it scrolls.

## Acceptance criteria

- [x] Scrollbars take the theme, in both palettes, on WebKit and Firefox
- [x] They stay visible enough to read as a control and to hit with a pointer
- [x] It is one declaration in the stylesheet, not a class every scroller has to remember

## Activity

- 2026-08-02 18:08Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:13Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Verified on a real scroller: computed scrollbar-width is 'thin' and scrollbar-color resolves to the border token, in both themes. Chrome prefers the standard properties over the ::-webkit-scrollbar rules when both are declared; the webkit block stays for the engines that only read it.
