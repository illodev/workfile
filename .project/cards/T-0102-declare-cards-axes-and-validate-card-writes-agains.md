---
id: T-0102
title: Declare cards.axes and validate card writes against it
status: backlog
type: feature
priority: medium
area: core
scope: [packages/workfile/src/config/validate-config.ts, packages/workfile/src/modules/cards/mutations.ts]
related: [T-0060]
created: 2026-08-02
updated: 2026-08-02
---

Per [[ADR-0008]]. `cards.axes` maps an axis name to its vocabulary:

```js
cards: {
    areas: ["api", "web", "infra"],
    axes: { context: ["treasury", "verifactu", "billing", "iam"] }
}
```

Storage and retrieval already work — `parseCard` spreads the frontmatter onto
the record and `search "context:treasury"` filters on it today. This card is
only the half that makes an axis declared rather than incidental.

- Config validation accepts `cards.axes`, rejects an axis name that collides
  with a reserved key (`CARD_REQUIRED_KEYS`, `CARD_LIST_KEYS`, `claimed_by`,
  `scope`) and rejects an empty vocabulary.
- `createCard` and `patchCard` refuse a value outside the declared vocabulary,
  the way `area` already does, naming the accepted values.
- A write path that does not depend on the axis name: `--axis name=value`,
  repeatable, on `card create` and `card patch`, and the same on the MCP tools.
  `COMMAND_FLAGS` is static and axes are per project, so a flag per axis is not
  available.
- `schema` reports the declared axes, so an agent discovers them the way it
  discovers areas.

## Acceptance criteria

- [ ] A card written with an undeclared axis value is refused, naming the vocabulary
- [ ] An axis colliding with a reserved frontmatter key is a config error
- [ ] `--axis` round-trips through create, patch and the MCP equivalents
- [ ] `workfile schema` lists the declared axes
