---
id: ADR-0018
title: A view owns the drawer when it already renders the selection
status: accepted
related: [T-0197, T-0192]
supersedes: [ADR-0017]
tags: [ui]
created: 2026-08-05
updated: 2026-08-05
---

## Context

The shared drawer opens over a view when that view cannot show the selected
record. `VIEW_OWNS_DRAWER` names the exceptions, and it named one: docs.

History was reported as a bug — clicking a fragment raised the drawer — and
ADR-0017 decided against changing it. That decision was wrong, and the way it
was wrong is the reason for this record.

History is a two-column view and always has been: fragments on the left, a
right-hand pane showing the derived changelog until a fragment is selected and
that fragment afterwards. Clicking a fragment rendered it in the pane **and**
opened the drawer over the pane with the same fragment in it. The reader got the
text twice and could read neither: the copy underneath was cut off mid-word by
the copy on top.

ADR-0017 asserted that giving history a reader "means giving history a second
pane — a layout decision with a cost". The second pane already existed. That
assertion came from the card, was not checked, and a rule was then built on top
of it: a view owns its reader when its list is *reference material* rather than a
*queue*. The taxonomy was plausible and produced the wrong answer, because it
had to be reasoned about and the reasoning was done without opening the view.

## Decision

**A view owns the drawer for a collection when it already renders the selection
itself.** That is the whole rule.

It is mechanical. Open the view, select a record, and look at whether the record
appears without the drawer. If it does, the drawer must stand down or it covers
the thing it duplicates. If it does not, the drawer is the only thing that can
show the record and must open.

So `VIEW_OWNS_DRAWER` maps docs to `docs` and history to `changelog`, and the
drawer still covers history for a card linked from inside a fragment body,
because the history pane cannot render a card.

## Consequences

A view that grows a reader has to be added to the map in the same change, and
the test for whether it should be is now something a reviewer can perform in
fifteen seconds instead of something they have to be argued into.

The rule says nothing about which records deserve a pane. That is a separate
question, and conflating the two is what produced ADR-0017: "should history have
a reader" and "history has a reader" are not the same question, and only the
second one was on the table.

## What survives from ADR-0017

One finding, and it is independent of the rule that was wrong. `Inspector`
carries a previous/next cursor for cards; `RecordPanel` — every other kind
reached from outside the view that lists it — has none. That is T-0207 and it
stands on its own.

## Rejected

**Keeping the taxonomy and adding history to it as a special case.** A rule that
needs an exception on its first application is not the rule.

**Deciding it from the code.** The previous attempt read `navigation.ts`,
`RecordPanel`, `Inspector` and the card, and got it wrong, because none of them
say what is on the screen at the same time as what else. The view had to be
opened. It has been, before and after, and the screenshots are what settled it.
