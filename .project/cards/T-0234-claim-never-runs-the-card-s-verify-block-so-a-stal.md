---
id: T-0234
title: Claim never runs the card's verify block, so a stale claim costs a turn
status: backlog
type: feature
priority: medium
area: core
raised: derived
created: 2026-09-03
updated: 2026-09-03
---

A card is a photograph of a repository that moves. It asserts things — "these two posts do not link to each other", "nothing consumes this field" — that were true the day they were written, and nothing checks them again. With several sessions in one tree, what one fixes in passing leaves another's card obsolete, and nobody finds out until somebody picks it up and discovers the work is already done. The cost is not the dead card: it is the turn of whoever takes it.

`card verify` already runs a card's declared commands and marks the criteria they prove. What nothing does is run it **at the moment it would save the turn**, which is `card claim`.

## What this asks for

`card claim` runs the card's `verify` entries, and **warns** — never refuses — when an entry that used to pass no longer does, or vice versa:

```
T-0042 claimed by drain-web-tools
warning: verify entry `expiry-unread` no longer holds. This card's central claim may be stale;
         re-read it before working. (`workfile card verify T-0042` for the output.)
```

## Why warn and not refuse

Because the two situations look identical from the exit code and are opposite: a card whose claim expired, and a card that is *about* the thing the command finds. A refusal would make the second unstartable.

## Why this is not `card verify` with extra steps

Nobody runs `card verify` before claiming. The whole finding behind this is that a step which is not on the path is not taken — the consuming repository has **2 700 cards and two** that carry a real `verify` block in frontmatter.

## The polarity trap belongs in the warning

`card verify` marks a criterion when the command exits **0**, and `grep` exits 0 **when it finds**. So a criterion written as "X no longer appears" and bound to `grep X` is marked exactly backwards — given as met precisely while the thing is still there, and silently. The allowlist forces the command to start with `grep`/`rg` and `run` executes **without a shell**, so there is no `!`, no `;`, no `test $?`: it cannot be inverted. A warning that fires on a state change should say which direction it saw, or it teaches the wrong lesson.

## Acceptance criteria

- [ ] `card claim` runs the claimed card's `verify` entries and prints what changed
- [ ] A changed entry warns and the claim still succeeds
- [ ] A card with no `verify` block claims exactly as it does today, with no added cost
- [ ] The warning names the direction of the change, not just "failed"

## Where this came from

The consuming repository's T-2416, which measured the alternatives and discarded two of them: ageing a card out (age is not the signal — one card expired in two days while month-old ones stayed true) and "has the ground moved under it" (a file the card cites was touched afterwards — 266 of 423 cards, 63%, at 974 commits in 35 days: an answer that is almost always the same carries no information). What is left is the card's own declared command, which is exact, and a written protocol step for the assertions that are judgement rather than command.

## Activity

- 2026-09-03 14:22Z illodev@local#062a7c97 · renumbered from T-0237
