---
id: T-0173
title: init describes a workspace slightly different from the one it creates
status: backlog
type: bug
priority: low
area: core
tags: [init, docs, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
---

Three small things from [[DOC-0005]], all confirmed at 0.6.0 in a clean
workspace. They are grouped because they are all `init` telling the user about
a workspace slightly different from the one it makes, and separately none of
them is worth a card.

**`docs.sources` points at a directory that is never created.** The generated
`project.config.mjs` carries:

```
sources: [
    ".project/specs/**/*.md"
],
```

`init` creates `.project/docs` and `.project/sources`, and no `.project/specs`.
`doctor` does not flag the dangling glob. The report notes the third directory
makes it worse rather than better: with `docs`, `sources` and a configured
`specs`, nothing says where a document is supposed to go.

**`AGENTS.md` and `CLAUDE.md` are the same file.** 688 bytes against 687,
differing only in the managed header and the `# Workfile for …` title. An agent
that loads both — which Claude Code does — pays for the protocol twice. The
report suggests `CLAUDE.md` become a one-line pointer to `AGENTS.md`. That is a
change to what an adapter emits, so it needs deciding rather than doing: the
pointer is only better if every consumer follows it.

**`--dry-run` undercounts.** The plan says 14 directories and 3 files; the run
creates 19 directories. Under 0.5.4 the report saw 14/4 against 19/6. Whichever
side is wrong, the dry run is the one command whose entire purpose is to be
accurate before anything is written.

Two further observations from the report were not re-tested and are recorded
here rather than claimed: the hooks exit 0 in silence on unrecognised input,
which makes it hard to tell a working hook from a dead one, and the UI dies
with the session that launched it, which is expected of a dev server but
unstated for something presented as the project's board.

## Acceptance criteria

- [ ] The generated `docs.sources` matches a directory `init` creates, or `doctor` flags it
- [ ] `CLAUDE.md` stops duplicating `AGENTS.md`, or the duplication is deliberate and recorded
- [ ] `init --dry-run` counts what `init` creates
