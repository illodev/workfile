---
id: CHG-0064
title: --verbose names the workspace a command resolved
type: added
area: core
visibility: public
cards: [T-0097]
created: 2026-08-02
updated: 2026-08-02
---

`--verbose` is global and prints `Workspace: <root>` to stderr before the
command runs, so `--json` on stdout stays a document a consumer can parse.

Workspace resolution walks five steps — `--root`, `project.config.mjs`, the
nearest ancestor holding `.project/VERSION`, the git worktree root, then cwd —
and picking the wrong ancestor writes into the wrong repository silently: the
write succeeds, in the wrong place. That stops being hypothetical the moment
two checkouts are open.

The spec required this of mutating commands and nothing implemented it; after
the flag tables were re-keyed, `--verbose` was accepted by `ui` alone and
`card create --verbose` was refused outright. Every command answers now, not
only the mutating ones. Recorded as ADR-0007.
