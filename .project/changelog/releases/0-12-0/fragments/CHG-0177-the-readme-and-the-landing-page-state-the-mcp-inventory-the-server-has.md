---
id: CHG-0177
title: The README and the landing page state the MCP inventory the server has
type: fixed
area: docs
visibility: public
cards: [T-0133]
created: 2026-09-11
updated: 2026-09-11
---

0.11.0 added project_doc_write and project_doc_note and the README kept saying the server exposes 30 tools; the landing page headlined the same figure. Both now say 32, and a documentation test compares the stated tools, resources and prompts with what listMcpTools, inspectMcpServer and listMcpPrompts return, so the next tool added fails the suite instead of a registry page. Glama's Overview and every aggregator that mirrors the README repeat whatever it says; this is the copy they read.
