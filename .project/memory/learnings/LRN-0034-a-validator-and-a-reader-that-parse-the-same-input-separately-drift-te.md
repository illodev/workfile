---
id: LRN-0034
title: A validator and a reader that parse the same input separately drift; test the reader with every form the validator admits
status: active
confidence: high
related: [T-0242, DOC-0006, CHG-0171]
tags: [cli, parsing, testing]
created: 2026-09-11
updated: 2026-09-11
---

The CLI's flag check read a token's name as the part before `=`, so `--expected-revision=REV` was a known flag and passed. Every reader — `option()`, `listOption()`, `numberOption()`, `repeatedNumbers()`, `repeatedOption()`, `axisOptions()` — looked for the exact token, found nothing, and returned null. The command ran as if the flag had never been given and exited 0. A consumer reported it as "a truncated revision applied anyway": the revision was never compared. It sat under every value-taking option the binary has.

Nothing caught it because the two halves were each correct on their own terms and were tested on their own terms: the validator had tests for unknown and duplicated flags in the `=` spelling, the readers had tests in the space spelling. No test handed the reader a form the validator had admitted.

**Why:** a validator that admits a spelling is making a promise on behalf of the reader. When they are two functions with two grammars, the promise is only kept by coincidence, and the failure is the worst kind — silent, exit 0, the instruction evaporated.

**How to apply:** when one function decides what input is acceptable and another consumes it, enumerate the forms the first admits and drive the second with each of them, in a test that observes the effect (here: a write refused) rather than the parse. Better still, make them one walk over the input — `valuesOf()` now serves every reader — so the two grammars cannot part again. [[LRN-0033]] is the same lesson one level up: reading the code is not running it.
