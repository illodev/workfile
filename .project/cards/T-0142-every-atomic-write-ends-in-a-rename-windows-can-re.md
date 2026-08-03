---
id: T-0142
title: Every atomic write ends in a rename Windows can refuse
status: next
type: task
priority: medium
area: core
created: 2026-08-03
updated: 2026-08-03
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

- [ ] It is established, by driving the failure rather than by reasoning, that
      a reader holding the destination is enough to make `rename` fail on
      Windows for this exact call
- [ ] If it is, the retry is bounded and distinguishes a transient refusal from
      a permanent one, and a test drives the refusal directly the way
      `record-ids.test.ts` does
- [ ] The HTTP asset upload is revisited in the same pass: it maps `EEXIST` to
      `ASSET_ALREADY_EXISTS` and everything else to a 500, so the same Windows
      refusal answers 500 where it should answer the same 400
