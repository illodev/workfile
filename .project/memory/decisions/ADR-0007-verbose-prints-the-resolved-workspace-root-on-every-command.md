---
id: ADR-0007
title: --verbose prints the resolved workspace root, on every command
status: accepted
related: [T-0097, T-0091]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/SPEC.md]
created: 2026-08-02
updated: 2026-08-02
---

## Context

SPEC stated normatively that commands which mutate data MUST print the
resolved workspace root in verbose mode. Nothing implemented it, and after the
flag tables were re-keyed per subcommand nothing could: `--verbose` was listed
for `ui` alone, where it means request logging, so `card create --verbose` was
refused with `CLI_ARGUMENT_UNKNOWN`. The one place the root was printed was the
`ui` banner — a command that mutates nothing, printing unconditionally rather
than in verbose mode. The requirement was false in both directions at once, and
T-0088 rewrote the line to describe what was true, leaving the product question
open.

## Decision

`--verbose` is global and prints `Workspace: <root>` to stderr before the
command runs. The MUST is restored and strengthened: every command answers,
not only the mutating ones.

Global rather than per-mutation because a caller should not have to know which
commands qualify, and a read answering the same question costs nothing. It also
keeps `GLOBAL_FLAGS` honest under the rule that a flag living there is read by
every subcommand — one read in the preamble, not sixty.

stderr rather than stdout because `--json` output is a document a consumer
parses, and a diagnostic line is not part of it. `--verbose --json` therefore
gives a machine the record and a human the root, on separate channels.

## Why it is worth the flag at all

Resolution walks five steps: `--root`, `project.config.mjs`, the nearest
ancestor holding `.project/VERSION`, the git worktree root, then cwd. Picking
the wrong ancestor writes cards into the wrong repository, and it fails
silently — the write succeeds, in the wrong place. That stops being
hypothetical the moment two checkouts are open at once, which is the ordinary
case for anyone working on more than one project.

## Consequences

`workfile ui` keeps its own reading of `--verbose` for request logging, and
keeps printing the root unconditionally in its startup banner. The two are
different things and both stay.

A still-open question rides along: whether a headless repository should be able
to stop a bare `workfile` from starting the UI. `.project` config has no such
flag today and the default is applied before any config is read. Not decided
here; it needs a use case first.
