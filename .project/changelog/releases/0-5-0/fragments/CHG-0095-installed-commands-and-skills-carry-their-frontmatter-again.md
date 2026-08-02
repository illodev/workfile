---
id: CHG-0095
title: Installed commands and skills carry their frontmatter again
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0135]
---
`workfile claude install` wrote its marker comment above the opening `---`.
YAML frontmatter is only frontmatter at byte 0, so the block was never read:
every installed command and skill reached the model with no description and
without the `allowed-tools` grant scoped to the one subcommand it needs.

The marker now lives inside the frontmatter as a YAML comment, which parsers
discard, so the fence keeps byte 0 and the digest still covers every field —
`claude check` goes on reporting a hand-edited file. Files still in the old
layout are reported stale and migrated by the next sync rather than refused.

Run `workfile claude install` to pick this up.
