---
id: CHG-0156
title: Every doctor finding says which module produced it
type: changed
area: core
visibility: public
cards: [T-0218, T-0223]
created: 2026-08-07
updated: 2026-08-07
---

A diagnostic returned by a repository's own healthCheck used to read exactly like one Workfile made itself. Each finding now carries its reporter and the CLI groups by it, so `integration:<id>/<code>` is unmistakable. Accepted baselines are unaffected: the identity a baseline matches on deliberately ignores the field. The stale-filename rule moved to the layer that holds every kind while this was open, so memory records, managed documents and unreleased changelog fragments are checked and repaired too — they derived their filenames from their titles all along and only cards ever noticed.
