---
id: CHG-0196
title: The link-scan safety test counts what the scan reads instead of timing it
type: changed
area: core
visibility: internal
cards: [T-0258]
created: 2026-09-14
updated: 2026-09-14
---

`record-body-safety.test.ts` guarded the doctor's link scan with a 2000ms wall-clock ceiling, and one macOS runner configuration measured the bounded scan at 2293ms, 788ms and 392ms on one commit; a scaling ratio tried next overlapped on CI, a bounded scan reaching 4.18× over twice the body while an unbounded one fell to 3.14×. The test now counts instead of timing: the destination scanner reads its body through a proxy that tallies every character read, which must stay within the bound for each destination it opens and grow in proportion to the body, and the label and destination bounds are pinned by what they refuse to read.
