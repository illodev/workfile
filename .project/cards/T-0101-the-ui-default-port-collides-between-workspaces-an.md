---
id: T-0101
title: The UI default port collides between workspaces, and reports INTERNAL_ERROR
status: backlog
type: bug
priority: medium
area: ui
scope: [packages/workfile/src/server/http.ts, packages/workfile/bin/workfile.ts]
created: 2026-08-02
updated: 2026-08-02
---

`ui.port` defaults to `4747` for every workspace (config/defaults.ts:210-215),
so the second project a user opens cannot start:

```
INTERNAL_ERROR: listen EADDRINUSE: address already in use 127.0.0.1:4747
```

A raw Node string under the code reserved for a bug in Workfile itself, for the
most predictable failure this command has. Anyone working on two repositories
meets it on their second one, and the message offers nothing: not the flag, not
the config key, not the fact that the thing holding the port is almost
certainly another Workfile UI serving the project they were just in. The
reaction it invites is to kill the first server, which is how the surface comes
to feel single-project.

The capability is already there. Two servers on distinct ports against distinct
roots each serve their own workspace correctly, verified against a fixture and
this repository at once; `--port 0` binds a free port. Only the default and the
diagnosis are wrong.

## The fix

Catch `EADDRINUSE` where the server starts and report it as a workspace-level
condition: name the port, name `--port` and `ui.port`, and distinguish another
Workfile UI from an unrelated process — a probe of `/api/v2/workspace` on the
held port answers that, and lets the message say which project is already
there.

Whether the default should stay fixed is the open question. A port derived from
the workspace path would remove the collision entirely but breaks the promise
that the board is at a URL you can remember. Fixing the error first is worth
doing either way.

## Acceptance criteria

- [ ] A port already in use is reported with a workspace-level code, not `INTERNAL_ERROR`
- [ ] The message names `--port` and `ui.port`
- [ ] It says which workspace holds the port when the holder is a Workfile UI
- [ ] A test starts two servers on one port and pins the answer
