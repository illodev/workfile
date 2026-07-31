---
id: CHG-0042
title: wf is a shorter way to type workfile
type: added
area: core
visibility: public
cards: [T-0069]
created: 2026-07-31
updated: 2026-07-31
---

The package now installs two names for the same CLI. `wf doctor` is
`workfile doctor`; nothing else changed, and the long name keeps working
everywhere it worked before.

The help follows the name you used. `wf card --help` prints `wf card list`, and
a rejected flag answers ``Run `wf card --help` `` — the CLI reads back the name
it was invoked under rather than replying in a vocabulary you did not type.

Keep the long form in anything generated, scripted or shared. `wf` only
resolves once the package is installed, and an unrelated `wf` package exists on
the registry, so `npx wf` would fetch a stranger's tool where `npx workfile`
fails outright. Generated protocols and skills spell it long for that reason.
