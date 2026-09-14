---
id: CHG-0190
title: changelog verify and memory verify report what doctor finds
type: fixed
area: core
visibility: public
cards: [T-0252]
created: 2026-09-14
updated: 2026-09-14
---

`changelog verify` and `memory verify` built the index without asking for diagnosis, so they read the empty report an undiagnosed index carries and answered `0 errors` whatever the tree held — a released fragment whose file had been deleted passed, while `doctor` reported `release-missing-fragment` on the same tree. Both now diagnose, name the same issues `doctor` does, and exit 1 on an error with `--json` as well as without it (a JSON caller used to get 0 on a failing verdict).

A report that was never diagnosed can no longer be read as a verdict: `runDoctor` given an undiagnosed `index` refuses with `REPORT_NOT_DIAGNOSED` instead of passing three unchecked modules as clean, and every diagnosed report now carries `diagnosed: true`.
