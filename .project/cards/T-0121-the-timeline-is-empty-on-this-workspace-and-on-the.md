---
id: T-0121
title: The Timeline is empty on this workspace and on the hosted demo
status: backlog
type: idea
priority: medium
area: ui
tags: [ui-polish, demo]
scope: [.project/cards]
created: 2026-08-02
updated: 2026-08-02
---

Measured on 2026-08-02: of the 117 cards in `.project/cards`, **zero** carry `start:` or `due:`, and none carries `milestone:`. `TimelineView` keeps `task.start || task.due` (Boards.tsx:741), so it renders its "Nothing scheduled" empty state, the nav badge reads 0, and the view header says `0 cards with dates`. The view is behaving exactly as written.

This is not only a local observation. `scripts/build-demo-data.ts` snapshots this repository's own workspace, so **workfiledemo.illodev.com has the same empty Timeline** — one of ten nav entries opens on an empty state for every visitor. The README screenshots do not show it, because `scripts/screenshot-workspace.ts` builds a fixture where every card carries `{ start, due }` and dependency edges; the marketing picture and the live demo disagree about the same view.

Three ways out, and this card is the decision, not the work:

1. **Schedule real cards.** The dates would be true, and the Timeline earns its place. Nobody has been dating cards because nothing in the workflow asks for it, so this is a habit change, not a one-off edit.
2. **Backfill dates from what a card already knows.** `created` and `updated` exist on every record; the Timeline could fall back to them when neither date is set. It would fill the view with something honest but not what the field means — a card is not scheduled just because it was written.
3. **Say so in the empty state.** The current copy ("Add a start or due date to a card") is accurate and does nothing about the demo.

The demo is the reason this matters more than it looks: it is the project's shop window, and it currently advertises a Gantt with nothing on it.

## Acceptance criteria

- [ ] A direction is chosen and recorded
- [ ] The hosted demo does not open the Timeline on an empty state
- [ ] Whatever the Timeline draws is true about the cards it draws it from
