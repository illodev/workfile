---
id: CHG-0175
title: A document body can be written from a file and a line appended, without sending the whole record back
type: added
area: core
visibility: public
cards: [T-0245]
tags: [cli, docs, mcp]
created: 2026-09-11
updated: 2026-09-11
---

`workfile doc write ID [--body-file FILE]` replaces a managed document's body from a file or stdin and leaves the frontmatter as it is; `workfile doc note ID --text TEXT [--section NAME]` appends one timestamped, attributed line under a heading, creating it when absent. Both honour `--expected-revision`, and both exist on the MCP as `project_doc_write` and `project_doc_note`. They are the document forms of `card write` and `card note`, which cards have had for a long time: `doc patch` takes the body as one field among the rest, so a document edited over hours in conversation meant a working copy kept outside the repository and poured back in whole on every change. The edit guard names the new tools when it stops a raw edit of a document.
