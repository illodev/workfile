---
id: CHG-0087
title: The timeline remembers how you grouped it
type: changed
area: ui
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
Choosing how the timeline is grouped used to last until you looked at anything
else. The view is unmounted when you leave it, so the choice went with it and
came back as `none`.

It is kept now, beside the flow board's collapsed columns and for the same
reason: the preference belongs to the person, not the session. It survives
leaving the view and reloading the page.

Not in the address bar, deliberately. The URL carries what you are looking at —
the view, the open record, the filters that decide which cards are on screen.
Grouping decides none of that: every scheduled card stays on the chart either
way. A grouped timeline is therefore not a different thing to look at, and a
link to one would be a link to your preferences.

A remembered grouping that names an axis the project does not declare falls
back to `none` rather than leaving the chart grouped by nothing — which is what
happens when the same browser opens a different workspace.
