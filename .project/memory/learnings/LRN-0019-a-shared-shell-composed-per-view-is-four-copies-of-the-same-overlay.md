---
id: LRN-0019
title: A shared shell composed per view is four copies of the same overlay
status: active
created: 2026-08-04
updated: 2026-08-04
related: [T-0156, ADR-0005, T-0155]
confidence: high
scope: [packages/workfile/ui/src]
---
`RecordDrawer` was shared and the thing around it was not. Four views each
composed it with their own selection, their own close, their own typography
and their own idea of which record kinds they could show. That reads as reuse
and is not: what was shared was the chrome, and every decision the chrome does
not make was made four times, differently.

Adding the fourth copy for [[T-0156]] reproduced, in one sitting, every defect
the other three already had:

| Symptom | What it actually was |
|---|---|
| Clicking a node did not mark it | a private `openId` beside the app-wide `selectedId` |
| Two drawers stacked | two places deciding to open |
| `?record=` survived closing | each sheet closing its own way |
| The same record changed size | each sheet setting its own type scale |
| A doc link closed the sheet | each sheet knowing one kind |

Every one of those was reported from the browser. None was caught by a test,
and none would have been: they are not logic errors, they are the same
decision taken independently in four places and drifting.

## The shape that fixed it

One drawer at the top, opened by the app-wide selection, dispatching content
on the record kind. A panel per kind rather than one generic reader, because a
decision has a lifecycle to act on and a document has a status and a path, and
none of that survives being rendered as \"a record with a body\".

Two details that made it affordable. The panels are lazily imported from the
chunks their own views already pull, so the entry bundle does not grow to
render something most sessions never open. And a view keeps its own surface
only where the shape genuinely differs — Docs is a list *beside* a document
rather than over it, which is right for the one view whose job is reading
something long, so the shared drawer stands down there and nowhere else.

## The test that would have caught it earlier

None of the five, directly. But the same session produced one that catches the
class one level up: `View` gained `workflow` and the runtime list in `query.ts`
did not, and an unrecognised view falls back rather than failing — so reloading
on the graph quietly answered with a different view. Two lists that must agree
with no compiler saying so is the same defect as four drawers that must agree
with no compiler saying so. Where a rule exists twice, pin the pair.
