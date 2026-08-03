---
id: T-0140
title: Concurrent card creation fails with EPERM on Windows instead of retrying
status: review
type: bug
priority: high
area: core
created: 2026-08-02
updated: 2026-08-03
scope: [packages/workfile/src/core, packages/workfile/test/locks.test.ts, packages/workfile/test/record-ids.test.ts, packages/workfile/src/modules/health/renumber.ts]
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

- [x] `EPERM` on the lock path is treated as contention and retried, not
      reported as `INTERNAL_ERROR`
- [x] The retry is bounded and gives up with an error that names contention
- [x] A test drives the failure directly — by making the lock open reject with
      `EPERM` — rather than relying on a race to reproduce it
- [x] Every other lock this repository takes is checked for the same
      assumption about which error code means contention

## Activity

- 2026-08-03 09:44Z illodev@local#bd44efc7 · claimed
- 2026-08-03 09:53Z illodev@local#bd44efc7 · doing → review

## Notes

- 2026-08-03 09:53Z illodev@local#bd44efc7 — The failing call was not `withFileLock`. It was `acquireRecordId`, which takes the id reservation through `createFileExclusive` and had its own copy of the same assumption:

    record-ids.ts:109   if (error?.code !== "EEXIST") throw error;   // reservation
    record-ids.ts:156   if (error?.code !== "EEXIST") throw error;   // durable write
    locks.ts:96         if (error?.code !== "EEXIST") throw error;   // write lock

One predicate now answers for all three. `isCreateContention` accepts `EEXIST`, `EPERM` and `EBUSY` everywhere, and `EACCES` only on Windows — on POSIX that code is the ordinary "this directory is not yours to write in", and retrying it until a timeout would bury the real cause under a report about contention. The codes are a property of the filesystem rather than of the kernel, which is why the rest are not gated on the platform: a repository on an SMB share hits the same refusals from Linux.

Proven red before green by reverting the predicate to `EEXIST` alone and rebuilding:

    not ok 6  - a lock refused with EPERM is waited out, not reported as a fault
    not ok 7  - a lock that is never grantable gives up naming the contention
    not ok 8  - contention is told apart from a directory that is not writable
    not ok 11 - a reservation refused with EPERM moves on instead of failing the create
    not ok 12 - a reservation that is never grantable gives up naming the contention
    not ok 13 - a durable write refused with EPERM retries with a fresh reservation

    --> restored: 14 pass, 0 fail; whole suite 258 pass, 0 fail
    --> strictNullChecks held: 588 known errors across 57 files, none new

The refusal is injected rather than raced. The CI failure needed four processes over a 500-record corpus and fired in one round out of sixteen, on one of the two Windows matrices; a test that waits for that is not a test. Both injection points are documented as what they are — `create` on `ReserveRecordIdOptions` and `open` on the lock options — instead of being disguised as features.

Giving up now names the refusal that used up the clock: `WRITE_LOCK_TIMEOUT` carries `details.lastError` and the allocation failure carries `details.contention`. Without it a delete-pending lock reports no owner and no code, so a busy repository and an unwritable cache directory fail identically.

## The audit AC 4 asks for

Locks and exclusive creates, all of them:

- `withFileLock` — fixed. On a non-`EEXIST` refusal the staleness read finds nothing to read, returns `unreadable`, and the loop falls through to the deadline, which is the behaviour wanted.
- `acquireRecordId` reservation and `reserveRecordId` durable write — fixed, and both bounded by `maxRetries` as before.
- `renumberCard` — took the same reservation and caught nothing, so even a plain `EEXIST` surfaced as `INTERNAL_ERROR`. Both of its creates now report `CARD_ID_TAKEN`, which is the code the same function already throws for an id it can see is in use.
- `reslugStaleCardFiles` — its contract says collisions are skipped, and the name set it checks is read before the loop runs. A name claimed underneath it now skips with `name-taken` instead of escaping as a fault.
- `doctor` and `card reap` only read the lock directory; nothing to classify.
- HTTP asset upload — checked and deliberately unchanged. It maps `EEXIST` to `ASSET_ALREADY_EXISTS` as a semantic answer, not as a retry, so widening it there is a status-code decision rather than a contention one. Recorded on [[T-0142]].

`writeFileAtomic` is the one thing this fix does not reach: its create cannot collide, but it ends in a `rename`, and Windows refuses a rename whose destination any reader holds open. Every durable write in the product goes through it. Filed as [[T-0142]] rather than guessed at here, because the transient and permanent cases report the same code and telling them apart needs the failure driven, not reasoned about.
