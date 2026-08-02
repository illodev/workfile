---
id: T-0109
title: The SSE external-write test is flaky on the Windows runner
status: backlog
type: bug
priority: medium
area: infra
scope: [packages/workfile/test/events.test.ts, packages/workfile/src/core/watcher.ts]
created: 2026-08-02
updated: 2026-08-02
---

`events.test.ts:157` — "the SSE channel reports writes made outside the
server" — failed on `check (windows-latest, 22)` at commit `7b70ee4` and passed
on a re-run of that same commit. Same code, same runner image, both outcomes.
Not a regression: it is a race that was already there and is now more likely to
fire.

```
not ok 124 - the SSE channel reports writes made outside the server
  error: one write, one records.changed
  0 !== 1
```

The test writes a card outside the server and polls for up to 3000 ms for the
watcher to deliver it. Zero frames means nothing arrived in three seconds. The
heartbeat is not the culprit — it is an SSE comment and `readStream` skips
lines starting with `:` — so this is `fs.watch` delivery latency under load.

What changed around it: [[T-0102]] added `axes.test.ts`, which starts an HTTP
server and spawns CLI subprocesses. Node's test runner runs files in parallel,
so every file added raises contention on the slowest runner in the matrix. The
flake was latent; the suite got heavier and it surfaced. Every further test file
makes it likelier, which is why this is worth fixing rather than re-running.

Re-running until green is the failure mode to avoid here: it launders a real
signal, and this repository has already shipped three commits on a red CI once
because nobody looked.

## Acceptance criteria

- [ ] The cause is established — watcher delivery latency, a dropped event, or
      an event the batch never flushed — rather than assumed
- [ ] The test distinguishes "the event never arrived" from "it arrived slowly",
      so a failure says which
- [ ] The Windows job passes the SSE test across repeated runs of one commit
