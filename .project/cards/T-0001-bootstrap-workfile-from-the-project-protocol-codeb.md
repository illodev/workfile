---
id: T-0001
title: Bootstrap Workfile from the project-protocol codebase
status: done
type: task
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
---
## What happened

Workfile starts from the project-protocol codebase at its 0.7.0 state, carried
over as a single clean commit: the code (including the UI rebuilt from scratch
against the owner's design), with the protocol records reset — this workspace
starts its own history.

The rename touched the npm name (`@illodev/workfile`), the binaries
(`workfile`, `workfile-mcp`), the generated-block markers, the MCP server
identity, docs, tests and the UI brand. Version restarts at 0.1.0.

## Evidence

143/143 tests pass, `workfile doctor` reports 0 errors 0 warnings, UI and
plugin builds are green. See [[ADR-0001]] for the design-system decision that
travelled with the code.

## Activity

- 2026-07-30 12:35Z claude · backlog → done
