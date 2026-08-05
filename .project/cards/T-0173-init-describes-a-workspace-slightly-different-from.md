---
id: T-0173
title: init describes a workspace slightly different from the one it creates
status: review
type: bug
priority: low
area: core
tags: [init, docs, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/init]
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

- [x] The generated `docs.sources` matches a directory `init` creates, or `doctor` flags it
- [x] `CLAUDE.md` stops duplicating `AGENTS.md`, or the duplication is deliberate and recorded
- [x] `init --dry-run` counts what `init` creates

## Activity

- 2026-08-05 14:59Z illodev@local#2cddaf94 · claimed
- 2026-08-05 15:15Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 15:15Z illodev@local#2cddaf94 — All three closed, two by changing `init` and one by recording a decision.

**`docs.sources` and the phantom directory.** `init` now creates `.project/specs` and stops creating `.project/sources`. A swap, not an addition: the count is unchanged and the directory that exists is the one the generated config indexes. Both are optional under the spec, so the question was only which one the workspace it ships with refers to — and nothing anywhere names `sources`. Verified end to end: a document written to `.project/specs` is returned by `loadIndexedDocuments` with no further configuration, and `doctor` is clean on the new workspace.

That leaves `workspace.paths.sources` resolving a directory nothing creates or reads, which is [[T-0180]] rather than a silent removal — `paths` is public shape and the spec lists the directory.

**`--dry-run` undercounted twice over.** It promised 14 directories and 3 files for a run that made 19 and 9, and 21 and 11 once a CI target was selected. Two separate causes:

- `mkdir(recursive)` creates the parents of every path it is given, and the plan listed only the leaves of its own list. `withParents` closes over them, stopping at the root — `init` runs inside a directory that already exists.
- The agent and CI surfaces are written after the plan, by `syncAgentInstructions` and `syncCiTemplates`, so nine files were being created that the plan had never heard of. They are now planned as `type: "generated"` and skipped by the apply loop: named so the dry run can name them, left to the sync so a managed block still has exactly one writer. Their directories (`.github/workflows`, `.cursor/rules`) join the closure, which is what the CI target had been adding unaccounted.

Directory actions also carry `create` or `exists` now, and the summary counts only what this run will make. A plan over an existing workspace was describing a clean checkout.

The test compares the plan against the filesystem after applying it, not against a number in a fixture, and asserts the paths match as well as the counts — arithmetic can agree while describing a different workspace. So a directory added to `init` fails this until the plan admits to it. Verified non-vacuous: dropping the parent closure fails it at 20 against 21, dropping the generated actions at 3 files against 11, and reverting `specs` to `sources` fails the other test on `.project/specs/**/*.md is indexed but .project/specs is not created`.

**`AGENTS.md` and `CLAUDE.md` stay identical, deliberately** — [[ADR-0013]]. An adapter file whose content depends on another file being read is not an adapter: what a tool loads, and whether it follows a reference to a sibling path, is a fact about that tool and its version. A pointer that is not followed fails silently, with the agent believing it holds the repository's instructions. The economy on offer was 688 bytes.

The two observations the card recorded without claiming — hooks exiting 0 in silence, the UI dying with its session — are untouched and still unclaimed.
