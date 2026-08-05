---
id: ADR-0014
title: A normative record past the cap degrades to a title, never to a count
status: accepted
created: 2026-08-05
updated: 2026-08-05
---

[[T-0172]] exempted conventions and accepted decisions from the relevance
filter, on the argument that a rule binds work that does not mention it:
CONV-0001, "protocol records are written in English", shares no vocabulary with
a card about a render loop and governs it completely. That argument still
holds. What it did not survive was the cap applied immediately after it.

`--limit` defaults to 20 and tops out at 50. A workspace with fifty accepted
ADRs put all fifty into the bundle by exemption and then cut thirty of them by
slice, so the guarantee the exemption exists to make was true only for
workspaces small enough not to need it. The footer said `30 beyond --limit`,
which is a number, not a rule an agent can avoid contradicting.

**A normative record that does not fit is rendered as its title, under "Also in
force", rather than dropped.** Sixty characters against several hundred: the
bundle stays inside a prompt, and an agent can still see that ADR-0031 exists
and go read it before contradicting it.

Three candidates were rejected, and the reasons are the useful part:

- **Cap per collection, with a floor for normative records.** Solves a problem
  ranking already solves. An unranked record sorts to the tail on `Infinity`,
  so the records the cap reaches are exactly the ones that merely qualified; a
  decision that outranks a learning for this card deserves the slot it took,
  and a floor would take it back on a rule that cannot see why.
- **Scope every decision.** `scope` already filters when both sides declare it,
  and it is the right field for an ADR that genuinely binds one area. It is not
  a fix for this: the flood is made of decisions that bind everything, which is
  why they have no scope.
- **Supersede properly.** The real fix, and out of reach from here. An ADR a
  later one replaced should not be `accepted`, and if that discipline holds the
  live set stays small on its own. It is a workflow question, so the digest has
  to hold for the workspaces where the discipline has slipped.

The digest is uncapped, which follows from the last of those: it is bounded by
the accepted normative set, and a workspace where that alone will not fit is
telling you its supersede discipline has stopped working. Truncating the digest
would hide the one signal that says so.

`truncated` keeps its meaning — not everything is here in full — and the
digested records are their own field rather than a third entry under `omitted`,
because they are in the bundle. Folding them into "left out" would report the
one thing that is not true of them. [[T-0147]] is open on a neighbouring case
of one field carrying two meanings.
