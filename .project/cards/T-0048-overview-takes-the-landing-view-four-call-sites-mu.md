---
id: T-0048
title: "Overview takes the landing view: four call sites must move together"
status: done
type: task
priority: medium
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/query.ts, packages/workfile/ui/src/main.tsx, packages/workfile/test/schema-parity.test.ts, site/index.html]
---
## Notes

- 2026-07-31 17:51Z claude-opus-7c645bf5 — Split out of T-0047, which shipped the Overview at `?view=overview` deliberately rather than moving the landing view in the same change. The view should live with a release before it becomes the front door, and the swap is not a one-line default: four call sites disagree the moment they drift apart.

query.ts:31 reads the view and falls back to "explorer" when the parameter is missing or unknown; query.ts:68 writes the parameter only when the view is not "explorer". They encode the same default from opposite directions, so moving one without the other produces a URL the reader cannot round-trip - the Overview would either be unreachable by default or would write ?view=overview forever.

Explorer is imported eagerly at main.tsx:80 precisely because it is the landing view; the comment above the loaders map says so. Demoting it means a loaders.explorer entry, a lazy() wrapper, a VIEW_MODULE entry so hover and focus still prefetch it, and promoting Overview to the eager import in its place - otherwise the first paint of the new front door waits on a chunk.

test/schema-parity.test.ts asserts a bare query URL, and three demo links in site/index.html carry no view parameter, so today they mean "the table" and would silently come to mean "the dashboard". The screenshot script enumerates views in order and would reorder its output.

Decide after 0.1.8 has been in use, not before.
- 2026-07-31 19:04Z claude-opus-7c645bf5 — The Overview is the front door. All four call sites moved together, as the card warned they must.

query.ts:31 now falls back to "overview" and query.ts:68 omits the parameter for "overview" instead of "explorer" - the same default written from opposite directions, which is why they cannot be separated. The round trip was verified in the browser rather than reasoned about: a bare URL lands on the Overview with the sidebar marking it current, clicking Explorer writes ?view=explorer, and Back returns to the bare URL.

Explorer gave up its eager import in the same move. Leaving both eager would have made every first paint pay for the old landing view: it is now loaders.explorer, a lazy wrapper and a VIEW_MODULE entry so hover and focus still prefetch it, and it lands as a 12.11 kB chunk while the Overview joins the entry bundle.

schema-parity.test.ts asserted the old default through 'writeUrlState("explorer", ...)' expecting a bare /?q=bill. It now anchors the new one and, more usefully, anchors the symmetry itself: a bare location must read back as the view the writer refuses to name. That is the exact failure the card predicted, and nothing else in the suite would have caught it.

The three unqualified demo links in site/index.html were left alone on purpose. They follow the default, so their meaning moved with it - the landing nav, the 'Try the live demo' call to action and the footer link now open the Overview. That was the silent change the card wanted made deliberately, and it is: whoever clicks through now meets a sentence stating the project instead of a table of forty-seven rows.

Held against the card's own advice, which asked for a release of living with the view before deciding. 0.1.8 had been public for twenty minutes. Recorded here because the decision was the owner's and the reasoning should not be lost: if the front door proves wrong, the swap is four call sites in the other direction and this note is the map.

## Activity

- 2026-07-31 18:58Z claude-opus-7c645bf5 · claimed
- 2026-07-31 19:04Z claude-opus-7c645bf5 · doing → review
- 2026-07-31 19:09Z claude-opus-7c645bf5 · review → done
- 2026-07-31 19:09Z claude-opus-7c645bf5 · released

