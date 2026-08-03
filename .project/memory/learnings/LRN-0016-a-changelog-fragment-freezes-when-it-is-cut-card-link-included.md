---
id: LRN-0016
title: A changelog fragment freezes when it is cut, card link included
status: active
created: 2026-08-03
updated: 2026-08-03
---
`changelog release VERSION` makes every fragment it assembles immutable.
Patching one afterwards fails with `CHANGE_FRAGMENT_RELEASED`, and the only
forward path the CLI offers is a new fragment describing the correction — see
T-0071.

That includes frontmatter nobody thinks of as content. `cards:` is the one
that bites: it is what puts the `(T-0143)` trace on the rendered CHANGELOG
line, `changelog add` does not set it, and its absence is invisible until the
entry is rendered next to older ones that have it.

So the order is: `changelog add`, then patch the body **and** `cards:`, then
`changelog release`, then `changelog render --write`. Rendering is a separate
step — `changelog release` moves the fragments and writes the REL record, but
leaves CHANGELOG.md alone, and `release.yml` builds the GitHub Release body
from that file via `release-notes.ts`.

If the cut is not committed yet, it is fully reversible by hand: delete
`.project/changelog/releases/<version>/`, `git checkout --` the unreleased
fragment and CHANGELOG.md, patch, cut again. Cheaper than a correction
fragment that exists only to add a card link.

Found cutting 0.5.3 (T-0144).
