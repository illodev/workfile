---
id: T-0132
title: The bump does not carry the two plugin manifests
status: done
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

- [x] A bump rewrites both manifests
- [x] `--check` fails when either drifts from the root version
- [x] The release workflow would refuse the drift rather than publish it

## Activity

- 2026-08-02 20:44Z illodev@local#aed59c5e · claimed
- 2026-08-02 20:48Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 20:48Z illodev@local#aed59c5e — The list of files that state the version stopped being three special cases and
became one list. `server.json` had its own branch; the two manifests had none.
All three now go through the same read, the same stale-version scan, the same
textual replacement — which is what keeps their formatting — and the same
staging.

Shapes differ and are named rather than walked: a version can sit on the
document itself, inside `plugins[]`, or inside `packages[]`. A recursive search
would have found a fourth one day that was never meant to track the release.

Two writers remain, and deliberately. `build-plugin` stamps the manifests
because it regenerates them wholesale from templates; this script stamps them
because the bump has to carry them. Both read the same root version, so they
cannot disagree — confirmed by running `build:plugin` after this change and
getting an empty diff.

A second hole, found while proving the first and fixed in the same pass. The
script resolved `packages/` up front and `process.exit(0)` if it was missing,
so every manifest check was reachable only through a readdir with nothing to do
with them. Measured before and after, with a repository holding a drifted
`server.json` and no `packages/` directory:

    before   exit=0    drift passed as success
    after    exit=1    "server.json is 0.0.1, root is 9.9.9"

Evidence for the three criteria:

1. A bump rewrites both — a throwaway repository with drifted manifests is
   repaired by the plain run, and `--stage` puts all three kinds of file in the
   index: `.claude-plugin/marketplace.json`, `packages/thing/package.json`,
   `server.json`. That last assertion is the first criterion stated as a list,
   so a fourth output cannot quietly fall out of it.
2. `--check` fails on either — exit 1, naming both files.
3. The workflow refuses rather than publishes — `release.yml` runs
   `sync-workspace-versions.ts --check` inside "Verify tag matches package
   version", which is the step before `check:release` and two before any
   publish. The check now covers the manifests, so the refusal is the same one
   that already guards `server.json`, on the same step.

249 tests pass, strict holds at 590 across 57 files.
