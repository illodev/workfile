---
id: CHG-0131
title: The Workflow view applies the filters it draws
type: fixed
area: ui
visibility: public
cards: [T-0191]
tags: [workflow, filters]
created: 2026-08-05
updated: 2026-08-05
---

Workflow rendered the shell's status, area, type, priority and milestone filters and applied none of them: the chips moved, the URL updated, the graph did not. Two of the five were not in the graph payload at all, so it gains `priority` and `milestone`.

The strip narrows cards; records of other kinds stay as the things cards point at, and one that no surviving card points at goes with them. The view's own kind and relation toggles compose with the strip rather than being overridden by it.

An empty canvas now says which of its two causes emptied it. Nothing matched is one answer; what matched is unconnected and hidden by *hide isolated* is another, and it comes with the toggle that undoes it.
