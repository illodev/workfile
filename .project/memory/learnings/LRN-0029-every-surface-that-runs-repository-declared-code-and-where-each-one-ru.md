---
id: LRN-0029
title: Every surface that runs repository-declared code, and where each one runs
status: active
category: infra
confidence: high
related: [T-0213, T-0188, ADR-0019, LRN-0028, LRN-0025]
tags: [security, integrations, ci]
created: 2026-08-07
updated: 2026-08-07
---

Audited for T-0213 against 0.8.1. LRN-0025 recorded the first channel and
LRN-0028 recorded what the generated CI targets hold; this is the complete list
of places Workfile executes code the repository supplied, with where each one
runs. There are three channels and no fourth: `ProjectIntegration` declares
exactly two hooks, `healthCheck` and `semanticSearchProvider.search`.

**Channel 1 — the config module body. Everywhere, unconditionally.**
`loadWorkspace` does `await import()` on `project.config.mjs` out of the
checkout (`src/workspace/load-workspace.ts:270`). Every CLI command, the HTTP
server, both MCP transports, the UI backend and `doctor` load a workspace, so
all of them run that file's top-level code before doing anything else. This is
the channel that decides the shape of the whole question: the module body can
import anything and reach the network and the filesystem, so no bound placed on
the hooks below is a security boundary. ADR-0019 is the decision that follows
from it.

**Channel 2 — `healthCheck`. Only through `doctor`, which is what CI runs.**
`runDoctor` builds a registry from `workspace.integrations` and calls every
declared hook (`src/modules/health/doctor.ts:100-103` →
`src/modules/integrations/registry.ts:290`). Six callers reach it:

- `workfile doctor` — `bin/workfile.ts:2658`. This is the command all three
  generated CI templates run, and the one a maintainer runs locally on a branch
  they only meant to read.
- `GET /api/v2/health` — `src/server/http.ts:949`.
- `GET /api/health` — `src/server/http.ts:1620`.
- The `project_doctor` MCP tool — `src/modules/mcp/tools.ts:600`.
- The MCP doctor resource — `src/modules/mcp/resources.ts:170`.
- `scripts/bench.ts:64`, which is why a hook with a bad bound shows up as a
  benchmark regression rather than as itself.

**Channel 3 — `semanticSearchProvider.search`. Only when a provider resolves.**
Called from `src/modules/search/search.ts:310`. The registry is built at
`bin/workfile.ts:2476` (`workfile search`, skipped entirely under
`--mode lexical`), `src/server/http.ts:736` (resolved once at server start,
serving `/api/v2/search` and `/api/v2/records`) and
`src/modules/mcp/server.ts:249,292`. The hook receives record bodies, so it is
the channel that sees content rather than just paths.

**Where a repository is not already trusted.** Two places, both from channel 2
via `doctor`: a CI runner, and a maintainer's own machine on a branch they are
reviewing. GitHub is not one of them in the way it first looks — a fork's pull
request builds the fork's head without the base repository's secrets, and
LRN-0028 explains why arguing a fork boundary here misleads. GitLab and the
generic script are the cases the templates cannot protect.

**A property worth knowing before reading a report.** `healthReports` returns
`module: "integration:<id>"` per integration, and `runDoctor` then flattens
`report.issues` and discards the module — for every module equally, cards and
docs included. So a *valid* diagnostic from an integration is indistinguishable
from one Workfile produced itself. Only the three
`integration-health-check-*` codes name their integration, because those are
authored here rather than by the hook.

**How to apply.** When asked what a repository's own config can execute, answer
from channel 1 and never from the hook list: the hooks are a hop past a door
that is already open, and describing them as the exposure invites somebody to
"fix" it by removing a feature. When adding a surface that calls a
repository-declared function, it belongs on this list, and it must not let that
function's throw, hang or return value decide the surface's own answer — see
`healthCheckDiagnostics` for the shape.
