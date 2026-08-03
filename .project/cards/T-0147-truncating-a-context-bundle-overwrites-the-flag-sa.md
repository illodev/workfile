---
id: T-0147
title: Truncating a context bundle overwrites the flag saying it was truncated
status: backlog
type: bug
priority: low
area: mcp
tags: [mcp, truncation]
created: 2026-08-03
updated: 2026-08-03
---

`buildAgentContext` returns `truncated: boolean` — true when related records
were dropped to respect `limit`. `toolResult` in `modules/mcp/server.ts`, when a
payload exceeds `mcp.maxToolResultBytes`, does

```js
payload = { ...payload, truncated };
```

where its own `truncated` is `{ records: <dropped> }`. For every other tool that
key is free, so the marker lands cleanly. For `project_agent_context` it lands
on top of a boolean that already meant something.

## What breaks

A caller reading `truncated === true` to detect a bounded bundle gets an object
instead, which is truthy — so the boolean check survives by accident. A caller
reading `truncated.records` on any other tool gets `true` from this one and
reads `.records` off a boolean, which is `undefined`. The two meanings are
different — one is "limit dropped relations", the other is "the byte ceiling
dropped rows" — and they are indistinguishable once merged.

Found while declaring `outputSchema` for the 30 tools in [[T-0146]]: the field
had to be typed as a boolean there, which is only true until the ceiling is hit.

## Not yet reproduced

It needs a bundle over `maxToolResultBytes` (512 KB by default), which this
workspace does not produce at `limit: 20`. Reproducing it is the first step,
not an assumption to build a fix on.

## Acceptance criteria

- [ ] A test drives `project_agent_context` past `maxToolResultBytes` and pins
      what the two markers do to each other
- [ ] The byte-ceiling marker stops colliding with tool payload fields — a
      distinct key, or a nested one
- [ ] `outputSchema` for `project_agent_context` matches whatever wins
- [ ] `docs/mcp.md` describes the marker that ends up shipping
