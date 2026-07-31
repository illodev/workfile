---
id: CHG-0035
title: A boolean flag no longer swallows the flag after it
type: fixed
area: core
visibility: public
cards: [T-0058]
created: 2026-07-31
updated: 2026-07-31
---

The unknown-flag guard assumes every flag takes a value unless it is on a list
of booleans, and skips the next token accordingly. Several real booleans were
missing from that list, so they consumed the flag behind them: `doctor --bogus`
was correctly refused, while `doctor --fix --bogus` accepted `--bogus` and ran
the repair.

`--fix`, `--rebuild-cache`, `--duplicates`, `--allow-new`, `--verbose` and
`--no-scripts` are on the list now, alongside the two new baseline flags.
