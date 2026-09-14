---
id: T-0257
title: The release job registers the MCP server before npm serves the version
status: review
type: bug
priority: medium
area: infra
source: .github/workflows/release.yml
related: [T-0251, T-0252]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-14
updated: 2026-09-14
scope: [.github/workflows/release.yml]
---

Releasing 0.13.1 on 2026-09-14 (run 34884322489), the publish job's npm loop printed `+ @illodev/workfile@0.13.1` at 19:03:01.6 and the next step, `mcp-publisher publish`, got 400 at 19:03:03.8: «NPM package '@illodev/workfile' exists, but version '0.13.1' was not found (status: 404)». Polled from outside, registry.npmjs.org served the version about fifteen seconds later. The nine releases before it were green, so the race had been won until then.

Two consequences. The `release` job needs `publish`, so the GitHub Release was skipped too and was created by hand with the same `scripts/release-notes.ts`. And the job could not be finished by re-running it: "Re-run failed jobs" repeats the whole job, whose npm loop publishes over versions that exist, which npm refuses — so the re-run dies before the step that failed. The MCP Registry stays on 0.13.0 until it is published by hand.

The fix is in `release.yml`: the MCP step waits, bounded, for npm to serve the version it registers, and the npm loop skips a package whose version npm already serves.

## Acceptance criteria

- [x] The MCP Registry step waits until npm serves the version it registers, polling for at most five minutes
- [x] The MCP Registry step fails naming the package and version when npm never serves it
- [x] The npm publish loop skips a package whose version npm already serves, so re-running the failed job reaches the steps after it
- [ ] The next tagged release runs green end to end, verified on its workflow run

## Activity

- 2026-09-14 19:19Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh — Implemented in release.yml and exercised locally on 2026-09-14 by running the two edited run blocks, extracted from the parsed workflow, with npm publish and mcp-publisher replaced by echo (the substitution checked before running). npm loop at 0.13.1: '@illodev/workfile-search-local@0.13.1 is already on npm; skipping' and the same for @illodev/workfile, exit 0; at an unpublished 9.9.9 it reaches the publish for both. MCP step at 0.13.1: npm serves it, the loop breaks on the first attempt and mcp-publisher runs, 0s. At 9.9.9 with attempts and sleep shortened: 'npm still does not serve @illodev/workfile@9.9.9 after five minutes', exit 1. The workflow parses (push on v* tags; publish, then release needing it) and both blocks pass bash -n. For 0.13.1 itself the GitHub Release was created by hand from scripts/release-notes.ts, and the MCP Registry entry is left for the owner to publish with mcp-publisher login github, since github-oidc only exists inside Actions. Exit: review — criteria 1-3 are met; criterion 4 is the next tagged release's run.
- 2026-09-14 19:28Z illodev@local#a112f2f3 via:undeclared/xhigh — 0.13.1 completed on 2026-09-14: the owner published it to the MCP Registry by hand (mcp-publisher login github, then publish, from main with server.json at 0.13.1). The registry now lists io.github.illodev/workfile 0.13.1 with isLatest true, publishedAt 2026-09-14T19:27:57Z, pointing at @illodev/workfile@0.13.1; 0.13.0 is no longer latest. npm, GitHub Release and MCP Registry all carry 0.13.1. Criterion 4 still waits on the next tagged release's run.
