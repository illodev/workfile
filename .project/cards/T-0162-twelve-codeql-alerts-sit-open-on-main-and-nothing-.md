---
id: T-0162
title: Twelve CodeQL alerts sit open on main and nothing fails because of them
status: backlog
type: task
priority: medium
area: core
effort: M
scope: [packages/workfile/src/modules/cards/acceptance.ts, packages/workfile/src/modules/docs, packages/workfile/src/modules/records/index.ts, packages/workfile/src/modules/search/search.ts, packages/workfile/ui/src/components/Markdown.tsx]
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

- [ ] Every open alert is either fixed or dismissed with a stated reason
- [ ] The two in `Markdown.tsx` are assessed against what the UI actually renders
- [ ] A new alert on merged code reaches somebody without a PR comment
- [ ] `pnpm run check` green, doctor 0/0
