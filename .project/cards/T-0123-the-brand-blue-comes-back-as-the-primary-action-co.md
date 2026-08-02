---
id: T-0123
title: The brand blue comes back as the primary action colour
status: done
type: feature
priority: medium
area: ui
tags: [ui-polish, brand]
scope: [packages/workfile/ui/src/styles.css]
related: [T-0038]
created: 2026-08-02
updated: 2026-08-02
---

[[ADR-0005]] adopted zinc as published and listed "the brand blue as primary action colour" among the **accepted losses** — named up front so nobody would relitigate it mid-migration. The migration has shipped; the owner is reopening it deliberately, which is the one way that list was ever meant to be reopened.

What it costs today: the app's primary action is near-black in light mode and near-white in dark, while the landing, the favicon and the README banner are all `#3149d4`. Someone arriving from the landing meets a different product.

Only `--primary` and its foreground move. The three semantic namespaces do not: status, priority and severity carry meaning, and a brand colour is not one of them. Everything that reads as "the primary action" follows automatically — the New card button, checked checkboxes, progress, record ids, wikilinks, the drop target on the board.

The landing already ships both halves of the pair, and they are what this takes: `#3149d4` on light, a lightened blue on dark so the contrast survives the inversion.

Because it reverses a named decision, the reversal is recorded rather than silently applied.

## Acceptance criteria

- [x] `--primary` and `--primary-foreground` carry the landing's accent in both themes
- [x] The semantic namespaces are untouched
- [x] Contrast holds for text on primary in both themes
- [x] The reversal of ADR-0005's accepted loss is recorded as a decision

## Activity

- 2026-08-02 18:07Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:08Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Measured rather than eyeballed: the New card button's computed background painted to a canvas reads rgb(49, 73, 212) — #3149d4 exactly, the landing's accent. Dark mode takes the landing's own dark pair. White on the light blue is 6.9:1.

ADR-0009 records the reversal of ADR-0005's accepted loss, and why it is a narrowing of that decision's rule 2 rather than a repeal: there are now two named exceptions to zinc, and the second is a single token pair.
