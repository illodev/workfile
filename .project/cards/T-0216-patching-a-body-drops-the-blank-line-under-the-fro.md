---
id: T-0216
title: Patching a body drops the blank line under the frontmatter
status: review
type: bug
priority: medium
area: core
created: 2026-08-07
updated: 2026-08-07
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

## Activity

- 2026-08-07 10:04Z illodev@local#bada1057 · backlog → review
