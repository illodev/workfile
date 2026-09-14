---
id: CHG-0196
title: The link-scan safety test asserts how the scan scales, not how long it takes
type: changed
area: core
visibility: internal
cards: [T-0258]
created: 2026-09-14
updated: 2026-09-14
---

`record-body-safety.test.ts` guarded the doctor's link scan with a 2000ms wall-clock ceiling, and one macOS runner configuration measured the bounded scan at 2293ms, 788ms and 392ms on one commit. The scan is linear with a large constant, so the test now times it over N and 2N characters, fastest of several runs, and requires under 3× — beside a control that runs the unbounded spelling the fix replaced and requires over 3×, so a machine whose timings cannot tell linear from quadratic fails instead of passing unexamined.
