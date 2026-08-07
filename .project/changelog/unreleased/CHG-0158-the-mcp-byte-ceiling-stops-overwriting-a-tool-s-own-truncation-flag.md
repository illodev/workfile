---
id: CHG-0158
title: The MCP byte ceiling stops overwriting a tool's own truncation flag
type: fixed
area: mcp
visibility: public
cards: [T-0147]
created: 2026-08-07
updated: 2026-08-07
---

A reply degraded for exceeding maxToolResultBytes is marked `resultTruncated`, not `truncated`. The old key collided with what project_agent_context already meant by it: a large bundle replaced a boolean with an object, so a caller checking `=== true` survived only because an object is truthy, and a caller reading `truncated.records` on any other tool got `true` from that one. Both markers are declared in every tool's outputSchema.
