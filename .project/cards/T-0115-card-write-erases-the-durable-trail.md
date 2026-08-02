---
id: T-0115
title: card write erases the durable trail
status: backlog
type: bug
priority: high
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
related: [T-0108]
created: 2026-08-02
updated: 2026-08-02
---

Found while fixing [[T-0108]], and it defeats that card more completely than
the bug it was about.

`## Activity` lives in the card body. `patchCardBody` replaces everything after
the frontmatter wholesale, so writing a body drops the trail with it.
Reproduced on a scratch workspace — a card with two trail lines, then
`echo "new body" | workfile card write T-0001`:

```
---
id: T-0001
...
claimed_at: "2026-08-02T17:06:09.667Z"
---
new body
```

The frontmatter survives because it is parsed and re-emitted. The trail does
not, because as far as this path is concerned it was prose.

What makes it serious rather than a sharp edge: `project_card_write` is an
agent-facing MCP tool, and replacing a body is exactly what it is for. So the
record that answers "who moved T-0042 to done, and when" months later, from
git alone, is erased by a routine operation — silently, with no warning and no
way to notice from the command's output. Suppressing redundant lines is
pointless if one write removes the section.

The claim that the trail is append-only, and that a merge between two branches
resolves by keeping both lines, is false while this exists: a write is a
deletion the merge cannot see.

The fix belongs where the body is replaced, not at the callers, for the reason
[[T-0108]] gave — `card write`, the HTTP body routes and `project_card_write`
all reach the same place. Preserving the section the way frontmatter is
preserved, rather than asking every caller to carry it forward, is the shape
that cannot be forgotten.

Worth deciding as part of it: whether a body write should itself leave a trail
line. It is a protocol event by any reading, and today it leaves none.

## Acceptance criteria

- [ ] A body write preserves the existing `## Activity` section
- [ ] The guarantee holds through the CLI, the HTTP routes and MCP, because
      the preservation sits where the body is replaced
- [ ] A test pins it, since the trail had no coverage at all before [[T-0108]]
