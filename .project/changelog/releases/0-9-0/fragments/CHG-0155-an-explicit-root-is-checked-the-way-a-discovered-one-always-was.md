---
id: CHG-0155
title: An explicit --root is checked the way a discovered one always was
type: fixed
area: core
visibility: public
cards: [T-0160]
created: 2026-08-07
updated: 2026-08-07
---

`--root` pointed at a directory with no workspace marker is an error naming the directory, instead of a clean, empty, believable answer from somewhere that is not a workspace. `--allow-new` is the way through and reaches that branch now; it only ever reached the path that already refused one.
