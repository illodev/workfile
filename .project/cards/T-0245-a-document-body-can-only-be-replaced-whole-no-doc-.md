---
id: T-0245
title: "A document body can only be replaced whole: no doc write, no doc note"
status: done
type: feature
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, docs, mcp]
scope: [packages/workfile/src/modules/docs/docs.ts, packages/workfile/src/modules/docs/index.ts, packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/src/index.ts, packages/workfile/test/docs.test.ts, packages/workfile/test/cli.test.ts, packages/workfile/test/mcp.test.ts, packages/workfile/docs/cli.md, packages/workfile/docs/mcp.md]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
verified:
  at: "2026-09-11T15:55:43.744Z"
  method: manual
  commit: c25eaef13be31118d86459bc6cad1ba990ddeb30
  digest: "sha256:e98ddc8945ddba0b9693794ad5a850d629258ace484acc34d946e9d71ec9a0fa"
---

Cards have `card write --body-file` and `card note`; documents have `doc patch` only, on the CLI and on the MCP. `doc patch` takes `body` as one field among the frontmatter fields, so the only way to change a paragraph is to send the whole body back.

[[DOC-0006]]: a document edited in conversation over hours meant a working file kept outside the repository and poured in on every change, with a `doc show --json` before each pour to fetch the revision. That is the loop the card commands were built to end, and the reason they exist — a full-body write is how an agent destroys the human context around it — applies to a document at least as much.

Documents have no protocol sections, so `doc write` is the simpler of the two: replace the body under the lock and revision check, keep the frontmatter. `doc note` appends one timestamped line under a heading, created if absent, the way `card note` does.

## Acceptance criteria

- [x] `workfile doc write ID [--body-file FILE]` replaces a managed document's body from a file or stdin, keeps its frontmatter, and honours `--expected-revision`.
- [x] `workfile doc note ID --text TEXT [--section NAME]` appends one timestamped, attributed line under the heading, creating it when absent.
- [x] Both exist on the MCP as `project_doc_write` and `project_doc_note`, listed in `docs/mcp.md` beside the card pair.
- [x] `docs/cli.md` documents both.
- [x] Service and CLI tests cover the replace, the append and the revision conflict.

## Activity

- 2026-09-11 15:31Z illodev@local#597ecdc9 · claimed
- 2026-09-11 15:38Z illodev@local#597ecdc9 · doing → review
- 2026-09-11 15:55Z illodev@local#597ecdc9 · review → done

## Notes

- 2026-09-11 15:38Z illodev@local#597ecdc9 — Implemented: writeManagedDocumentBody and appendManagedDocumentNote in docs.ts (the note derives its body under the same lock via a transformBody option on patchManagedDocument); CLI doc write [--body-file|stdin] and doc note --text [--section] [--actor]; MCP project_doc_write and project_doc_note; the hook's RECORD_TOOLS names them for docs; docs/cli.md and docs/mcp.md updated. Local evidence: docs.test.ts, cli.test.ts and mcp.test.ts pass on the built binary; on a scratch workspace doc write from a file and from stdin replaced the body and kept the frontmatter, doc note created ## Notes and ## History with timestamped attributed lines, and mcp inspect lists both tools. Not done: HTTP routes for the two, which cards do not have either. Missing: the published package in a consumer.
- 2026-09-11 15:55Z illodev@local#597ecdc9 — manual verification: @illodev/workfile@0.11.0 from npm: doc write --body-file and doc write from stdin replaced the body and kept the frontmatter; doc note wrote timestamped attributed lines under ## Notes and under --section History; mcp inspect lists project_doc_write and project_doc_note.
