---
id: T-0142
title: Every atomic write ends in a rename Windows can refuse
status: doing
type: task
priority: medium
area: core
created: 2026-08-03
updated: 2026-08-03
claimed_by: "illodev@local#bd44efc7"
claimed_at: "2026-08-03T09:59:44.034Z"
scope: [packages/workfile/src/core/filesystem.ts, packages/workfile/src/server/http.ts, packages/workfile/test]
---

Found while auditing the locks for [[T-0140]], which fixed the exclusive
creates. This is the other half of the same Windows behaviour and it was left
alone deliberately, because it is a different assumption and deserves its own
evidence.

`writeFileAtomic` writes a temporary file and renames it over the target:

```ts
const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
await rename(temporary, path);
```

The create is safe — a UUID name cannot collide — but on Windows `rename`
fails when any process holds the destination open, with `EPERM`, `EACCES` or
`EBUSY` depending on how the handle was taken. POSIX renames straight over an
open file and never notices.

Every durable write in the product goes through this function, and every read
opens the file it is about to be renamed over: the index builder, the watcher,
the HTTP server and the UI all read the same records the CLI writes. The window
is a few milliseconds wide and it needs a reader and a writer to overlap, which
is exactly the shape of the failure [[T-0140]] chased for a day.

## Why it is not simply retried

A rename that fails because a *reader* holds the target is transient and should
be retried. A rename that fails because the target is read-only, or because the
file is open by a process that will hold it for minutes, is not — and the two
report the same code. A bounded retry with a small delay is almost certainly
right, but "almost certainly" is what [[LRN-0011]] exists to refuse.

Note also that a failed rename leaves the temporary file behind. The `finally`
removes it, so this is a correctness question, not a litter one.

## Acceptance criteria

- [x] It is established, by driving the failure rather than by reasoning, that
      a reader holding the destination is enough to make `rename` fail on
      Windows for this exact call
- [x] If it is, the retry is bounded and distinguishes a transient refusal from
      a permanent one, and a test drives the refusal directly the way
      `record-ids.test.ts` does
- [x] The HTTP asset upload is revisited in the same pass: it maps `EEXIST` to
      `ASSET_ALREADY_EXISTS` and everything else to a 500, so the same Windows
      refusal answers 500 where it should answer the same 400

## Activity

- 2026-08-03 09:59Z illodev@local#bd44efc7 · claimed

## Notes

- 2026-08-03 10:07Z illodev@local#bd44efc7 — Answered by driving it, and the answer corrects two guesses this card was written on.

A throwaway probe went to the Windows runners, held the destination each way that could matter, and reported what `writeFileAtomic` did. Identical on Node 22 and 24:

    node reader (fs.open r)          EPERM rename
    outside share=None               EPERM rename
    outside share=Read               EPERM rename
    outside share=ReadWrite, Delete  EPERM rename
    after release (every case)       ok after ~100ms
    destination read-only            EPERM rename

First correction: I expected a Node reader to be invisible, because libuv opens with every share flag set. It is not — one `fs.open(path, "r")` from this very process is enough. That moves the exposure from editors and virus scanners, which are somebody else's problem, to the index builder, the watcher, the HTTP server and the UI, which are ours and which read exactly the records the CLI writes.

Second: the share mode makes no difference at all. Even `ReadWrite, Delete` is refused. So nothing here can be fixed by opening files more politely, and the retry is the only lever.

The refusal clears within 100ms of the holder letting go — the poll granularity, so probably sooner. The window is 500ms, an order of magnitude above what was measured, and it is a window rather than a promise: a destination held longer still fails, with its own errno rather than a translated one, because the caller needs to know what is holding the file.

The permanent case is the reason a retry alone would be wrong, and it reports the same `EPERM` from the same call. The code cannot tell them apart, so the destination is asked instead: if it is not writable, nothing is queued behind anything and the failure is immediate. That is one `access(W_OK)` before any of the sleeping, tested for both the timing and the attempt count.

Proven red before green by making the predicate return false:

    not ok 1 - a rename refused while somebody reads the destination is waited out
    not ok 2 - a destination held forever fails with its own errno, bounded
    not ok 6 - a rename refusal is told apart from a disk that is full

    --> restored: 6 pass; whole suite 264 pass, 0 fail; ratchet held at 588

One test in that file proves nothing locally and is kept anyway: "a reader that lets go mid-write does not cost the write" opens the destination for real, releases it after 120ms, and asserts the write lands. On POSIX the rename never noticed the handle, so it passes either way. On Windows it is the entire scenario, and CI is where it counts.

The probe was deleted once it had answered. Its numbers live in the comment at the top of `atomic-writes.test.ts`, where the next person to touch the retry will find them.
