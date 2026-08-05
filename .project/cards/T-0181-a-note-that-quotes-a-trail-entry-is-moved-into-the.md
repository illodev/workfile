---
id: T-0181
title: A note that quotes a trail entry is moved into the trail by doctor --fix
status: done
type: bug
priority: medium
area: core
created: 2026-08-05
updated: 2026-08-05
---

`TRAIL_ENTRY` was `/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z .+ · /`. The `.+` is greedy, so the middot it looks for could be anywhere on the line — including inside a quoted trail entry in a note.

`appendCardNote` writes `- STAMP ACTOR — text` and `activityEntry` writes `- STAMP ACTOR · text`; the separator after the actor is what tells them apart, and the pattern was not reading it there.

Not a cosmetic misread: `repairMisplacedTrail` moves whatever `misplacedTrailEntries` returns into `## Activity`, so `doctor --fix` would take a note out of `## Notes` and file it as protocol history. The notes most likely to trip it are the ones about the trail, which is where the evidence for that work lives.

The scan added earlier already skipped fenced blocks, so a card showing a trail in a code example was safe. An inline quote was not.

Found by `doctor` on [[T-0175]], whose own evidence note quotes `session-b · archived`.

## Acceptance criteria

- [x] A note quoting a trail entry is not reported as misplaced
- [x] A real stray trail entry still is

## Activity

- 2026-08-05 16:03Z illodev@local#2cddaf94 · claimed
- 2026-08-05 16:03Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 16:03Z illodev@local#2cddaf94 — Fixed by anchoring the actor run: the pattern is now [^ANY-SEPARATOR]+ followed by the middot, so a line only counts as a trail entry when the middot is the separator that immediately follows the actor. Both real entries and inline quotes were exercised in the existing doctor --fix test, which gained a Notes section holding a note that quotes one. Vacuity: restoring the greedy form in the built dist fails at 3 !== 2 — the note is counted as damage and moved.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
