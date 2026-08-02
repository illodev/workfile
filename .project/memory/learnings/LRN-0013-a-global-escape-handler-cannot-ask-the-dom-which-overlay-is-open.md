---
id: LRN-0013
title: A global Escape handler cannot ask the DOM which overlay is open
status: active
category: ui
confidence: high
related: [T-0118]
scope: [packages/workfile/ui/src/main.tsx]
created: 2026-08-02
updated: 2026-08-02
---

The shell keeps a document-level Escape handler as the floor under the Radix layers: with nothing open, Escape clears the selection. When the memory record moved into the shared drawer, one Escape started reaching two levels at once — the dialog raised over a record closed *and* the selection behind it was cleared, so the record the form belonged to left the screen with it.

The obvious guard does not work, and the reason generalises:

```js
// Always finds nothing, exactly when a layer DID handle the key.
if (document.querySelector('[role="dialog"][data-state="open"]')) return;
```

Radix's DismissableLayer listens in the **capture** phase, and only the highest layer listens at all. React flushes the resulting state update synchronously because a keydown is a discrete event, so the dialog has already unmounted by the time a bubble-phase listener runs. The DOM query is asking about a layer that no longer exists.

What is true at that moment is `event.defaultPrevented`: DismissableLayer calls `preventDefault()` on the key it consumed. A floor handler should test that and step aside.

```js
if (event.defaultPrevented) return;   // something above already answered
```

The consequence to accept deliberately: Escape now closes one level per press. The drawer closes and the record stays selected; a second Escape clears the selection. That is the behaviour everything else with stacked overlays has, and it is the price of not letting one key tear down two layers.

The same reasoning applies to any handler that wants to know whether an overlay is open *right now* from inside an event that may already have closed it.
