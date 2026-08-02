---
id: T-0104
title: The board groups by a declared axis
status: backlog
type: feature
priority: low
area: ui
scope: [packages/workfile/ui]
related: [T-0060]
created: 2026-08-02
updated: 2026-08-02
---

Per [[ADR-0008]]. The reporter's stated payoff was reading the board by domain,
and a field nothing renders buys nothing — this is the card that makes the axis
worth declaring rather than merely correct.

Group-by should offer the declared axes alongside status and area, from
`workfile schema` rather than a hardcoded list, so a project that declares two
axes gets both without a UI change.

Depends on the axes being declared and validated first, so the values a
grouping renders are known to be a closed set.

## Acceptance criteria

- [ ] The board can group by any axis the workspace declares
- [ ] The grouping options come from the runtime schema, not a list in the UI
- [ ] A card with no value for the grouping axis lands in a visible bucket
