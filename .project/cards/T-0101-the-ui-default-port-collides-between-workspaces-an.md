---
id: T-0101
title: The UI default port collides between workspaces, and reports INTERNAL_ERROR
status: review
type: bug
priority: medium
area: ui
scope: [packages/workfile/src/server/http.ts]
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

Decided: the default stays fixed and moves aside. A port nobody named may move,
so `wf ui` on a taken 4747 serves on the next free port and says which project
holds the one it wanted. A port somebody named may not, so an explicit `--port`
still fails — with the same diagnosis instead of a raw Node string. Deriving the
port from the workspace path was the alternative, and it breaks the promise that
the board is at a URL you can remember.

## Acceptance criteria

- [x] A port already in use is reported with a workspace-level code, not `INTERNAL_ERROR`
- [x] The message names `--port` and `ui.port`
- [x] It says which workspace holds the port when the holder is a Workfile UI
- [x] `wf ui` on a taken default serves on the next free port and says so
- [x] An explicit --port that is taken still fails, naming the holder
- [x] A test starts two servers on one port and pins both answers

## Activity

- 2026-08-02 00:36Z illodev@local#e55eab30 · claimed
- 2026-08-02 00:37Z illodev@local#e55eab30 · doing → review

