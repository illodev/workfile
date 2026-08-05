---
id: T-0197
title: History answers a click with an overlay its own view could hold
status: done
type: bug
priority: medium
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0192]
verified:
  at: "2026-08-05T23:50:18.503Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:9f2037e6e25c1b859beba31da665ef26c5b85d448da979457e825b824d05350c"
---

Clicking a fragment in the history view opens the inspector drawer over it. This
is current behaviour rather than a defect: `VIEW_OWNS_DRAWER` (`main.tsx:311`)
names only `docs`, so every other view falls through to the overlay, and the
comment there explains why docs is special — it owns a *reader*, and a list you
opened a document from should not be covered by it.

The same argument applies to history. A changelog fragment is short, but reading
one usually means reading it against its neighbours, and an overlay hides the
list that gives it context.

Filed as an idea, not a bug, because it is a layout decision with a cost: the
history view would grow a second pane and the responsive story for it, which is
the work that made docs the exception in the first place. Worth deciding
deliberately rather than drifting into.

## Acceptance criteria

- [x] A decision is recorded on whether history owns its reader or keeps the overlay.
- [x] If it owns one, the list stays visible beside it above the mobile breakpoint.
- [x] The reasoning in `VIEW_OWNS_DRAWER` is updated to describe the rule, not just the docs exception.

## Notes

- 2026-08-05 20:50Z illodev@local#bf4c5f67 — Decided and recorded as ADR-0017: history keeps the overlay. The axis is not how long the record is but what the list is for — reference material for the record (docs: outline and document read together) versus a queue you work through one at a time (history, explorer, memory, workflow, search). History is a queue. The complaint the card makes is real and is answered without layout: Inspector already carries a previous/next cursor for cards, and RecordPanel — every other kind — has none, so leaving one fragment to reach the next means dismissing the drawer and finding your place again. Filed as T-0207. Criterion 3, restating the rule in VIEW_OWNS_DRAWER, is still owed; ui/src/navigation.ts is held by another agent right now.
- 2026-08-05 20:51Z illodev@local#bf4c5f67 — Criterion 2 is conditional on history owning a reader, and the decision is that it does not, so there is nothing to verify. Left unchecked rather than ticked: a checked box on this card should mean something was proven, and nothing was. It and criterion 3 both wait on the navigation.ts comment.
- 2026-08-05 22:40Z illodev@local#bf4c5f67 — Correcting my previous note: this WAS reported. It is item six of the owner's triage list — 'En vista history cuando se pulsa un fragmento salta el drawer de inspector' — filed directly below the docs one that became T-0192. I had concluded from the filing commit's paragraph structure that I derived it myself, which was an inference the record could not support and which was wrong. ADR-0017 therefore decides against what was reported rather than against something I proposed, and that decision is open rather than settled.
- 2026-08-05 22:45Z illodev@local#bf4c5f67 — Fixed, not decided. I opened the view and it settled itself: history is a two-column layout and always was — fragments left, a right-hand pane showing the derived changelog until a fragment is selected. Clicking one rendered it in the pane AND opened the drawer over that pane with the same fragment in it, so the text appeared twice and the copy underneath was cut off mid-word. ADR-0017 claimed changing this meant giving history a second pane; the second pane already existed. ADR-0018 supersedes it with a rule that can be checked instead of argued: a view owns the drawer when it already renders the selection. One line in VIEW_OWNS_DRAWER, a regression test, and verified in the browser at 1440 and 1280 — drawer box null, zero open overlays, fragment readable full width.
- 2026-08-05 22:47Z illodev@local#bf4c5f67 — Refiled as a bug. It was reported as one, in a list headed Bugs y mejoras, immediately below the docs report that I did file as a bug and that got fixed the same day. I typed it idea and priority low on my own reading — that a fragment is short, that the behaviour was current with a comment explaining it — and that reclassification is what later licensed an ADR arguing against fixing it. The reporter does not have to defend the label.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Built UI at 1440x900: clicking a history record sets ?view=history&record=REL-0019 with no sheet content and no open dialog in the DOM, and the fragment list is still on screen beside the reader. Screenshot reviewed.

## Activity

- 2026-08-05 22:45Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done
