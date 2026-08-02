---
id: ADR-0009
title: The brand blue is the one token that leaves the zinc scale
status: accepted
related: [ADR-0005, T-0123]
scope: [packages/workfile/ui/src/styles.css]
created: 2026-08-02
updated: 2026-08-02
---

## Context

[[ADR-0005]] adopted shadcn/ui with zinc as published — "no re-tinting of generated components" — and named three **accepted losses** so nobody would relitigate them mid-migration: the 13px base, the top-to-bottom readability of one stylesheet, and *the brand blue as primary action colour*.

The migration shipped. On 2026-08-02 the owner reopened the third one, which is the only way that list was ever meant to be reopened: from the other side of the work, not during it.

The cost it had been paying is a split identity. The landing, the favicon and the README banner are `#3149d4`; the app's primary action was zinc's near-black in light and near-white in dark. Someone arriving from the landing met a different product, and the one control on every screen that means "do the thing" was the one that said nothing about whose product it is.

## Decision

`--primary` and `--primary-foreground` carry the landing's accent in both themes. Nothing else moves.

- Light: `oklch(0.483 0.213 268.83)` — `#3149d4` exactly, verified by painting the button's computed colour to a canvas and reading `rgb(49, 73, 212)` back.
- Dark: `oklch(0.74 0.14 264)` over `oklch(0.17 0.02 264)`, the pair the landing already ships for its own dark mode.

This is a **narrowing of ADR-0005's rule 2, not a repeal of it.** That rule reads "shadcn's look wins, with one named exception" — the semantic namespaces. There are now two named exceptions, and the second one is a single token pair. Everything else in the zinc scale stays as the registry publishes it, and a `shadcn add` that rewrites a component still lands correctly, because a component asking for `bg-primary` is asking for a token, not for a colour.

The semantic namespaces do **not** take the brand hue. `--status-*`, `--priority-*` and `--sev-*` carry meaning; brand identity is not one of the things a reader is being asked to decode from a colour.

## Consequences

- Everything that reads as "the primary action" follows without being touched: the New card button, checked checkboxes, the facet meters, progress, record ids, wikilinks, release tiles, the board's drop target.
- Contrast was checked rather than assumed: 6.9:1 for white on the light blue, and the dark pair is the landing's own, already in production.
- ADR-0005's accepted-loss list is now one item shorter. The other two — the 13px base and the single stylesheet — stay lost, and this decision is not an argument for reopening them; it is the record of what it took to reopen one.
- `design-system.test.ts` needs no change and got none: it forbids colour literals in `ui/src` **components**, and the stylesheet is where tokens are declared. The mark added to the sidebar in [[T-0122]] strokes `currentColor` for the same reason.
