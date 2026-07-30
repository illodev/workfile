---
id: CHG-0014
title: "workfile upgrade: one command resyncs every generated surface after a bump"
type: added
area: core
visibility: public
cards: [T-0029]
created: 2026-07-30
updated: 2026-07-30
---

A version bump used to demand a litany nobody remembered (agents sync, ci sync, claude install) while every check stayed green - the stamp is provenance, deliberately outside the staleness decision. workfile upgrade compares the installed version against the stamp on every surface the config owns, resyncs the ones behind (including content-current files whose stamp is old - the CI template pins the package version in its npx commands, so that case was never cosmetic), and reports managed blocks whose kind no configured target owns instead of letting them fossilize.
