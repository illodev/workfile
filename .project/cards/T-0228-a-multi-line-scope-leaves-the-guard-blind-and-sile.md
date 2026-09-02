---
id: T-0228
title: A multi-line scope leaves the guard blind and silent
status: backlog
type: bug
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-02
---

`frontmatterOf` in the Claude hook runtime splits frontmatter line by line with
`^([A-Za-z_][\w.-]*):\s*(.*)$` and only understands a `[...]` sequence closed on the **same line**.

A card whose `scope:` is written any other way therefore reaches the guard with **no usable scope**,
and the guard goes blind for that card **without saying anything**.

## Measured

Case 14 of the Fube bench `scripts/workfile-guard-cases.mjs`, driving the real `session-start` and
`pre-tool-use` against synthetic cards in a throwaway workspace:

| how `scope:` is written | scope the hook reads | guard |
| --- | --- | --- |
| flow sequence, one line (control) | `["scripts/uno.mjs","scripts/dos.mjs"]` | asks — correct |
| block sequence (`scope:` + `-` items below) | `[]` | **silent** |
| flow sequence split across lines | `["["]` | **silent** |

The third is the nastier of the two: the scope is not empty, it holds one entry that matches
nothing, so anything looking at it sees a scope and believes it.

## Why this is not hypothetical

Both shapes are what a formatter produces. `T-2207` in the Fube board documents 135 of 1 811 cards
already split that way by prettier at `printWidth 80`. Any pass by a formatter that does not honour
`.prettierignore` — a format-on-save from another editor, another repo consuming the package, an
agent tidying up — turns a protected card into an unprotected one, silently.

## The fix

Teach `frontmatterOf` the block sequence and the multi-line flow sequence, which the package codec
already handles elsewhere; the hook duplicates the parser deliberately (it imports nothing), so the
two have drifted. Add the split-scope card as a bench case: today nothing pins it.

Cheap interim alternative, if the parser stays as it is: a `doctor` finding for any card whose
`scope:` is not on one line — so the blindness at least becomes visible.
