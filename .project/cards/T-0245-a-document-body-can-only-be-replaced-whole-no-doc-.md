---
id: T-0245
title: "A document body can only be replaced whole: no doc write, no doc note"
status: next
type: feature
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, docs, mcp]
scope: [packages/workfile/src/modules/docs/docs.ts, packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/test/docs.test.ts, packages/workfile/test/cli.test.ts, packages/workfile/test/mcp.test.ts, packages/workfile/docs/cli.md, packages/workfile/docs/mcp.md]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

Cards have `card write --body-file` and `card note`; documents have `doc patch` only, on the CLI and on the MCP. `doc patch` takes `body` as one field among the frontmatter fields, so the only way to change a paragraph is to send the whole body back.

[[DOC-0006]]: a document edited in conversation over hours meant a working file kept outside the repository and poured in on every change, with a `doc show --json` before each pour to fetch the revision. That is the loop the card commands were built to end, and the reason they exist — a full-body write is how an agent destroys the human context around it — applies to a document at least as much.

Documents have no protocol sections, so `doc write` is the simpler of the two: replace the body under the lock and revision check, keep the frontmatter. `doc note` appends one timestamped line under a heading, created if absent, the way `card note` does.

## Acceptance criteria

- [ ] `workfile doc write ID [--body-file FILE]` replaces a managed document's body from a file or stdin, keeps its frontmatter, and honours `--expected-revision`.
- [ ] `workfile doc note ID --text TEXT [--section NAME]` appends one timestamped, attributed line under the heading, creating it when absent.
- [ ] Both exist on the MCP as `project_doc_write` and `project_doc_note`, listed in `docs/mcp.md` beside the card pair.
- [ ] `docs/cli.md` documents both.
- [ ] Service and CLI tests cover the replace, the append and the revision conflict.
