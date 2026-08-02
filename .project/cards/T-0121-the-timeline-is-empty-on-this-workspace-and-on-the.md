---
id: T-0121
title: The Timeline is empty on this workspace and on the hosted demo
status: done
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

- [x] A direction is chosen and recorded
- [x] The hosted demo does not open the Timeline on an empty state
- [x] Whatever the Timeline draws is true about the cards it draws it from

## Activity

- 2026-08-02 19:34Z illodev@local#aed59c5e · claimed
- 2026-08-02 20:12Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 20:02Z illodev@local#aed59c5e — Decision: a second reading, not a fallback. The chart gains a plan/actual mode; `actual` draws the `## Activity` trail.
- 2026-08-02 20:02Z illodev@local#aed59c5e — The measurement changed the question this card asks.

Of 130 cards, none carries `start`, `due` or `milestone`, and they were created
across four calendar days — 33 on 30 July, 40 on the 31st, 27 on the 1st, 30 on
the 2nd. 122 of them have `updated` equal to `created`. The eleven releases fall
on three of those same four days.

That kills option 2 by measurement rather than by taste: a fallback to
`created`/`updated` renders 122 zero-length diamonds inside a four-day window.
Not "honest but not what the field means" — unreadable *as well as* the wrong
field. It kills option 1 too, for a reason the card could not have known when it
was written: the backlog is empty, so there is no pending work left to date, and
dating cards backwards is exactly what `build-demo-data.ts` already refused to
do for claims ("inventing a claim is not the answer").

What the card did not consider is that the repository does hold timeline-shaped
truth, at a resolution nobody had looked at. Every card records its own
milestones to the minute in `## Activity`. 68 of the 71 cards in the demo
snapshot have a real interval there: median 10 minutes, longest 32 hours, 58 of
68 under an hour.

So: a second reading rather than a fallback. `plan` is the Gantt this view has
always been and is untouched. `actual` draws claimed → closed from the trail.
The distinction matters more than the feature — a bar drawn from a creation
date, sitting where a reader expects a planned start, is a lie no tooltip
undoes, whereas a chart that says it is showing what happened is simply true.
The view opens on whichever reading the workspace has data for, so a project
that schedules still gets its Gantt first.

Two consequences worth writing down.

`actual` had to override "show closed". Every card on that chart is finished by
construction, so hiding closed work empties it by definition rather than by
choice; every other filter still applies. This workspace has 1 backlog card and
1 next against 128 closed, so without the override the honest chart would have
drawn two rows.

The scale had to stop being months. Four days against a single "Aug" gridline
says nothing, so the axis picks hours below two days, days below sixteen, and
months above — three tiers, no week tier, because a week tier would be a guess
about spans this repository cannot produce.

Verified in a browser against this workspace: 128 rows on a Jul 30 → Aug 2
daily scale, the last card at 19:29 on 2 August landing at x=1397 against 1398
predicted from its timestamp, a 32-hour card measuring 302px, grouping by area
still drawing its six headers, no console errors, and the choice surviving a
trip to Docs and back.

The first pass shipped two numbers that disagreed — the sidebar read 130 while
the chart drew 128, and the empty state offered "3 cards" then delivered 128 —
because each count was measured over a different set. Both counts now come from
the caller, which is the only place that holds the rows both modes would get.
- 2026-08-02 20:12Z illodev@local#aed59c5e — On the second criterion, precisely: what is verified is that the demo snapshot draws — 68 of its 71 cards place on the chart, pinned by a test in `demo-parity.test.ts` against `demo-data.json` rather than against the source, since the snapshot is what ships. workfiledemo.illodev.com itself shows it at the next deploy; `build:demo` regenerates the snapshot from this workspace, so no committed data needed changing.
