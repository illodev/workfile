---
id: T-0064
title: The index counter spins a loader that never resolves
status: done
type: bug
priority: high
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/main.tsx]
created: 2026-07-31
updated: 2026-07-31
---

`main.tsx:1557` renders a `Spinner` next to "index N records" in the activity
footer. There is no loading state behind it: `indexedTotal` (`:967`) is a plain
sum of counts already in hand, and the spinner is rendered whenever that sum is
non-zero. It therefore animates forever, on every view, in every workspace —
reported from this repository and from Fube.

A spinner that never stops is worse than no spinner: it claims the app is
busy, so anything genuinely slow becomes invisible.

## Scope

Drop the spinner, or replace it with a mark that means what it shows. If the
count is worth an icon at all it should be a static one; if the intent was to
signal a rebuilding index, it needs to be wired to something that actually
reports progress.

## Activity

- 2026-07-31 21:46Z session-ui-polish · claimed
- 2026-07-31 21:53Z session-ui-polish · doing → done

## Verification

- 2026-07-31 21:53Z session-ui-polish — Replaced with a static Database icon; the Spinner import is gone from main.tsx. Runtime: screenshotted the built UI against the fixture workspace, footer reads "index 94 records" with a still mark. The card asked whether it should instead be wired to real progress — it should not: there is no index rebuild the client can observe from here, and inventing one to justify an icon would be backwards.
