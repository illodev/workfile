---
id: DOC-0003
title: "Second verification pass: the 56 unchecked claims from DOC-0002"
kind: reference
status: current
created: 2026-08-01
updated: 2026-08-01
---
> Produced 2026-08-01. Scope: the 28 candidate ideas [[DOC-0002]] generated and
> never verified, plus all 28 steal-list items it published without ever
> checking against this checkout. 56 items, 12 batches, a skeptic per batch
> re-running the evidence before accepting it, 25 agents.
>
> **Standard applied.** A claim is unproven until a command was run or a line
> read. Where an item asserts a number, the number was measured on this machine.
> Existence and internal consistency — which is all the first study checked —
> do not count. The eight defects in §3 were then each re-verified by hand
> before any code was written.

# Second verification pass

DOC-0002 verified 18 of its 46 ideas and published a 28-item steal list it had
never compared to the repository. This pass covers exactly what it did not.

## 1. The number that matters

**51 of the 56 items assert something about this repository that is false.**
133 individual false claims. Not opinions that aged badly — statements of fact
about our code, checkable in one command, wrong.

| Outcome | Count |
|---|---:|
| Survived checking **and** an adversarial skeptic | 8 |
| Passed checking, then refuted | 17 |
| Dropped on first check | 31 |

| Status | Count |
|---|---:|
| `confirmed` — the stated problem is really present | 26 |
| `claim-false` — the item's central premise is wrong | 22 |
| `overtaken` — T-0075..T-0084 fixed it after the report | 4 |
| `already-built` — the repo already did it | 4 |

Five items could not be measured (`steal:1`, `steal:22`, `steal:25`, `idea:1`,
`idea:8`) and are recorded as such rather than as findings.

The lesson is not that the study was careless. It read four competitors in
depth and the mechanics it extracted are real. What it did not do — for the
steal list, at any point — was ask whether the Workfile problem each mechanic
claimed to solve actually existed. That question is cheap. Skipping it made
28 items unusable and left the two real defects underneath them undiscovered
for a day.

### A representative sample of what was wrong

| Item | Asserted | Actually |
|---|---|---|
| `steal:1` body regions | "Body is all-or-nothing; `card note` appends to one hardcoded heading" | `card note --section NAME` is a documented flag, `card ac` toggles single boxes, the trail appends. Only whole-section *replacement* has no verb |
| `steal:1` | "Prerequisite for acceptance criteria" | T-0084 shipped them without any marker protocol |
| `steal:8` instructions | "Shrink the managed block to a ~1KB router" | `CLAUDE.md` is 687 bytes, `AGENTS.md` 688. Both already below the target |
| `steal:11` gates | "`blocked` has no machine-checkable exit condition" | `depends` edges are checked by `satisfied()` and release the card into `next` automatically. `due`/`start` appear zero times in the whole card history |
| `steal:12` cross-branch | "Aimed exactly at the pain that created Workfile" | Inverted. That pain was concurrent agents in **one** working tree; this addresses several branches |
| `steal:14` compaction | "`agents context` has a fixed budget and a growing corpus" | The bundle does not grow: 17,488 B at bench S, 22,270 B at M, 22,270 B at L |
| `idea:17` record log | "No way to answer when T-0060 became next, in which commit, by whom" | `git log -L '/^status:/,+1:<file>'` answers it in 36 ms with no Workfile change |
| `idea:21` board at ref | "SPEC §18.1 specifies `doctor --changed`" | §18.1 specifies `--new`. `--changed` appears nowhere in SPEC.md — the quoted text is from the **legacy v1 fixture** kept as a migration test |
| `idea:25` V8 wall | "The cache stops working around 65k records" (from ~8 KB/record) | Measured density is 1,944–1,961 B/record, putting the wall near 274k |
| `idea:26` UI over-fetch | "27 sequential round trips, 11.1 MB vs 2.6 MB" | 1 round trip. 287 KB in 3.07 ms. The MB figures are the 8,000-card synthetic fixture presented as facts about this repo |
| `idea:28` search copies | "A full object spread including the markdown body, 5,000 body copies" | A spread copies the body *reference*. Measured heap delta 8.4 MB against 23.2 MB of content |
| `steal:5` bundle | "`agents context --json` returns `totalAvailable: 0`" | 10, since T-0080 |

`idea:26` is the study's own failure mode reproduced exactly: bench-fixture
numbers presented as measurements of this repository. It is the same mistake
that produced the search-postings claim [[T-0081]] threw away after building it.

## 2. What survived

Eight items, all small, all with reproduced evidence. Six became cards.

| Item | Card | What it turned out to be |
|---|---|---|
| `steal:4` `next --claim` | [[T-0085]] | The feature is unbuildable as written — `CARD_SCOPE_OVERLAP` is a warning, so the retry loop has no trigger. Underneath it: a live race |
| `steal:2` acceptance fields | [[T-0086]] | Shipped by T-0084. What survived is that three of the four doors to `done` skip the gate |
| `idea:24` activity trail | [[T-0086]] | Same line of code |
| `idea:20` JIT knowledge | [[T-0087]] | The hook is unnecessary — scope *is* consulted at the edit point. Underneath it: scoped records vanish from the card-less bundle |
| `steal:28` normative SPEC | [[T-0088]] | Do not split SPEC.md. One test that resolves documented command paths against the dispatcher |
| `steal:5` PreCompact | [[T-0090]] | Do not add a hook. The SessionStart matcher omits `compact` |
| `steal:18` `--append-*` twins | [[T-0091]] | Drop the twins. Flag validation is keyed per command word, so subcommand flags are silently dropped |
| `steal:19` `card stale` | [[T-0092]] | Do not build it — `card reap` exists. `--updated-since` is unvalidated |

Note the shape. **Not one survivor survived as proposed.** Every one was
either redirected onto a defect it had walked past, or reduced to the smallest
true thing inside it. A steal list is a source of questions, not answers.

`idea:24` also surfaced [[T-0089]], which no item proposed: `board.json` is
written only at session start, so the `PreToolUse` scope guard has been reading
an empty board for this repository's entire history.

## 3. Confirmed but deliberately not now

Real problems whose cost is not worth it yet. The trigger is what changes the
answer.

| Problem | Why not now | Trigger |
|---|---|---|
| The Epics view renders nothing (0 of 84 cards have a `parent`) | Deleting a first-class protocol feature is a product subtraction at M cost that fixes no defect | `parent`/`type: epic` leave the protocol, or you start using them |
| No path → card lookup | `/api/v2/activity` already returns every claim with its scope, holder and state. The gap is a filter, not an extension | You want it in an editor and someone else maintains it |
| Scope drift is never checked after the fact | Measured empty: 0 different-actor overlapping claims across 102 episodes | A genuinely concurrent multi-actor session |
| `workfile export` / static site | The affordable design breaks the publish guard installed after a near-miss; the expensive one is +61% tarball for a package whose claim is that it adds nothing | An installed user asks. `ui --read-only` covers most of the demand first |
| JSON Schema per record kind | Two of three motivating constants are already runtime JSON via `schema --json`. The frontmatter codec accepts a YAML subset JSON Schema cannot express | A non-JS consumer validating records in CI |
| CLI/HTTP/MCP JSON shapes diverge | Three deliberate projections for three token budgets. Unifying them is a major break for zero third-party consumers | A third-party consumer, at a major version |
| `events.jsonl` has no readers | 0.79 ms of a ~31 ms hook, gitignored, and the only durable per-file provenance | It crosses a size worth caring about — then a cap, not a deletion |

## 4. Dead

Do not re-propose. Grouped by why.

**Already built:** saved views (the URL already serialises the full filter set —
a saved view is a bookmark), progressive-disclosure instructions, typed gates
(`depends` + `satisfied()`), `card stale` (`card reap`).

**Overtaken by T-0075..T-0084:** the card-less bundle, identity/`whoami`, the
acceptance core, CI feedback on the card.

**Premise false:** machine-owned body regions, the UI over-fetch, `modified_files`
+ `file:` (which is already a live search term), the JSON envelope, cross-branch
resolution, the frontmatter merge driver, `record log`, board-at-a-ref, the V8
cache wall, hybrid-search copying, dependency closure, rename cascades, lossy
compaction, bulk import's performance premise.

**Not a real problem at this scale:** multi-workspace mount (`--root` plus a
for-loop over two workspaces in existence), README kanban export, empty-state
copy, the conflict diff (self-heals in a measured 121 ms), scope drift.

**Refuted on cost:** `workfile export`, a VS Code extension, deleting Epics, a
Linear-sized selection model, deleting `events.jsonl`, JSON Schema, config-declared
agent targets, a command registry for shell completion, the `--append-*` twins.

## 5. What this pass could not settle

- **Does Claude Code fire SessionStart with source `compact`?** The repo-side
  facts for [[T-0090]] are proven; the host behaviour is not something this
  checkout can prove. One session run to compaction with a logging hook settles
  it.
- **Would tightening flag validation break a real caller?** Five flags are
  confirmed no-ops today; that *everything* newly rejected was already a no-op
  is an inference. [[T-0091]] builds the test first and reads its failure list.
- **Five items were never measured** — `steal:1`, `steal:22`, `steal:25`,
  `idea:1`, `idea:8`. All were dropped for other reasons, so nothing rests on
  them, but they are unchecked, not checked-and-cleared.

## 6. What to do with DOC-0002

Keep it for §1 and §2 — the landscape and the four deep reads are the part
that was actually researched, and they hold up. Treat its §4 steal list as a
list of questions that have now been answered here, and its §5 original ideas
as unverified except where this pass names them.

The durable rule is in [[LRN-0005]]: a proposal that asserts a fact about this
repository is not a proposal until that fact is checked, and checking it costs
one command.
