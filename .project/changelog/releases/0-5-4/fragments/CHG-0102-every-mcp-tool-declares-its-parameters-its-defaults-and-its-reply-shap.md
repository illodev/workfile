---
id: CHG-0102
title: Every MCP tool declares its parameters, its defaults and its reply shape
type: changed
area: mcp
visibility: public
created: 2026-08-03
updated: 2026-08-03
---
All 157 input properties across the 30 tools now carry a `description`, up from three. Closed protocol vocabularies declare `enum` — card `status`, `type`, `priority` and `effort` — while project-declared ones stay open and point at `project_workspace` instead of pretending to be closed. Nineteen properties declare the `default` their implementation already had.

Every tool declares an `outputSchema`, up from none. The shapes were checked against live replies rather than read off the code, and they are deliberately open objects: `toolResult` appends a `truncated` marker past `mcp.maxToolResultBytes`, so a closed schema would invalidate the server's own degradation path.

The prompt for this was Glama grading the surface `C` — 3.2/5 across all 30 tools. Its dimension breakdown put the deficit in Parameters, Completeness and Usage Guidelines while Conciseness scored highest of the six, which is why nothing here pads prose: `project_card_transition` accepted `status` as a free string when eight values are frozen in `CARD_STATUSES`, and that is a defect a caller pays for whether or not anyone is scoring it.
