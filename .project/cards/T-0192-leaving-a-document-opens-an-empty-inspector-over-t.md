---
id: T-0192
title: Leaving a document opens an empty inspector over the list
status: backlog
type: bug
priority: medium
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
related: [T-0197]
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

- [ ] "All documents" returns to the list with no drawer and no `?record=` in the URL.
- [ ] `recordCollection` does not classify an unrecognised or empty id as `memory`.
- [ ] Callers relying on the old fallback are found and updated, not left to fail quietly.
- [ ] A test covers the transition from an open document back to the list.
