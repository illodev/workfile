---
id: T-0048
title: "Overview takes the landing view: four call sites must move together"
status: backlog
type: task
priority: medium
area: ui
created: 2026-07-31
updated: 2026-07-31
---
## Notes

- 2026-07-31 17:51Z claude-opus-7c645bf5 — Split out of T-0047, which shipped the Overview at `?view=overview` deliberately rather than moving the landing view in the same change. The view should live with a release before it becomes the front door, and the swap is not a one-line default: four call sites disagree the moment they drift apart.

query.ts:31 reads the view and falls back to "explorer" when the parameter is missing or unknown; query.ts:68 writes the parameter only when the view is not "explorer". They encode the same default from opposite directions, so moving one without the other produces a URL the reader cannot round-trip - the Overview would either be unreachable by default or would write ?view=overview forever.

Explorer is imported eagerly at main.tsx:80 precisely because it is the landing view; the comment above the loaders map says so. Demoting it means a loaders.explorer entry, a lazy() wrapper, a VIEW_MODULE entry so hover and focus still prefetch it, and promoting Overview to the eager import in its place - otherwise the first paint of the new front door waits on a chunk.

test/schema-parity.test.ts asserts a bare query URL, and three demo links in site/index.html carry no view parameter, so today they mean "the table" and would silently come to mean "the dashboard". The screenshot script enumerates views in order and would reorder its output.

Decide after 0.1.8 has been in use, not before.
