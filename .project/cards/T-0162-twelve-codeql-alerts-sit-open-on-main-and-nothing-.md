---
id: T-0162
title: Twelve CodeQL alerts sit open on main and nothing fails because of them
status: done
type: task
priority: medium
area: core
effort: M
scope: [packages/workfile/src, packages/workfile/ui, .github/workflows]
origin: [T-0157]
created: 2026-08-05
updated: 2026-08-05
---

Found while clearing the one CodeQL raised on the T-0157 branch. That alert
(`js/polynomial-redos` in `appendUnderHeading`) is fixed, and merging the
branch also closes two more — the old `patchCardBody` lines it deletes. What
is left is everything that was already there:

| # | Rule | Where | Since |
|---|---|---|---|
| 10, 11 | `js/xss-through-dom` | `ui/src/components/Markdown.tsx` | 2026-07-30 |
| 12 | `js/stack-trace-exposure` | `test/fixtures/legacy-v1/board/server.mjs` | 2026-07-30 |
| 13 | `js/polynomial-redos` | `cards/mutations.ts` | 2026-07-30 |
| 16, 17 | `js/polynomial-redos` | `docs/validation.ts`, `docs/docs.ts` | 2026-07-30 |
| 18 | `js/polynomial-redos` | `records/index.ts` | 2026-07-30 |
| 19, 20 | `js/regex-injection` | `search/search.ts` | 2026-07-31 |
| 21, 22 | `js/polynomial-redos` | `cards/acceptance.ts` | 2026-08-01 |

All on `refs/heads/main`, the oldest a week old, every one rated `high` by the
rule's own severity. `security_severity_level` is the rule's rating and not a
judgement about this codebase — several are likely to be honest false
positives, and saying which is most of the work.

## Why it is a card and not a chore

The `codeql` job passes on every run. It analyses and uploads; the alerts land
in the Security tab and nothing gates on them, so the only reason any of these
was ever looked at is that the review bot commented on a *new* one inline. An
alert on code that is already merged has no such messenger.

So the count only goes up, and the signal that told us about #25 within a
minute is exactly the signal that never fires for #10 through #22.

## The two kinds here

**Worth reading carefully.** `js/xss-through-dom` in `Markdown.tsx` is the only
one touching rendered output, and the UI renders record bodies — which are
repository text, but repository text an agent writes. `js/regex-injection` in
`search.ts` builds a regex from a query string.

**Probably noise, but has to be shown to be.** The `polynomial-redos` set is
mostly anchored patterns matched against one line at a time, where the scan is
linear however it looks. The one on the T-0157 branch was *not* noise — it ran
over a whole body — which is the reason to check rather than assume.

## Options for the gate

1. Fail the build on `high` alerts. Honest, and blocks everything until the
   false positives are dismissed with a reason — which is arguably the point.
2. Report the count in the workflow summary. Cheap, visible, gates nothing.
3. Triage now, dismiss what is noise with a written reason, and leave the gate
   alone. The alerts stop accumulating without a policy decision.

## Acceptance criteria

- [x] Every open alert is either fixed or dismissed with a stated reason
- [x] The two in `Markdown.tsx` are assessed against what the UI actually renders
- [x] A new alert on merged code reaches somebody without a PR comment
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-05 16:20Z illodev@local#2cddaf94 · claimed
- 2026-08-05 16:41Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:16Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 16:41Z illodev@local#2cddaf94 — Criterion 1 is deliberately left unchecked, and the reason matters more than the box: alerts #19 and #20 (js/regex-injection in search.ts) are neither fixed nor dismissed. They are real — /(a+)+$/ is six characters, passes the 256-char pattern cap and the imsu flag allowlist, and takes 57s against a 32-character body against a 20,000-character cap — so dismissing them would be false, and fixing them needs a design decision between a worker deadline, RE2 and dropping user regex. They are accepted in .github/codeql/accepted-alerts.json with the measurement and tracked as T-0190. Checking the box because the spirit is met is what T-0174 exists to catch.
- 2026-08-05 16:41Z illodev@local#2cddaf94 — Triaged by measurement, which is what the card said the work was. js/polynomial-redos at 16x input: acceptance.ts ITEM 1x, records/index.ts QUERY_TOKEN 1x, docs/validation.ts link scan 217x, docs/docs.ts trailing slash 230x. The two quadratic ones were worse than reading suggested — 43.6s on a 128KB document body, in the scan the doctor runs for every document. Both bounded now: the link target excludes newlines and caps at 1024 (longer than any POSIX path, and data: URIs are skipped by the scheme test anyway), and the trailing-slash strip is a slice loop. The two in Markdown.tsx were assessed against React 19, which does block javascript: via sanitizeURL — so nothing was exploitable, and the allowlist is now ours in ui/src/safe-url.ts rather than a dependency's minor version. Three false positives and the legacy fixture dismissed on GitHub with their measurements; fixtures excluded from analysis in .github/codeql/codeql-config.yml. Criterion 3 is a daily codeql-baseline workflow comparing open alerts against a committed accepted list — the same ratchet shape as strict-baseline.json and doctor-baseline.json, daily rather than on push because the alerts API serves the previous analysis until the new one finishes processing. 328 tests, ratchet 494, doctor 0/0.
- 2026-08-05 17:09Z illodev@local#2cddaf94 — Runtime evidence after the merge of PR #23. Open alerts on main went from 10 to 2, and the 2 are exactly the accepted entry (js/regex-injection in search.ts, T-0190). #16 and #17 closed on their own when main was re-analysed, which is the confirmation the two quadratic fixes were the fix; #10, #11, #12, #18, #26 and #27 are dismissed with their measurements. The codeql-baseline workflow was dispatched against main and passed on real data: 'every open alert is accounted for', no unaccounted list and no stale-entry warning. Criterion 1 remains the only one unmet and is not going to be met by this card — the two search.ts alerts are real, so dismissing them would be false, and fixing them is T-0190. Not forcing the transition: a forced transition currently leaves no trace it was forced (T-0184), so bypassing the gate silently on the repository that just repaired that gate is the wrong way to close this.
- 2026-08-05 17:16Z illodev@local#2cddaf94 — Closed with --force, and this line is the trace the transition will not leave (T-0184). Criterion 1 is unmet and stays unmet: alerts #19 and #20 are real, so dismissing them would be false, and fixing them is T-0190. Álvaro approved the deviation explicitly after the post-merge evidence — the scope moved to another card rather than the criterion moving to fit the work, which is the distinction T-0174 is about. Forced rather than checked off, so the unmet box stays visible on the card forever.
- 2026-08-05 18:13Z illodev@local#2cddaf94 — Criterion 1 is met now, and by the work rather than by indulgence. It was left unchecked because alerts #19 and #20 were real; T-0190 bounded them in a worker with a deadline, #20 closed on main's own re-analysis, and #19 — the new RegExp in compileRegexQuery — is dismissed as 'won't fix' with the reason that it IS the feature: /pattern/flags compiles the user's own expression, so no version of it keeps input away from RegExp, and the harm the rule implies is the unbounded execution T-0190 removed. Open alerts on this repository: zero. The accepted list is empty as a result, which is its resting state and not a gap — the daily job now fails on anything at all, the tightest the ratchet goes.
