---
id: T-0057
title: "next has no CLI command: expose it or retire it"
status: backlog
type: task
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, discoverability, cli]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts]
created: 2026-07-31
updated: 2026-07-31
---

`workfile next` exits 2 and prints the usage banner. There is no such command.
`project_next` exists only over MCP (`src/modules/mcp/tools.ts:467`), plus the
`/next` slash command in the Claude adapter.

The protocol's "Essential commands" block lists eight commands and `next` is not
among them, so an agent reading `.project/agents/protocol.md` and working through
the CLI has no path to it at all.

A reporting agent went through an entire long session on a 1,630-card repository
without touching it, and built its own sweep out of `search` instead. Its read:
"if `next` is good, the problem is visibility; if it is not, it is surplus."

## Scope

Decide which. If the ranking `project_next` implements is worth having, add
`workfile next` over the same service and put it in the protocol's essential
commands, where an agent will actually meet it. If it is not, retire the MCP tool
rather than leaving a capability that only one of three surfaces can reach.

Either way, audit the CLI/MCP surface for the same asymmetry — `project_next` was
found by reading the tool registry, not by using the product.

Related: [[T-0056]] is the same discoverability failure on a command that does
exist.
