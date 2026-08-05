---
id: ADR-0013
title: Every agent adapter file carries the whole protocol
status: accepted
created: 2026-08-05
updated: 2026-08-05
---
## Context

`agents sync` writes `AGENTS.md` at 688 bytes and `CLAUDE.md` at 687. They
differ in the managed header and the `# Workfile for …` title, and in nothing
else. The external field test ([[DOC-0005]], and [[T-0173]] which carries it)
noticed and proposed the obvious economy: make `CLAUDE.md` a one-line pointer
to `AGENTS.md`, so an agent that loads both does not pay for the protocol
twice.

Every adapter target writes the same canonical body: `AGENTS.md`,
`CLAUDE.md`, `.cursor/rules/workfile.mdc`, `.github/copilot-instructions.md`.
The duplication is the design, not an oversight in one target.

## Decision

Each adapter file carries the full protocol. `CLAUDE.md` does not become a
pointer, and neither does any other target.

An adapter file whose content depends on another file being read is not an
adapter. What a given tool loads, in what order, and whether it follows a
reference to a sibling path are facts about that tool and its version — none of
them under this project's control, and all of them liable to change without
notice. A pointer that is not followed fails silently: the agent gets a title
and a sentence, believes it has the repository's instructions, and proceeds
without them. That failure is invisible from here and expensive there.

The economy on offer is 688 bytes.

## Consequences

- Adding an adapter target means another copy of the canonical body on disk.
  That is the cost of each file standing alone, and it is bounded by the number
  of targets a workspace selects, not by the size of the corpus.
- The bodies stay identical by construction: every target renders from
  `canonicalBody`, so they cannot drift. A reader comparing two adapter files
  and finding them the same is looking at the intended state.
- A workspace that wants only one of them selects only one. `agents.targets`
  is the control, and `init` detects it from which files already exist.
- If a consumer ever demanded a pointer, the target definition is where that
  would go — `mode` already distinguishes `append` from `dedicated`. This
  decision is about the default, not about the mechanism.
