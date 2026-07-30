---
id: T-0029
title: A post-bump upgrade command that resyncs every generated surface
status: backlog
type: feature
priority: low
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Context

A version bump leaves every generated surface carrying the previous stamp until someone
remembers the full resync litany: `agents sync`, `ci sync`, `claude install`. The checks
stay green throughout — the version stamp is provenance, deliberately excluded from the
staleness decision — so nothing ever nags. A real consumer (Fube) forgot part of the
litany on two consecutive bumps, same day; by the second, managed files carried three
different stamps at once (0.1.1/0.1.2/0.1.3).

The CI template makes one case worse than cosmetic: it pins the package version in its
npx commands, so a forgotten `ci sync` keeps CI running the OLD package against a
workspace whose other surfaces moved on.

## Proposed

`workfile upgrade` (or `workfile sync --all`): detect installed version vs the stamps on
every managed surface the config owns, resync the ones behind, report the ones whose
kind no target owns (orphaned blocks fossilize silently today — this repo's own
CLAUDE.md adapter sat at 0.1.0 because agents.targets never listed "claude").

## Acceptance

- [ ] One command leaves every owned surface stamped with the installed version
- [ ] Orphaned managed blocks (kind with no owning target) are reported, not skipped silently

## Notes

- 2026-07-30 — from the Fube upgrade experience; the consumer-side checklist lives in
  Fube's LRN-0017 until this exists.
- 2026-07-30 21:31Z claude-fable-e341b469 — Another surface for upgrade to own, found while working T-0025: the 0.1.3 bump left plugins/workfile/.claude-plugin/plugin.json and .claude-plugin/marketplace.json at 0.1.2 - the drift test only catches it locally because CI regenerates the plugin before testing (check runs build:plugin). Fixed by hand with build-plugin; workfile upgrade should run or verify the plugin build too.

