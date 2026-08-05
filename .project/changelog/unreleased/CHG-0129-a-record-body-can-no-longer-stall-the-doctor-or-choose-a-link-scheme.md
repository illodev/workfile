---
id: CHG-0129
title: A record body can no longer stall the doctor or choose a link scheme
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---

Two scans over document bodies were quadratic. A body of unclosed Markdown
links took 43.6 seconds at 128KB in the link check the doctor runs for every
document, and a folder of path separators took 189ms at 16,000 characters in
`doc create --folder`. Both are bounded and linear now, and a test holds each
to a measured budget.

The UI also decides for itself which URL schemes a record body may put in a
link. `javascript:`, `data:`, `file:` and protocol-relative targets render as
their own text instead of becoming a link. React 19 already blocked
`javascript:`, so nothing here was exploitable — but a record body is written
by whichever agent held the card, and that defence belongs to this package
rather than to a dependency's minor version.
