---
id: CHG-0107
title: The schema stops offering a ui.defaultView nothing ever read
type: removed
area: core
visibility: public
cards: [T-0152]
created: 2026-08-04
updated: 2026-08-04
---

`ui.defaultView` was in the configuration schema, in `ProjectUiConfig` and in
the spec's canonical config example. It reached no consumer: across `src/`,
`bin/`, `ui/src/` and the search-local package, the identifier appeared twice —
its declaration and its type. It was the only key in the schema with that
property.

Its default was `"work"`, which is not one of the board's ten views
(`overview`, `explorer`, `triage`, `flow`, `epics`, `timeline`, `docs`,
`memory`, `history`, `health`). So even had something read it, the shipped
default selected nothing. Typed `string` rather than a union, neither the
compiler nor `validateProjectConfig` had an opinion about that.

Removed rather than wired: a configuration key that promises behaviour and
delivers none is worse than an absent one, and opening the board on a chosen
view is a feature to design deliberately if it is wanted, not to infer from a
leftover default.

No migration is needed and none was added. Configuration validation rejects bad
values on keys it knows — `ui.port: "nope"` still fails with
`CONFIG_UI_PORT_INVALID` — but has no unknown-key pass, so a `project.config.mjs`
that still sets `ui.defaultView` loads and runs exactly as before. Verified
against a workspace carrying the removed key: `doctor` and `card list` both
run, with no configuration diagnostic about it.
