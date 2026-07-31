---
id: T-0054
title: Retitling a card leaves its filename behind, and doctor stays quiet
status: done
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, doctor, cards]
scope: [packages/workfile/src/modules/health, packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts]
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

## Activity

- 2026-07-31 20:52Z session-fube-triage · claimed
- 2026-07-31 21:02Z session-fube-triage · doing → done

## Verification

- 2026-07-31 21:01Z session-fube-triage — Shipped as the doctor rule, per the decision. Runtime: on a fresh workspace, retitling T-0001 produced `WARNING filename-stale T-0001: … renames it to T-0001-a-completely-different-title.md`; `doctor --fix` printed `renamed: T-0001-original-title-here.md → T-0001-a-completely-different-title.md` and the next run was 0/0. On this repository the rule found nine real cases on its first run — T-0002..T-0010 carry Spanish filenames under English titles — filed as [[T-0061]] rather than fixed, because demo-data.json embeds two of those filenames and the rename needs `pnpm demo:data` alongside it. Scope note: the rule cannot distinguish a hand-named file from a drifted one, so a repository adopting Workfile with hand-named cards warns once per card and normalizes in a single --fix pass. Nothing rewrites references — cards link by ID, and the ID half of the filename does not move.
