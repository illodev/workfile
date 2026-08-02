---
id: T-0118
title: A memory record opens in the drawer, like a card
status: done
type: feature
priority: medium
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/Memory.tsx, packages/workfile/ui/src/components/RecordDrawer.tsx, packages/workfile/ui/src/main.tsx]
created: 2026-08-02
updated: 2026-08-02
---

Opening a card raises the overlay drawer the shell owns: it slides in from the right, leaves the board interactive underneath, and can be widened to a reading width. Opening a memory record grows a 380px card inside the lanes instead, which is a different answer to the same question — the record is the same kind of thing, and reading it should feel the same.

The inline panel also costs the lanes their width exactly when the reader needs it, and below `lg` it hides them outright, so browsing record to record means going back to the lanes each time.

The drawer chrome lives inline in `main.tsx` today (portal, `forceMount`, the dismissal guards, the maximize toggle). Extracting it is the actual work; Memory then becomes a second caller rather than a second implementation.

One behaviour the extraction must keep: the drawer is non-modal and outside interactions dismiss it, so a record-opening click arriving as a deferred outside event must not close the drawer it just opened, and a dialog raised from inside the drawer must not read as "outside".

## Acceptance criteria

- [x] A memory record opens in the same drawer a card opens in, with the same geometry and the same maximize toggle
- [x] The lanes keep their full width while a record is open, at every viewport
- [x] Clicking another tile retargets the drawer instead of closing it
- [x] The edit, graduate and supersede dialogs still work from inside the drawer
- [x] The drawer chrome is written once and used by both callers

## Activity

- 2026-08-02 18:13Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:32Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:31Z illodev@local#c0b2d745 — Verified at runtime against this repository's own workspace (1600x950, both themes, Playwright over the real server), not the screenshot fixture: the record opens in a 480px drawer, the lanes keep their 272px behind it at every viewport, another tile retargets the drawer instead of closing it, maximize matches the inspector, and the edit dialog opens and closes without taking the drawer with it.

Found while verifying, and fixed here: one Escape reached two levels at once. The shell's global handler cleared the selection while the dialog's own layer was closing, so dismissing a form took the record it belonged to off the screen. The first fix — querying the DOM for an open dialog — does not work, and the reason is worth keeping: Radix's layers listen in the capture phase and React flushes the resulting state update synchronously for a discrete event, so by the time a bubble-phase listener runs the dialog it should have found is already unmounted. The honest signal is `event.defaultPrevented`, which Radix sets on the key it consumed.

Consequence, deliberate: Escape on a drawer with nothing above it now closes the drawer and leaves the record selected; a second Escape clears the selection. Recorded in CHG-0078.
