---
id: T-0054
title: Retitling a card leaves its filename behind, and doctor stays quiet
status: backlog
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, doctor, cards]
scope: [packages/workfile/src/modules/cards, packages/workfile/src/modules/health]
created: 2026-07-31
updated: 2026-07-31
---

`createCard` derives the filename from the title
(`src/modules/cards/mutations.ts:300`), but `patchCard` never revisits it. After
a retitle the file keeps the old slug and nothing reports the drift.

Reproduced:

```
$ workfile card patch T-0001 --json-input t.json   # title -> "Completely different title now"
T-0001 updated
$ ls .project/cards/
T-0001-parent-card.md                              # unchanged
$ workfile doctor
Workfile doctor: 0 errors, 0 warnings              # silent
```

Reported from a real repository where `T-2068-anonimizador-del-tenant-...md`
holds a card titled "Borrado en cascada del tenant preservando la info de
maintainer". The filename is the handle people and agents grep by, so a stale one
misdirects long after anyone remembers the rename.

`renumber` already solves the equivalent problem for IDs, including rewriting
inbound references.

## Scope

Two viable shapes, and the choice is the open question:

1. Reslug on retitle, reusing the `renumber` machinery so inbound `[[T-0001]]`
   references and the git-visible move are handled the same way.
2. Leave the file alone and add a `doctor` rule for title/filename drift, with
   `--fix` performing the rename.

Option 2 is the safer default — a rename on every title edit churns history and
breaks open editor buffers mid-session — but it only works if the rule is loud
enough to be acted on, which depends on the doctor baseline work.
