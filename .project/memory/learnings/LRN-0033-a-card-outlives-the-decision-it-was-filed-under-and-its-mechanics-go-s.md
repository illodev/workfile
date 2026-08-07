---
id: LRN-0033
title: A card outlives the decision it was filed under, and its mechanics go stale in silence
status: active
confidence: high
related: [ADR-0018, LRN-0027, T-0207]
tags: [ui, process]
created: 2026-08-07
updated: 2026-08-07
---

T-0207 was filed as ADR-0017's surviving finding. ADR-0018 then superseded ADR-0017 and moved the layout: docs and history became views that own their readers, so the shared drawer stopped opening for either. The card was never touched, and it did not have to be wrong to be misleading — every sentence in it had been true when written.

What it still said was that `RecordPanel` serves "decisions, learnings, incidents, conventions and documents opened from outside the docs view". It serves none of those: memory records get `MemoryPanel`, documents get `DocPanel`, and `RecordPanel` is the fallback for changelog fragments and releases. So the card's scope named one file, `RecordPanel.tsx`, and a fix that touched only that file would have satisfied the card, passed review, and left serial reading in history — the complaint the whole chain started from — exactly as broken as it was.

The superseding record even flagged this. ADR-0018 has a "What survives from ADR-0017" section naming T-0207 and saying it "stands on its own". It does stand, but it stands on the old geometry: what survived was the *finding*, not the mechanics the card wrote down around it.

**Why:** a card is a snapshot of an understanding, and a decision record is the thing that changes understandings. Superseding an ADR updates the decision graph and leaves the cards that cite it describing a codebase that has moved. Nothing reports that, because nothing is broken: the links resolve, `doctor` is clean, and the prose is internally consistent.

**How to apply:** when a card's `origin` or `related` names a decision that is now `superseded`, re-read the card against the superseding one before starting — the finding usually survives and the mechanics usually do not. Treat its `scope` as the weakest part: it was written from the old arrangement and it is what silently narrows the fix. Then do what [[LRN-0027]] says and open the view, which is the only thing that settles which panel is actually on screen. Correct the premise on the card rather than quietly working around it, so the next reader inherits the correction instead of the snapshot.
