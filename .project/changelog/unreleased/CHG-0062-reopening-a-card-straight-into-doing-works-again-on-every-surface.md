---
id: CHG-0062
title: Reopening a card straight into doing works again, on every surface
type: fixed
area: core
visibility: public
cards: [T-0073]
created: 2026-08-02
updated: 2026-08-02
---

`reopenCard` forwards to `transitionCard`, which requires an actor to reach
`doing` because arriving there takes a claim — and `actor` was not among the
options it forwarded. So `card reopen ID --status doing` answered
`CARD_CLAIM_ACTOR_REQUIRED: actor is required` on a command with no way to
supply one, and `project_card_reopen` and the HTTP reopen route inherited the
same hole by calling through the same wrapper.

All three now carry an actor, resolved from the session rather than demanded:
`workfile card reopen ID --status doing` needs nothing typed. `--actor` is
wired for a caller acting on someone else's behalf, documented in `--help` and
`cli.md`, and accepted by the MCP tool.
