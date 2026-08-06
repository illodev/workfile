---
id: T-0214
title: "Serve the board read-only: workfile ui --read-only and --allowed-host"
status: review
type: feature
priority: medium
area: core
created: 2026-08-06
updated: 2026-08-06
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/server/http.ts, packages/workfile/ui/src]
---

A board other people read is a different thing from the local one an agent writes to, and the CLI could not express it. Two gaps, both in `workfile ui`:

- **Read-only was unreachable.** `loadWorkspace` has taken `readOnly` since the beginning and `ensureWritable` guards every write path, but the CLI never passed it: `--read-only` was listed only for `mcp`, and even there it hid the mutation tools while leaving the workspace writable. `bin/workfile.ts` now passes `readOnly: has("--read-only")` at the single `loadWorkspace` call, so `ui` gets it and `mcp --read-only` stops relying on tool hiding alone.

- **A published board answered nothing.** `assertRequestAllowed` refuses any `Host` outside the allowlist, and that list is the loopback set plus `--host` — which contributes nothing when `--host` is `0.0.0.0`, the value serving from a container needs. Every request 403'd with `REQUEST_ORIGIN_FORBIDDEN` and no flag existed to fix it. `--allowed-host` (repeatable, comma-separable, `*` to disable the check) names the hosts, and the CLI unions them with `LOOPBACK_HOSTS` rather than replacing it so a container healthcheck still works.

Two things fell out of the work:

- `startProjectServer` reported `url: http://0.0.0.0:PORT` for a wildcard bind — an address the server itself refuses. It now reports loopback, which is in the allowlist by construction and reaches a wildcard bind.
- The UI received `workspace.readOnly` from `/api/v2/workspace` and dropped it on the floor, so a read-only board offered every control it had and each one failed with a 409 on click. A `ReadOnlyProvider` carries it and the editing affordances stand down: create/claim/transition/archive/upload, both editors, the docs and memory and history editors, board drag, the palette's New card, and triage — which is nothing but writes — says why it is empty instead. `patch`/`bulkPatch` in the shell keep a backstop for whatever a later change forgets to gate.

## Acceptance

- [x] `ui --read-only` refuses every mutating route with `WORKSPACE_READ_ONLY`
- [x] `ui --host 0.0.0.0 --allowed-host NAME` answers to NAME and to loopback, and refuses anything else
- [x] The UI shows a `read-only` chip and no live editing affordance
- [x] Covered in `test/package-smoke.ts` against the packed tarball
- [ ] Verified on a deployed board (Fube's, behind basic auth)

## Activity

- 2026-08-06 12:16Z agent:claude · backlog → review
- 2026-08-06 12:17Z illodev@local#dacd76e0 · renamed file to T-0214-serve-the-board-read-only-workfile-ui-read-only-an.md
