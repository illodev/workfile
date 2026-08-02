---
id: CHG-0092
title: Every file that states the version rides in the bump
type: fixed
area: infra
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0132]
related: [T-0131]
---
`.claude-plugin/marketplace.json` and the plugin's own manifest state the
version outside `packages/*`. They were stamped by `build-plugin`, which runs
under `check` — so the version moved as a side effect of testing, nothing
verified what was committed, and at 0.3.0 the marketplace advertised a version
behind with no step failing.

They join the list the bump writes, checks and stages, beside `server.json`.
The shapes are named rather than searched: a version can sit on the document,
inside `plugins[]`, or inside `packages[]`.

The manifest checks also stopped depending on something unrelated. The script
resolved `packages/` first and exited zero if that directory was missing, so a
repository without workspace packages skipped every manifest check and drift
passed as success.