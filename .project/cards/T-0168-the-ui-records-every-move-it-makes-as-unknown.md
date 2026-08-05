---
id: T-0168
title: The UI records every move it makes as unknown
status: done
type: bug
priority: high
area: ui
tags: [actor, http, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/server/http.ts]
---

Reported in [[DOC-0005]] (finding 3) against 0.5.4 and reproduced at 0.6.0 by
moving a card through the running server. Both lines landed in the same card:

```
- 2026-08-05 10:28Z unknown · backlog → next            ← PATCH /api/tasks/T-0003
- 2026-08-05 10:28Z illodev@local#2cddaf94 · next → backlog   ← card transition
```

The identity is not missing. `resolveActor()` returns it, `agents whoami`
prints it, and several routes in `http.ts` already call it. What is missing is
the argument at three call sites.

`compatibilityPatch` (`packages/workfile/src/server/http.ts:488`) resolves an
actor only on the way to `doing`:

```
if (changes.status === "doing") {
    return transitionCard(workspace, id, "doing", {
        actor: changes.claimed_by || current.claimed_by || "ui-local",
```

Every other status falls through to `patchCard(workspace, id, normalized,
options)`, and `options` is whatever the route passed — `{ expectedRevision }`
alone from the legacy `PATCH` route (`:1596`) and from `/api/tasks/bulk`
(`:1559`). `mutations.ts:367` then writes `${actor || "unknown"}`.

The inconsistency is visible within one route family: `unarchive` (`:1618`)
passes `resolveActor().actor`; `archive` (`:1609`) does not.

Two things follow from this that the report only gestures at. The kanban drag
is the single most common human mutation in the product, and it is the one that
writes no author — so the argument that the board is shared and versioned is
weakest exactly where humans touch it. And the claim guard reads
`claimed_by && actor`; an absent actor has already deleted that check once, in
[[T-0079]].

`"ui-local"` deserves a decision rather than propagation. It predates
`resolveActor` and it is a worse answer than the one now available.

## Acceptance criteria

- [x] A move made from the UI records the same actor the CLI would record
- [x] The bulk route and `archive` resolve an actor like the rest
- [x] An actor supplied in the body still wins over the resolved one
- [x] A test covers a non-`doing` transition through the HTTP surface

## Activity

- 2026-08-05 11:08Z illodev@local#2cddaf94 · claimed
- 2026-08-05 11:15Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 11:15Z illodev@local#2cddaf94 — Verified against a running server, all four criteria. The unknown attribution was three missing arguments and is resolved once inside compatibilityPatch now. Two things the card did not know: (1) the UI only ever calls the legacy /api/tasks routes — api.http.ts never touches v2 — so those two call sites are the whole surface; (2) 'ui-local' was not cosmetic. It went into claimed_by, nothing resolves to it, and claiming from the board answered CARD_CLAIM_OWNER_MISMATCH to its own author on the CLI while the edit guard asked about every write. Criterion 2 named 'archive': archiveCard writes no activity entry at all, so an actor there would be dead code. That is T-0175, and the criterion is checked on the bulk route with the archive half recorded rather than pretended. One behaviour changed beyond attribution: a move on a card another actor holds is no longer attributed to the holder and let through — it now fails as the CLI does. That is adjacent to T-0117.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
