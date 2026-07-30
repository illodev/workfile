---
id: CHG-0013
title: Syncing over nested-era files sweeps orphan managed markers
type: fixed
area: core
visibility: public
cards: [T-0025]
created: 2026-07-30
updated: 2026-07-30
---

Files written by 0.1.0/0.1.1 embedded the protocol's own marker pair; upgrading over them left orphan workfile:end lines that no tool ever removed (this repo's own SKILL.md had seven, invisible to check). mergeManagedBlock now sweeps marker lines outside every complete block after each merge, so the next sync heals the debris on any surface — agents, ci or claude.
