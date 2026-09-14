---
id: CHG-0193
title: A doctor report past fifty warnings names --accept-baseline and --new
type: changed
area: core
visibility: public
cards: [T-0254]
created: 2026-09-14
updated: 2026-09-14
---

A consuming agent read 592 warnings from `doctor`, asked for a baseline or "only what is new since X", and never learned that `doctor --accept-baseline` and `doctor --new` already exist: the report ended on its counts. A text report carrying more than fifty warnings now ends with one line naming both flags — how to record the current state as known and then see only what appears after, or, once a baseline exists, how to read against it. Shorter reports, `--severity error` and `--new` itself print nothing new, and `--json` is unchanged.
