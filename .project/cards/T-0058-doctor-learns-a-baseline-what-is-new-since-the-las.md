---
id: T-0058
title: "doctor learns a baseline: what is new since the last run"
status: done
type: feature
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, doctor]
scope: [packages/workfile/src/modules/health, packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts, packages/workfile/docs/cli.md]
created: 2026-07-31
updated: 2026-07-31
---

`doctor` reports absolute state. On a repository with a large inherited backlog
of warnings that makes it advice rather than a gate: the protocol says to run it
before finishing, but a clean run is indistinguishable from an unchanged dirty
one.

A reporting agent on a repository with 640 preexisting `doc-broken-local-link`
warnings worked around this by writing down the 640/44/3 triple at session start
and diffing against it by hand. It worked, and it caught a genuinely new
`ci-template-stale` after the 0.1.9 adapter bump — but among 688 lines, and only
because it had remembered to record the baseline unprompted.

There is no baseline concept anywhere in the source.

## Scope

A recorded baseline plus a "new since" mode. Sketch, not a decision:

- Persist a fingerprint of the issue set under the cache, keyed by rule and
  identity rather than by count, so a fixed warning and a new one of the same
  rule do not cancel out.
- `--new` (or `--since-baseline`) reports only issues absent from it, and exits
  non-zero on new problems alone.
- An explicit way to accept the current state as the baseline, so adopting
  Workfile on an existing repository does not start with an unpayable debt.

The payoff the reporter named: this is what lets `doctor` be required before
finishing instead of merely recommended. The protocol already asks for the run
(`.project/agents/protocol.md`, "Finishing"); today it cannot ask for a verdict.

Depends on nothing, but [[T-0053]] should land first — a baseline over an output
that ignores its own filter would inherit the noise it exists to remove.

## Activity

- 2026-07-31 21:21Z session-fube-triage · claimed
- 2026-07-31 21:26Z session-fube-triage · doing → done

## Verification

- 2026-07-31 21:26Z session-fube-triage — Runtime, full cycle on a throwaway workspace with two inherited errors: `--new` without a baseline fails with DOCTOR_BASELINE_MISSING naming the command that fixes it; `--accept-baseline` writes 2 issues and `--new` then reports "0 errors, 0 warnings / 2 known" at exit 0; adding a third broken source makes `--new` report that one alone at exit 1 while plain doctor shows all three; clearing one inherited issue reports "1 known, 1 resolved" and suggests re-accepting, with the new issue still listed rather than cancelled out. `--new --severity warning` composes. pnpm check green end to end: 181 + 7 tests, strict held at 647.

## Decisions

- 2026-07-31 21:26Z session-fube-triage — Two departures from the sketch in the body, both deliberate. The baseline is committed at `.project/doctor-baseline.json` rather than written under `storage.cache`: `.cache` is gitignored, so a cached baseline would be per-clone and absent in CI, which is the one place a "nothing new" verdict has to hold — and a tracked file puts newly accepted debt in the diff. It stores readable `{code, id, file, message, count}` entries rather than opaque hashed keys, for the same reason: the file only earns being committed if a reviewer can read it. Second, issue identity includes the message, not just rule and subject, so a card with two invalid enums stays two issues; the cost is that `stale-write-lock` embeds a pid and therefore always reads as new, which is the right answer for that rule.
