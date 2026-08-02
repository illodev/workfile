---
id: CHG-0089
title: The timeline draws what happened, not only what was planned
type: added
area: ui
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0121]
---
The timeline has a second reading. `plan` is the Gantt it has always been —
`start` and `due`, unchanged. `actual` draws the stretch each card recorded
about itself: the first and last entries of its `## Activity` trail, which is
when the work was claimed and when it closed. The view opens on whichever
reading the workspace has data for, so a project that schedules still gets its
Gantt first.

A mode rather than a fallback, and the distinction is the point. Filling an
empty chart from `created` would put a bar where a reader expects a planned
start, and no tooltip undoes that. A chart that says it is drawing what
happened is simply true — and a workspace that schedules nothing is not a
workspace where nothing happened, which is what the view had been saying.

`actual` shows closed cards even when "show closed" is off. Every card on that
chart is finished by construction, so applying the filter empties it by
definition rather than by choice; every other filter still applies.

The scale follows the data instead of always being months: hours below two
days, days below sixteen, months above. A four-day project against a single
"Aug" gridline said nothing about when anything happened.
