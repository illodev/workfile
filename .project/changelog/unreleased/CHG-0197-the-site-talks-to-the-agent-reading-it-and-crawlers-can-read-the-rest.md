---
id: CHG-0197
title: The site talks to the agent reading it, and crawlers can read the rest
type: changed
area: docs
visibility: public
cards: [T-0259]
created: 2026-09-14
updated: 2026-09-14
---

`workfile.illodev.com` was one page. It answered 404 for `robots.txt`, `sitemap.xml` and `llms.txt`, carried no structured data, and its "docs" link opened the demo SPA, which a crawler reads as an empty `<div id="root">`. Web search did not return it even for its own name.

The landing is rewritten as a prompt addressed to the agent a human sent to evaluate Workfile — `<question>`, `<summary>`, `<failure_modes>`, `<refusals>`, `<tools>`, `<not_for>`, `<tldr>` — with a reader switch that plays the film and the stills for the human reading over its shoulder. Every command and output on it was run against 0.13.2 and pasted. It says it is not an instruction, because a page shaped like a system prompt is what an agent is taught to distrust.

Every page has a Markdown twin, served to `Accept: text/markdown` with `Vary: Accept` and advertised with `Link: rel="alternate"`. The docs under `packages/workfile/docs` are published as static pages at `/docs/*`, beside `/llms.txt`, `/llms-full.txt`, a sitemap, a robots file that admits AI crawlers by name, and JSON-LD on every page. Three comparison pages — Backlog.md, Task Master and Beads — link every claim about the other project to the line it was read from, and say where each is stronger.

`scripts/build-site.ts` is the only writer of the generated pages and of the MCP inventory the landing states, and `pnpm run check` fails when a committed page differs from what it would write. `docs/mcp.md` headed its tool table "Tools (30)" and filed `project_changelog_preview` under mutations; it now says 32, and the documentation test reads that heading as well.
