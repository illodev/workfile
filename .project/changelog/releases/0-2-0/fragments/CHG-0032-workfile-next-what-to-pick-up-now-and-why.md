---
id: CHG-0032
title: "workfile next: what to pick up now, and why"
type: added
area: core
visibility: public
cards: [T-0057]
created: 2026-07-31
updated: 2026-07-31
---

The ranking that answers "what should I start" existed only as the `project_next`
MCP tool. `workfile next` exited 2 with the usage banner, and the protocol's
essential commands never mentioned it, so a session driving the CLI had no way to
meet it — one long session on a 1,630-card repository went by without it, with
the sweep rebuilt by hand out of `search`.

It is a CLI command now, over the same service the MCP tool calls rather than a
second copy of the ranking: work you have already claimed first, then unblocked
cards by priority, with cards whose dependencies are unmet excluded rather than
ranked low. Each row carries the reason it was offered. It joins the protocol's
essential commands, which is where an agent actually meets it.
