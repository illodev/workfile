---
id: LRN-0010
title: OIDC trusted publishing cannot move a dist-tag
status: active
created: 2026-08-02
updated: 2026-08-02
---
The OIDC credential npm mints for trusted publishing authorizes `npm publish`
and `npm stage publish`. Nothing else. npm's own documentation says other
commands "still require traditional authentication methods", and
`npm dist-tag add` is one of them. `npm publish` also accepts a single
`--tag`, so a release cannot set two channels in one call.

The consequence for `.github/workflows/release.yml`: it can choose which
channel a version publishes to, and it can never move a channel afterwards.
Any release automation that needs to retag — advancing `next` when a stable
overtakes it, promoting a release candidate, backfilling a maintenance line —
requires a long-lived npm token, and this workflow deliberately stores none.
A configured token is not merely redundant there: it makes the CLI skip the
OIDC exchange, so adding one to do the retagging breaks the publish it was
added alongside unless it is confined to a later step.

Upstream request: npm/cli#8547, "Allow Trusted Publishers to run
`npm dist-tag add`", opened 2025-09-03 and still open as of 2026-08-02. Worth
re-checking before designing around the limitation again — if it lands, the
retagging step becomes possible with no token at all.

Also relevant when revisiting: trusted publisher configurations created after
2026-05-20 must name at least one allowed action explicitly, so a config's
capabilities are now worth reading rather than assuming.

Surfaced by [[T-0107]], where `next` had pointed at `0.1.0-rc.1` since the
bootstrap publish while `latest` had moved on twelve releases.
