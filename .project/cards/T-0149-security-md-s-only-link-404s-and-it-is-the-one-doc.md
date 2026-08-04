---
id: T-0149
title: SECURITY.md's only link 404s, and it is the one doc no check reads
status: review
type: bug
priority: medium
area: docs
created: 2026-08-04
updated: 2026-08-04
scope: [SECURITY.md, packages/workfile/test/documentation.test.ts]
---

`SECURITY.md:23` closes the scope section with:

```md
The threat model, and what is deliberately *out* of scope, is written up in
[`docs/security.md`](docs/security.md).
```

Resolved from the repository root that is `docs/security.md`, which does not
exist. The file is `packages/workfile/docs/security.md`. GitHub renders
SECURITY.md in the Security tab, so the link a reporter follows to read the
threat model is a 404 — on the page whose entire job is telling them what is in
scope before they file.

It is the only broken relative link across the 19 documents checked.

## Why nothing caught it

SECURITY.md is invisible to both mechanisms that would have.

1. `project.config.mjs` declares `docs.sources` as `README.md`,
   `packages/workfile/docs/**/*.md` and `packages/*/README.md`. SECURITY.md
   matches none of them, so it is not an indexed document and `workfile doc
   list` never reports on it — 14 documents come back `current` and this is not
   one of them. AGENTS.md and CLAUDE.md have the same blind spot.
2. `test/documentation.test.ts` has a `DOCS` list of 11 entries and SECURITY.md
   is not among them, so none of the seven checks open it.

And no check resolves relative links in any case, on any document.

## The fix

Three things, smallest first:

1. Correct the link to `packages/workfile/docs/security.md`.
2. Add SECURITY.md to `DOCS` in `documentation.test.ts`. Confirm the existing
   seven checks still pass with it in — it names no commands, so they should.
3. Add a check that every relative Markdown link in the documented set resolves
   to a file on disk, anchors stripped. It costs one `existsSync` per link and
   catches the whole class.

On `docs.sources`: adding `SECURITY.md` there would also put it under freshness
tracking, but that is a judgment about what the project wants indexed, not a
bug fix. Decide it deliberately, in this card or not at all — do not widen the
glob as a side effect of fixing a link.

## Acceptance criteria

- [x] The link resolves to the file that exists
- [x] SECURITY.md is in the documented set the test suite reads
- [x] A check resolves relative links across that set and fails on the bad one
- [x] The `docs.sources` question is answered either way, in a note
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 19:28Z illodev@local#cfe281b4 · claimed
- 2026-08-04 19:31Z illodev@local#cfe281b4 · doing → review

## Notes

- 2026-08-04 19:31Z illodev@local#cfe281b4 — Fixed and verified locally. The link now resolves to packages/workfile/docs/security.md, and the new check fails on the old one — stashing SECURITY.md alone reproduces 'SECURITY.md:23 links docs/security.md, which does not exist' and nothing else, so the check is measuring the defect and not a class of noise. 11 checks in documentation.test.ts, suite 273/273, pnpm run check exit 0, ratchet 554 across 56 files none new, doctor 0/0.

The docs.sources question, answered yes: SECURITY.md is now indexed. The root cause was that no mechanism watched the file, and the test list closes only half of that — it catches broken links and stale commands, not a security policy nobody has reread in a year. Indexing gives it the 90-day freshness window the other documents already have. Verified it costs nothing: doctor stays 0/0 and it lists as PATH-F6ED156E4BF5, current.

AGENTS.md and CLAUDE.md deliberately stay out. Both are managed-block carriers that workfile agents sync rewrites, so freshness tracking would be measuring the generator, not a document anybody maintains.

One consequence not paid here: ui/src/demo-data.json snapshots this repository's own workspace, so the hosted demo picks SECURITY.md up on the next pnpm run demo:data. That regeneration is a release step and it is already owed for the four cards opened today; it is not part of this card and I have not run it.

Not verified on Windows — the link check resolves paths through new URL against a document base, which is exactly where Windows checkouts have bitten before. Stays in review until CI is green. Uncommitted.
- 2026-08-04 19:40Z illodev@local#cfe281b4 — Correction to the note above: no demo regeneration is owed. LRN-0003 records that vercel.json runs build:demo, which runs demo:data first, so the hosted demo rebuilds its snapshot from the .project/ of the deployed commit on every deploy. The tracked ui/src/demo-data.json exists only so a local --mode demo run has data without rebuilding the core. Indexing SECURITY.md therefore reaches the hosted Docs view on the next push with nothing to run by hand. I asserted the opposite without checking memory first, which is the exact failure LRN-0005 is about.

