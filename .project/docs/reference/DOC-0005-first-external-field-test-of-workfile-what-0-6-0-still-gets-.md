---
id: DOC-0005
title: "First external field test of Workfile: what 0.6.0 still gets wrong"
kind: reference
status: current
created: 2026-08-05
updated: 2026-08-05
---
> Received 2026-08-05. An external tester ran Workfile 0.5.2, upgraded to
> 0.5.4, and reported eight findings plus six minor observations from a real
> single-developer three.js prototype: install, init, a 19-card board, one task
> carried end to end, across CLI, web UI, the Claude Code plugin and MCP.
>
> **Standard applied.** The report is against 0.5.4. Every finding here was
> re-run against 0.6.0 on this machine, in a scratch workspace created for the
> purpose, before being accepted. Nothing was carried over on the report's
> word. Two findings changed shape under checking and one was already fixed.

# First external field test

The report is unusually good: every claim came with a command, and the
reproductions hold. What it could not know is which findings survived 0.6.0,
and — in two cases — what was actually broken underneath.

## 1. Status at 0.6.0

| # | Reported finding | Verdict |
|---|---|---|
| 2 | Acceptance criteria only detected under an English heading | **Live, wider than reported** — [[T-0167]] |
| 3 | UI mutations are recorded as `unknown` | **Live** — [[T-0168]] |
| 1 | `agents context` injects all project memory | **Live**, partly mitigated — [[T-0172]] |
| 6 | `init` falls back to defaults with no TTY and no notice | **Live** — [[T-0171]] |
| 7 | `.mcp.json` and the hooks resolve the version differently | **Live** — [[T-0170]] |
| 4 | Generated `.claude/` files lost their trailing newline | **Live, misdiagnosed** — [[T-0169]] |
| 5 | No dependencies between cards | **Already shipped in 0.6.0** |
| 8 | `done` demands no evidence despite the protocol | **Not a finding — it is #2** |

Six of eight are live. The two that changed shape are the two worth reading.

## 2. Finding 8 is finding 2, and that makes it worse

The report treats "`done` accepts anything" as a documentation-versus-code gap
and rates it low: the protocol promises a guarantee the state machine does not
enforce. That is not what is happening. The gate exists, shipped in 0.3.0
([[CHG-0048]]), and works.

Two cards in one workspace, identical but for the heading:

```
$ workfile card ac T-0001          # "## Criterio de aceptación"
T-0001 declares no acceptance criteria
$ workfile card transition T-0001 done
T-0001 → done

$ workfile card ac T-0002          # "## Acceptance criteria"
T-0002 — 0 of 2 met
$ workfile card transition T-0002 done
CARD_ACCEPTANCE_UNMET: T-0002 has 2 unproven acceptance criteria: #1 ...

$ workfile doctor
Workfile doctor: 0 errors, 0 warnings
```

The gate did not fail. It was handed a card with zero criteria and correctly
let it through. `HEADING` in `acceptance.ts:27` is `/^(#{1,6})\s+acceptance\s+
criteria\b.*$/im` — case-insensitive, English-only — so a board written in the
language the product offers reports no criteria at all, and `doctor` says
nothing.

So the severity inverts. This is not a low-priority wording mismatch; it is the
product's one hard guarantee silently disabled, and the failure is invisible
precisely to the user who took `language: "es"` at its word. It is the first
thing to fix.

**And it is not a translation bug.** Spanish output is being removed outright —
[[ADR-0012]], against [[T-0158]] — so the first reading of this finding, teach
the parser the translated headings, died with it. The exposure was never
Spanish anyway. Five headings, same two checklist items, 0.6.0:

```
Success criteria           -> declares no acceptance criteria
Criteria                   -> declares no acceptance criteria
Definition of done         -> declares no acceptance criteria
Acceptance Criteria:       -> 0 of 2 met
Acceptance criteria (v2)   -> 0 of 2 met
```

`## Definition of done` disables the gate as thoroughly as `## Criterio de
aceptación`, in English, on a board doing nothing unusual. What the tester
found through the language option is reachable without it. The defect is that
`card ac` asserts "declares no acceptance criteria" about a card carrying two,
and neither `done` nor `doctor` looks at the body that says otherwise.

## 3. Finding 4 is latched, not ongoing

The report reads the missing trailing newline as a 0.5.4 regression in the
generator. Generating from scratch at 0.6.0 produces `0a` correctly. But the
repair never reaches a file that already lost it:

```
after stripping newline: 2e
  unchanged  .claude/commands/claim.md
after re-running claude install: 2e
Claude Code surface: 7 current, 0 to sync
```

`renderManagedBlock` digests `String(body).trimEnd()`, so the trailing byte is
outside what the digest covers. The file compares equal, `syncManagedFile`
reports `unchanged`, and `claude check` reports `current`. Every workspace that
passed through 0.5.4 is stuck, and the health check that exists to catch this
cannot see it.

This repository is one of them: its four `.claude/commands/*.md` end at `2e`
today, at 0.6.0, and `claude check` calls all seven files current.

## 4. Minor observations, all confirmed at 0.6.0

- `docs.sources` is generated as `.project/specs/**/*.md`; `init` never creates
  `.project/specs`, and `doctor` does not flag the dangling glob. It does
  create `.project/docs` and `.project/sources`, which the report notes is
  confusing about where things go.
- `AGENTS.md` and `CLAUDE.md` differ only in the managed header and the title
  line — 688 bytes against 687. An agent loading both pays for the same
  protocol twice.
- `init --dry-run` plans 14 directories and 3 files; the real run creates 19
  directories. The report saw 14/4 against 19/6 under 0.5.4.

Grouped into [[T-0173]]. Two further observations were not re-tested: hooks
exiting 0 in silence on unrecognised input, and the UI dying with its launching
session.

## 5. What the report gets right about the design

Worth recording, because it is external and specific: the managed-block digest
survived a real upgrade with 30 hand-written lines below the block; the error
message for claiming with a foreign `--actor` was singled out as among the best
the tester had seen in a CLI; `init --dry-run --json`, the stable error codes,
`doctor --fix` renaming on retitle, and diacritic-insensitive search were all
called out unprompted. The Spanish translation was judged natural rather than
machine-made — which is exactly why finding 2 costs what it does.
