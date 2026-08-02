---
id: T-0132
title: The bump does not carry the two plugin manifests
status: backlog
type: bug
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
---
`.claude-plugin/marketplace.json` and `plugins/workfile/.claude-plugin/plugin.json`
each state the version, outside the managed markers `workfile upgrade` rewrites
and outside the set `sync-workspace-versions.ts` knows about. `build:plugin`
regenerates them from the root version, so they change as a side effect of
`pnpm run check` rather than as part of the bump.

The result is a manual step every release. At 0.3.0 it was a separate commit
after the tag — `71ac145`, "Stamp the plugin manifests at 0.3.0" — so the
tagged tree advertised 0.3.0 in the package and 0.2.0 in the marketplace. At
0.4.0 it was caught only because `check:release` left the two files dirty in
the working tree, and folded into the bump commit before tagging.

Nothing verifies it. `sync-workspace-versions.ts --check` covers `packages/*`
and `server.json`; the release workflow runs that check and no other. A release
where nobody notices the dirty files publishes a marketplace entry a version
behind, and no step fails.

This is the same shape as [[T-0131]], one release later: a version stated in a
place the bump does not know about. That card fixed the wiring so the script
stages what it writes; this one is about the script not writing these two at
all.

Deliberately not folded into 0.4.0. The fix belongs in
`sync-workspace-versions.ts` beside the `server.json` branch, and landing it
after the cut would have put an undescribed change into a released version —
the manifests were stamped by hand for this release instead.

## Acceptance criteria

- [ ] A bump rewrites both manifests
- [ ] `--check` fails when either drifts from the root version
- [ ] The release workflow would refuse the drift rather than publish it
