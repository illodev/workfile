---
id: CHG-0028
title: doctor --severity filters the headline and the rule breakdown too
type: fixed
area: core
visibility: public
cards: [T-0053]
created: 2026-07-31
updated: 2026-07-31
---

`--severity error` filtered the printed issue list and nothing else. The
headline still counted every severity and the "By rule" grouping still walked
the unfiltered set, so on a repository carrying hundreds of inherited warnings
the filter returned the one line you asked for wrapped in everything you had
just excluded.

The filter now applies to the whole report, in text and in JSON, and the
excluded issues are reported as a single suppressed count rather than dropped
without trace.
