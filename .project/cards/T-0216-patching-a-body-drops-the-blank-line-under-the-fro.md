---
id: T-0216
title: Patching a body drops the blank line under the frontmatter
status: done
type: bug
priority: medium
area: core
created: 2026-08-07
updated: 2026-08-07
scope: [packages/workfile/src/core/frontmatter.ts]
verified:
  at: "2026-08-07T20:16:05.596Z"
  method: local
  commit: 61512e4dce848b0646b87f3c438a55f996a9b1d5
  digest: "sha256:bc3c28399e93afe2c8d97190439f85c26917851205a7ec7c52482001f58b589b"
---

`createChangeFragment`, `createManagedDocument` and `createMemoryRecord` render
`---`, a blank line, then the body. The four sites that *patch* a body spliced
it straight onto `prefixLength`, which ends at the closing `---` newline, so the
blank line disappeared: `changelog patch`, `changelog release --amend`,
`doc patch` and `memory patch` alike.

Nothing breaks. The file still parses and still renders. What it produces is one
line of diff on a write whose entire purpose was to change the body — and it
only ever happens once per record, so it reads like something the author did.
Twelve records in one consuming repository carried the mark before anyone traced
it back to the tool.

Fixed in one place rather than four: `replaceBody` in `core/frontmatter.ts`,
which also takes the end-of-line from the file the way `patchFrontmatter`
already does. The inline versions hardcoded `\n`, so patching a CRLF record
mixed line endings on exactly the line they were adding.

## Acceptance criteria

- [x] `patch` and `create` produce the same shape for the same record.
- [x] A record that already lost its blank line gets it back on the next patch.
- [x] Patching a CRLF record does not introduce a bare LF.
- [x] Writing the same body twice is a no-op on disk.
- [x] Full suite green.

## Notes

Reported from Fube on 2026-08-07, found by round-tripping a fragment through
`changelog patch` and reading the resulting `git diff`.
- 2026-08-07 20:16Z illodev@local#42eb42f5 — local verification: Verified end to end against the shipped binary in a scratch workspace. changelog patch on a committed fragment now produces a one-line git diff — the body — with the blank line under the frontmatter untouched, which is the card's own reproduction. A record whose blank line was spliced away by hand gets it back on the next patch, and the same holds for doc patch and memory patch, so the fix really is in the one shared writer rather than in one of the four call sites. A record converted to CRLF stays 11 CRLF and 0 bare LF across a patch, with the blank line itself CRLF. Writing the same body twice leaves both the content and the mtime untouched, so it is a genuine no-op and not an identical rewrite. Full gate green: 470 + 10 tests.

## Activity

- 2026-08-07 10:04Z illodev@local#bada1057 · backlog → review
- 2026-08-07 20:13Z illodev@local#42eb42f5 · claimed
- 2026-08-07 20:16Z illodev@local#42eb42f5 · released
