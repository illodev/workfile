---
id: T-0140
title: Concurrent card creation fails with EPERM on Windows instead of retrying
status: next
type: bug
priority: high
area: core
created: 2026-08-02
updated: 2026-08-02
---

Four processes creating cards at once against a 500-card corpus, on the
Windows runner:

```
round 10 had failures
+ [
+   "INTERNAL_ERROR: EPERM: operation not permitted, open
+    'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\workfile-ids-EpLKDh\\.project\\.cache\\locks\\ids\\T-0538.lock'"
+ ]
```

The ID lock is taken by opening a lock file exclusively and treating the
failure as "someone else holds it". On Windows that failure is not always the
code the retry expects: a file being created or removed by another process
reports `EPERM` where POSIX reports `EEXIST`, and `EPERM` falls through to the
generic handler and surfaces as `INTERNAL_ERROR`.

So it is not the test being flaky. The test is doing exactly what it was
written to do — [[T-0105]] already established that this repository's
concurrency story has to hold on Windows, because that is where the derived
actor broke — and it caught a case the lock does not handle. A user hitting it
sees a card creation fail outright rather than wait its turn, which is the
same class of problem [[T-0117]] and [[T-0099]] closed for claims.

It is intermittent by nature, and it did not fail on the Node 24 runner in the
same CI run, so a fix has to be argued from the error handling rather than
from a green suite.

## Acceptance criteria

- [ ] `EPERM` on the lock path is treated as contention and retried, not
      reported as `INTERNAL_ERROR`
- [ ] The retry is bounded and gives up with an error that names contention
- [ ] A test drives the failure directly — by making the lock open reject with
      `EPERM` — rather than relying on a race to reproduce it
- [ ] Every other lock this repository takes is checked for the same
      assumption about which error code means contention
