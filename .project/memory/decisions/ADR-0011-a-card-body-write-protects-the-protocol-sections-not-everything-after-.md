---
id: ADR-0011
title: A card body write protects the protocol sections, not everything after them
status: proposed
created: 2026-08-04
updated: 2026-08-04
related: [T-0157, T-0115, T-0155, T-0108]
scope: [packages/workfile/src/modules/cards]
---
A card body write carries over the *protocol sections* from the stored copy.
Everything else in the body belongs to the caller, wherever it sits.

## Context

[[T-0115]] established that `## Activity` and `## Notes` are append-only: a
body write had erased the record of who moved a card and why, and
`project_card_write` is agent-facing. The guard shipped for that was positional
— find the lowest index of either heading, keep the stored body from there to
the end, take the sent body up to there.

"To the end" is the defect. A card whose body has any content *below* those
headings can never have that content corrected, and the command reports
success. Acceptance criteria are the common case, and they are the gate on
`done`: `assertAcceptanceMet` refuses a transition while one is unchecked, so
the list can be ticked through `card ac` but not rewritten.

The positional rule also reads headings out of fenced code blocks. [[T-0157]]
itself has a `## Notes` inside a fenced code block, quoting the repro. Writing that
card would freeze three quarters of it.

[[T-0157]] offered three ways out: refuse the write, protect the sections
individually, or refuse at authoring time.

## Decision

Protect the sections, not the tail.

A body is split into top-level sections by scanning lines with fence state, so a
heading inside a code fence is prose. The stored copy supplies the content of
`## Activity` and `## Notes`; the sent body supplies everything else, in the
order the caller wrote it. A protocol section the caller kept stays where the
caller put it. One the caller omitted is appended at the end, in stored order,
which matches SPEC 11.2's example body.

A write applies fully. When the caller sent a protocol section whose content
differs from the stored one, the result names it — `ignored: ["## Activity"]` —
and the CLI and MCP surfaces say so. Silence is what made this a defect;
refusing the whole write would make an ordinary read-edit-write cycle fail
whenever the trail moved underneath it.

One reading, shared. The scan replaced `indexOf` in every writer and reader
that looks for a heading — the trail, `card note`, the forced-claim reason,
and the acceptance parser — because they had the same defect, and finding it
four times was the evidence that it belonged in one place. `doctor` reports
what the old reading already wrote as `misplaced-trail`, and `doctor --fix`
moves those entries back.

## Alternatives

**Refuse the write when content would be dropped.** Loud, and consistent with
how the CLI treats a flag it cannot honour. Rejected because it leaves the
cards already in this shape unwritable forever — including [[T-0157]] — and it
turns a fenced heading into an unfixable card.

**Refuse at authoring time.** Cheapest, and it makes the state unreachable
going forward. Rejected on its own: it does nothing for the cards that have it,
and "you may not put a section after your notes" is a rule about document
layout that the protocol has no reason to hold.

## Consequences

A card in this shape is repaired by writing it, so it needs no doctor rule —
the shape stops being a defect rather than becoming a reported one. What does
need one is the damage already written: four cards in this repository, ten
entries, the whole history of [[T-0108]] among them. Those are prose now, and
`card write` can delete prose but cannot promote it into a section the
protocol owns — the correct asymmetry, and the reason the healer runs under
`--fix` instead.

The append-only guarantee is unchanged and now stated exactly: it covers the
content of two named sections, not the tail of the document. A caller that
edits inside them is still ignored there, but no longer silently.

Splitting by scanned lines rather than `indexOf` costs one pass over the body
and a fence state machine. Card bodies are kilobytes; this is not a cost.
