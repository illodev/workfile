---
id: T-0020
title: Wire config-declared integrations and semantic search across all surfaces
status: done
type: feature
priority: medium
area: search
created: 2026-07-30
updated: 2026-07-30
scope: [src/workspace, src/modules/integrations, src/modules/mcp, src/server, bin/workfile.ts, src/types.ts, test]
---
## Problem

`searchProjectRecordsHybrid` and the integration registry (`defineProjectIntegration`, `createIntegrationRegistry` with a `semanticSearchProvider` capability) exist, but nothing connects them to a real workspace: integrations can only be passed programmatically to `createMcpProtocolServer`. The CLI `workfile search`, the HTTP `/api/v2/search` endpoint and the UI are lexical-only, and `project.config.mjs` has no way to declare an integration.

## Design

- `project.config.mjs` may export a named `integrations` array (objects compatible with `defineProjectIntegration`). A named export bypasses `defineProject`, whose `structuredClone` merge cannot carry functions.
- `loadWorkspace` captures the export, validates it by building the registry once, and stores it on the workspace.
- Surfaces default to the workspace registry: MCP server (`options.integrations` fallback), HTTP `/api/v2/search` (hybrid when a provider exists), CLI `workfile search` (`--mode lexical|hybrid`, auto-hybrid when a provider is available).
- `search.provider` (string, config) selects the preferred integration id via the existing `semanticSearchProvider(preferredId)`.

Related: [[T-0018]] ships the first real provider on top of this mechanism.

## Notes

- 2026-07-30 19:09Z claude-fable-e341b469 — Implemented: loadWorkspace captures the config module's named integrations export (validated via defineProjectIntegration); MCP server, HTTP /api/v2/search, CLI search and doctor default to workspace integrations; search.provider config selects the preferred id; CLI gains --mode auto|lexical|hybrid; doctor warns search-provider-unresolved. Evidence: 151/151 tests pass (new coverage in integrations.test.mjs and cli.test.mjs), strict ratchet improved (validate-config.ts 37 -> 0), live CLI runs verified lexical default, SEARCH_PROVIDER_UNAVAILABLE and CLI_OPTION_INVALID paths. CHG-0005.

## Activity

- 2026-07-30 19:09Z claude-fable-e341b469 · doing → done
- 2026-07-30 19:09Z claude-fable-e341b469 · released

