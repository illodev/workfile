---
id: T-0131
title: The version hook rewrites server.json and leaves it unstaged
status: done
type: bug
priority: high
area: infra
created: 2026-08-02
updated: 2026-08-02
---
Found while preparing 0.4.0, which is the first release where it can fire.

`scripts/sync-workspace-versions.ts` writes two things: every
`packages/*/package.json`, and `server.json` — which states the version twice,
once for the MCP server and once for the npm package it resolves to. The root
`version` lifecycle hook stages only the first:

```
"version": "node ./scripts/sync-workspace-versions.ts && git add packages/*/package.json"
```

So `npm version 0.4.0` rewrites `server.json` on disk and commits without it.
The tag then points at a tree whose `package.json` says 0.4.0 and whose
`server.json` says 0.3.0.

`server.json` did not exist at v0.3.0 — it arrived with [[T-0114]], after the
last release — so nothing has exercised this path yet.

The failure is caught rather than silent: the release workflow runs
`sync-workspace-versions.ts --check` before publishing, so the drift fails the
run with npm untouched. But the recovery is the expensive kind — the tag is
already cut and pushed, and fixing it means moving a tag that CI has seen.

The script's own comment already states the stake: "a stale copy here does not
publish something slightly wrong, it fails the release after npm has already
been written to."

Same shape as [[LRN-0012]] and [[LRN-0014]]: one writer, two outputs, and only
one of them wired to the thing that carries them forward.

## Acceptance criteria

- [x] The version commit carries server.json
- [x] Evidence from a real bump, not from reading the hook

## Activity

- 2026-08-02 20:20Z illodev@local#aed59c5e · claimed
- 2026-08-02 20:24Z illodev@local#aed59c5e · doing → done

