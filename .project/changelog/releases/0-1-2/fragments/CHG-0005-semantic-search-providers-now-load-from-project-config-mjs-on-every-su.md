---
id: CHG-0005
title: Semantic search providers now load from project.config.mjs on every surface
type: added
area: search
visibility: public
cards: [T-0020]
created: 2026-07-30
updated: 2026-07-30
---

Declare integrations via a named `integrations` export in project.config.mjs and `workfile search`, the HTTP API, the UI and MCP rank hybrid results automatically. `search.provider` selects an integration by id, `--mode` / `?mode=` opt out per call, and doctor warns when the configured provider is missing. Workfile still never sends repository content to a network service by itself.
