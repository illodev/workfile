---
id: CHG-0101
title: The README carries the Glama score and card badges
type: added
area: docs
visibility: public
created: 2026-08-03
updated: 2026-08-03
---
The header carries Glama's score chip and the `## Model Context Protocol` section closes on the card badge, both linking to `glama.ai/mcp/servers/illodev/workfile`.

Glama publishes the badges only for a server with a release, and the release only exists now: the build spec installs the workspace with `--ignore-scripts`, compiles `build:core` and starts the stdio server through `mcp-proxy`. Until that landed there was no path from the repository back to the directory entry — which is the half of a listing that discovery actually depends on.
