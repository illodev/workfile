---
id: T-0192
title: Leaving a document opens an empty inspector over the list
status: done
type: bug
priority: medium
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
related: [T-0197]
scope: [packages/workfile/ui/src]
verified:
  at: "2026-08-05T23:50:17.984Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:aaf80b39b2ad866b4462797890e3bbbe62be33ce88325e51b5dc8454e226ff54"
---

Open a document, press "All documents", and the inspector drawer opens over the
list holding nothing.

The chain, confirmed by reading:

1. The button calls `onSelect("")` (`packages/workfile/ui/src/components/Docs.tsx:760`)
   — an empty string, where the intent is "no selection".
2. `selectRecord` (`main.tsx:738`) sets `selectedId` to `""`. The
   `if (id) setInspectorOpen(true)` guard is skipped because `""` is falsy, but
   `inspectorOpen` is already `true` from opening the document.
3. The drawer's condition is
   `inspectorOpen && selectedId !== null && VIEW_OWNS_DRAWER[view] !== recordCollection(selectedId)`
   (`main.tsx:1811`). `""` is not `null`, and `recordCollection("")`
   (`theme.ts:75`) falls through its prefix checks to the default `"memory"`.
   `"docs" !== "memory"` is true, so the drawer opens.

Both ends are worth fixing. `onSelect(null)` is the local bug; `recordCollection`
answering `"memory"` for an id it does not recognise is the trap that will catch
the next caller. The comment at `Docs.tsx:485` already describes the control as
one that "clears `selectedId`", which is what it was meant to do.

## Acceptance criteria

- [x] "All documents" returns to the list with no drawer and no `?record=` in the URL.
- [x] `recordCollection` does not classify an unrecognised or empty id as `memory`.
- [x] Callers relying on the old fallback are found and updated, not left to fail quietly.
- [x] A test covers the transition from an open document back to the list.

## Activity

- 2026-08-05 18:08Z illodev@local#bf4c5f67 · claimed
- 2026-08-05 18:34Z illodev@local#bf4c5f67 · doing → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done

## Notes

- 2026-08-05 18:33Z illodev@local#bf4c5f67 — Fixed at both ends and verified in a browser (Playwright against the served UI on 8899): opening a document raises no overlay, All documents leaves the inspector data-state closed with no ?record= in the URL, and the drawer still opens for a card, which is the control that proves the fix is not just a drawer that never opens. recordCollection moved from theme.ts to navigation.ts to be reachable from Node's test loader, which is also where it belongs: theme.ts opens by saying it names colours and nothing else, and this is the prefix table viewForRecord already reads. It answers null for anything that is not PREFIX-DIGIT, so memory keeps the fallback for projects with their own prefixes. The drawer's open condition is now drawerCovers(view, collection) rather than an inline !== that read true for a null as readily as for a real collection.
- 2026-08-05 18:47Z illodev@local#bf4c5f67 — CI green on PR #27 (Windows, macOS, Ubuntu; Node 22 and 24). Browser evidence stands: All documents leaves the drawer data-state closed with no ?record= in the URL, and the drawer still opens for a card.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Built UI at 900px and at 390px: the docs view opens on DOC-0005, clicking it sets ?view=docs&record=DOC-0005, and 'All documents' returns to ?view=docs with the list back (40 rows at 900, 16 at 390), no sheet content and no dialog overlay in the DOM. /api/v2/records/ with an empty or unknown id answers 404 rather than resolving as memory.
