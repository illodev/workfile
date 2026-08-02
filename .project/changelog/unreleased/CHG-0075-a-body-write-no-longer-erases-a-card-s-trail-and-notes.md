---
id: CHG-0075
title: A body write no longer erases a card's trail and notes
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
`## Activity` and `## Notes` live in a card's body, and a body write replaced
the body. So `workfile card write`, and the `project_card_write` tool an agent
reaches for whenever it rewrites a card, deleted the durable trail and every
note along with the prose — including the reason one actor gave for taking
another's claim. The frontmatter survived, because that is parsed and
re-emitted; the rest was treated as prose because that is what it looked like.

A card claimed, taken over with a reason, and annotated, then written once:

```
---
id: T-0001
...
---
new body
```

The trail is specified as append-only — a merge between two branches resolves
by keeping both sides' lines — which was not true of a section any write could
replace.

Both sections now carry over from what is stored rather than from what was
sent, at the point where the body is replaced, so the CLI and MCP inherit it
together. A caller that omits them cannot delete them, and one that hands back
a shortened trail cannot shorten it. Round-tripping a body faithfully returns
exactly what was sent.

The trade this makes explicit: those sections are no longer editable through a
body write. `card note` appends, and nothing edits — which is what append-only
means.
