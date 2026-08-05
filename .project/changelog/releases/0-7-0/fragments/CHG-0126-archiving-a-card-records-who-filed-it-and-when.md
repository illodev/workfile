---
id: CHG-0126
title: Archiving a card records who filed it and when
type: changed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---

`card archive` now appends an `archived` line to the card's `## Activity` trail, naming the actor that filed it. The CLI, HTTP API and MCP tool all resolve one. The trail already recorded a card coming back out of the archive and nothing about it going in — the one board mutation that left no trace of who made it.

Archiving an already-archived card still writes nothing: the command is idempotent and a second line would record a move that did not happen.
