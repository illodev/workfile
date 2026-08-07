---
id: LRN-0033
title: A card's finding is evidence; its scope and its stated fix are a guess
status: active
confidence: high
related: [ADR-0018, LRN-0027, T-0207, T-0202, T-0161]
tags: [process, acceptance]
created: 2026-08-07
updated: 2026-08-07
occurrences: 3
---

Three cards in two days, and only the first of them involved a superseded decision. What they share is not why the card went stale but which part of it did.

**T-0207 — the decision moved under it.** Filed as ADR-0017's surviving finding; ADR-0018 then superseded ADR-0017 and gave docs and history their own readers, so the shared drawer stopped opening for either. The card was never touched and did not have to be wrong to mislead: every sentence had been true when written. It still said `RecordPanel` serves "decisions, learnings, incidents, conventions and documents opened from outside the docs view". It serves none of those. So its `scope` named one file, and a fix touching only that file would have satisfied all five criteria, passed review, and left serial reading in history — the complaint the whole chain started from — exactly as broken. ADR-0018 even flagged it, with a section saying T-0207 "stands on its own": what survived was the *finding*, not the mechanics written around it.

**T-0202 — the enumeration was of what the author had found.** Its scope named the three record list endpoints that matched a query by substring. There was a fourth site with a rule of its own, the command palette, and it was the worst of the four: in the hosted demo it could not find a record by a word in its body at all. Nothing had superseded anything. The list was just short.

**T-0161 — the stated mechanism was never run.** "One branch in `validateCardCandidate`... `candidate.id` is set by the time it runs — that is how the existing self-parent check catches the same case on creation." Both halves false. Creation validates against `id: "pending"` and the allocation decides the id later, under a lock; a self `parent` on create is refused by `CARD_PARENT_NOT_FOUND`, the right outcome for the wrong reason. Writing the branch the card asked for left the reported bug reproducing exactly as filed.

**Why:** a card's *finding* is evidence — somebody hit it. Its *scope* and its *account of the fix* are a hypothesis, written before the work by someone who had not done it, and they are what fails. Nothing reports it, because nothing is broken: the links resolve, `doctor` is clean, and the prose is internally consistent. The failure mode is not a card that looks wrong; it is a card that looks finishable and whose criteria can all be met while the reported defect survives.

**How to apply:** read the finding as a claim about the world and the scope as the author's guess. Before starting, reproduce the reported behaviour — not the mechanism, the behaviour — and count the sites yourself rather than trusting the enumeration. If the card names a decision, check whether it is still `accepted`. Then, when the guess turns out wrong, correct it on the card rather than quietly working around it, so the next reader inherits the correction instead of the snapshot. [[LRN-0027]] is the same lesson for anything visual, and its instruction generalises: reading the code is not running it either.
