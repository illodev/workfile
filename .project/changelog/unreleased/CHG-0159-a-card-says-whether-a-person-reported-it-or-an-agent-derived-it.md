---
id: CHG-0159
title: A card says whether a person reported it or an agent derived it
type: added
area: core
visibility: public
cards: [T-0210]
created: 2026-08-07
updated: 2026-08-07
---

`raised: reported | derived`, on every surface that creates a card. Neither `origin` nor `source` answered this: `origin` takes record ids, which is the provenance of discovered work, and `source` is a path checked on disk, so a report made in conversation had nowhere to go. The distinction is what changes priority — a reported card is a commitment to somebody and a derived one is a proposal that costs nothing to discard — and it is unrecoverable once the session ends. Cards filed before the field existed are left unmarked rather than guessed at, and `doctor` asks only about cards filed since.
