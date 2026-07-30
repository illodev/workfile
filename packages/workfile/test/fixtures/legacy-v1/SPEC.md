# Spec — Unified Backlog System

> **Status: v1.2 — APPROVED 2026-07-25** (owner signed off; delegated open decisions,
> recorded in §8). This document IS the spec; the implementation follows it exactly.
> Amend via a new dated entry in §9.
> Designed to be portable: nothing here is Fube-specific except the `area` vocabulary
> and the migration plan (§5).

## 1. Problem

- Pending work was scattered with no common format: `.planning/proposals/*` (55 live MDs,
  ~27k lines counting root-level docs), loose docs in `.planning/` (observations, funnel,
  multiempresa, referidos…), follow-up files (`docs/fiscal/_FOLLOWUP.md`), deferrals buried
  inside digests and in agent memory. _(Migrated 2026-07-24; those raw documents now live
  under `.planning/sources/` — see `.planning/README.md`.)_
- Neither the owner nor the agents have a single view of "what is pending and what's next".
- Milestones (`.planning/milestones/`) work well but are heavyweight — built for multi-week
  programs, not for the constant drip of bugs / ideas / findings / deferrals.

## 2. Solution overview

1. **One card = one MD file** in `.planning/backlog/tasks/` with typed frontmatter (§3).
2. **Jira-style hierarchy**: epic → task → subtask, expressed by reference (`parent:`), plus
   optional soft dependencies (`depends:`) (§3.2).
3. **Milestone compatibility**: cards and milestones bridge both ways; a size rule decides
   which one a piece of work belongs to (§3.3).
4. **Local Vite/React/TypeScript board** (`pnpm board` → http://localhost:4747): Explorer,
   execution flow, hierarchy, health checks and mutations that write back to the MD (§4).
5. **One-shot migration** of everything pending scattered today into cards linked to their
   source docs (§5).
6. **Agent protocol**: any work that produces pending items creates cards in the same turn (§6).

## 3. Data model

### 3.1 Card format

File name: `T-NNNN-short-slug.md` (global sequential ID). Frontmatter keys and enum values
are always English (machine layer); `title` and body are written in the team's working
language (Spanish in this repo).

```yaml
---
id: T-0042                # required, unique, sequential
title: Short imperative title (≤ 80 chars)
status: backlog           # backlog | next | doing | review | blocked | deferred | done | discarded
type: task                # epic | idea | feature | bug | task | audit | docs | chore
priority: high            # critical | high | medium | low
area: api                 # api | client | web | billing | time | projects | services | mcp | sdk | ui | fiscal | docs | infra | marketing | hr | crm | ia
parent: T-0010            # optional — parent card (epic or task), see §3.2
depends: [T-0012]         # optional — soft dependency: "better done after these"
milestone: M081           # optional — bridge to .planning/milestones/, see §3.3
source: .planning/sources/audits/xxx.md   # optional — origin document (see §3.7)
tags: [verifactu, aeat]   # optional
effort: M                 # optional: S | M | L
start: 2026-07-28         # optional — YYYY-MM-DD, scheduling only (Gantt view)
due: 2026-08-05           # optional — YYYY-MM-DD, must be >= start
scope: [apps/api/src/FubeCore/Domain/Billing, packages/sdk]   # optional — paths this task will touch, see §3.6
claimed_by: 56a30d1b      # optional — session id of the agent working it, see §3.6
claimed_at: 2026-07-24
created: 2026-07-24
updated: 2026-07-24
---

One or two sentences of context: what happens and why it matters.

## Acceptance criteria   (optional)
- [ ] Verifiable check 1

## Notes   (optional)
- 2026-07-24 — created from audit X; owner deferred Y because Z.
```

Status semantics:

| Status      | Meaning                                               |
| ----------- | ----------------------------------------------------- |
| `backlog`   | Identified, no commitment on when                     |
| `next`      | Prioritized by the owner for the upcoming batch       |
| `doing`     | In progress right now                                 |
| `review`    | Done, awaiting verification / deploy / owner sign-off |
| `blocked`   | Blocked by something external (say why in Notes)      |
| `deferred`  | Deliberately postponed by owner decision (say why)    |
| `done`      | Finished and verified **in a running environment**    |
| `discarded` | Won't be done (say why)                               |

> **`done` is not "committed to `dev`".** A card is `done` when the work is verifiable in an
> environment where it runs — tests green in the container, or the change live in
> preview/production for anything a user or the AEAT can see. Code merged but not deployed stays
> `review`. This rule exists because on 2026-07-26 a single commit flipped 17 cards from `review`
> to `done` without touching their Notes, which still said "`review` and not `done` because it
> still needs deploying" — and it was true: the batch never shipped. The board then showed zero
> live cards pointing at eight un-deployed migrations. See T-1533 and T-1561.

### 3.2 Hierarchy — by reference, not by folders

Jira mental model: **epic → task → subtask**.

- `type: idea` marks an **unvalidated proposal**, not committed work: something worth having
  that nobody has decided to build. Ideas are hidden from the board by default (toggle
  "Show ideas") so they never bury the actual pending work. Accepting one = change its type
  to `feature` (and set a real priority); rejecting one = `status: discarded` + why.
- `type: epic` marks a grouping card. It is a normal card (has status, priority, area) whose
  children point to it via `parent:`.
- Any non-epic card may have subtasks (cards whose `parent:` is that card). **Max depth: 2
  below an epic** (epic → task → subtask; subtasks cannot have children). Tasks without an
  epic can still have subtasks.
- **Re-parenting = editing one `parent:` line.** Files never move.
- `depends:` is a soft ordering hint between siblings/any cards; the board shows it, nothing
  enforces it.

Why reference and not subfolders (considered and rejected):

| Folders as hierarchy                               | `parent:` reference (chosen) |
| -------------------------------------------------- | ---------------------------- |
| Re-parenting = `git mv`, brittle for agents        | Edit one line                |
| Same info duplicated in path + frontmatter → drift | Single source of truth       |
| Deep trees are painful to scan/glob                | Flat dir, trivial tooling    |
| ID/slug collisions when moving                     | IDs stable forever           |

The visual tree the folders would have given you comes from the **board** instead:
group-by-epic view, subtask progress on parent cards, children listed in the detail panel.

### 3.3 Milestones vs cards — the boundary

Both systems stay, with a crisp size rule and a two-way bridge:

- **Card / epic (backlog)** — hours-to-days of work; an execution epic normally groups
  roughly 10–15 cards, but source-migration epics may be much larger because their purpose
  is lossless discovery/navigation rather than delivery planning. No phase machinery or Taiga.
- **Milestone (`.planning/milestones/`)** — a multi-week _program_: phases, own directory
  with INDEX.md tracking, Taiga mirror, the `fube-milestone-tracking` protocol. Unchanged.

Bridge:

- **Card → milestone**: follow-ups and stray tasks of a milestone carry `milestone: M0XX`.
  The board can filter/group by it. (E.g. the M086 pricing-copy follow-ups become cards.)
- **Epic → milestone (promotion)**: when an epic becomes a coordinated multi-week program
  (needs phases or delivery tracking), create a milestone from it. Card count alone does
  not trigger promotion. The epic card stays as the backlog-visible
  pointer with `milestone:` set and status `doing`; detailed tracking lives in the
  milestone's INDEX.md. When the milestone closes, the epic closes.
- **Milestone → cards (spawn)**: a milestone that produces small out-of-scope pendings
  spawns cards (instead of burying them in its INDEX notes).

Rule of thumb: **if you need phases or Taiga, it's a milestone; otherwise it's an epic.**

v1 board integration: `milestone:` works as filter/lane + a link out to the milestone
directory. No INDEX.md parsing (their format is free-form and would break).

### 3.4 Folder layout

```
.planning/backlog/
  SPEC.md          # this file
  tasks/           # every live card, FLAT (see §3.2 for why)
  archive/         # done/discarded cards — moved here by the board's Archive action
  board/           # local API, Vite/React/TypeScript UI and backlog doctor
```

- `tasks/` stays flat; slicing happens via frontmatter (area, epic, tags) + board filters.
- `archive/` keeps the live directory small without deleting history. Archiving is an
  explicit action (board button or script), not automatic on `done` — so freshly finished
  work stays visible on the board until you sweep it.
- Source documents (proposals, audits, investigations) are **never moved or deleted** by
  this system; cards link to them via `source:`.

### 3.5 Assets (images & documents)

Cards can carry attachments, Jira-style. Convention over frontmatter:

```
.planning/backlog/
  assets/
    T-0042/          # everything in here belongs to card T-0042
      mockup.png
      presupuesto-proveedor.pdf
```

- **No frontmatter field needed**: the board (and any agent) lists `assets/<id>/` as the
  card's attachments automatically. No drift possible.
- Embed images inline in the card body with a relative link:
  `![mockup](../assets/T-0042/mockup.png)` — renders in the board's detail view and in any
  IDE markdown preview.
- The board serves `/assets/**` (path-traversal guarded), renders images inline, lists other
  files (PDF, CSV…) as download/open links, and supports **drag & drop upload** onto a
  card's detail panel (saved into `assets/<id>/`).
- Assets live outside `tasks/` so archiving a card never breaks links; the asset folder
  follows the card's ID for life.
- Discipline: screenshots and small docs, yes; heavy binaries, no — this is a git repo.

### 3.6 Agent claims & scope (multi-agent coordination)

Two problems when several agents run in parallel: two agents grabbing the same card, and
two different cards touching the same files. Two flat fields solve both:

- **`scope:`** — list of repo paths (dirs or files) the task is expected to touch. Declared
  when the card is created or refined; sharpened by the agent when it starts. Purpose:
  _conflict detection_ — two `doing` cards with overlapping scopes should not run in
  parallel (this repo has burned on exactly that: shared container, serial integration).
- **`claimed_by:` + `claimed_at:`** — a work lease. When an agent starts a card it sets
  `status: doing`, `claimed_by: <session-id>` (or a short handle if no session id is
  available) and `claimed_at`. When it finishes (→ `review`/`done`) or aborts, it **clears
  both fields**.

Rules:

1. Never work a card claimed by another session. Check before claiming.
2. Before claiming, check your card's `scope` against other `doing` cards — overlap means
   coordinate (serialize or split), not race.
3. Claims are a lease, not a tombstone: a claim whose `updated` is **>24h old** may be
   broken (add a Notes line saying you broke it and why). Agents refresh `updated` while
   actively working.
4. The claim is advisory (an MD field, not a real lock) — but the protocol treats it as
   binding, and the board makes violations visible.

### 3.6b Scheduling (`start` / `due`)

Both optional, `YYYY-MM-DD`, validated server-side (`due` must not precede `start`). They exist
**only** to place a card on the Gantt — they are not a commitment and nothing enforces them.

- Set them from the card drawer ("Schedule") or by editing the frontmatter.
- A card with only one of the two draws as a single-day bar on that date.
- Cards without dates never appear in the Gantt; the view reports how many are unscheduled.
- Status still rules reality: a `done` card with a future `due` draws faded, it is not "late".

### 3.7 Sources — where raw documents live

Cards are the _operational_ layer; the long-form documents they come from (audits, plans,
briefs, research, handoffs, finding queues) live under **`.planning/sources/`**, catalogued
in `sources/_INDEX.md`. A card cites one with `source:` (repo-relative path).

`source:` accepts **any** repo-relative path — a doc under `.planning/docs/`, a milestone
INDEX, a changelog entry, even a source file. Only **new long-form raw documents** must be
filed under `sources/` and catalogued; citing an existing document elsewhere is fine.

- Sources are **read-only snapshots**: never edit an audit to reflect that its findings were
  fixed — that state lives in the cards.
- A source whose pending content has been fully turned into cards moves to
  `sources/_exhausted/` (kept for traceability; cards' `source:` follows it).
- New raw document → put it in the right `sources/` subfolder, add a line to
  `sources/_INDEX.md`, and create the cards in the same turn.
- The full `.planning/` layout and what belongs where is in `.planning/README.md`.

## 4. Board

- **Vite + React + TypeScript** frontend, built locally before `pnpm board` starts the
  Node ≥ 20 server. No CDN or browser-time Babel; the generated assets are served by the
  same local process. Binds to 127.0.0.1 only. UI copy is English (portable).
- **Explorer is the default view**: virtualized table over the full backlog, facet sidebar,
  sortable columns, inline status/priority editing, multi-select and bulk mutation.
- Search supports both free text and field tokens such as `area:billing`, `parent:T-0309`,
  `tag:verifactu` and exclusions such as `-type:idea`.
- View, filters, search and opened card are reflected in the URL, making every slice
  bookmarkable/shareable.
- **Triage** processes the current filtered queue one card at a time with previous/next
  navigation and keyboard shortcuts for priority, `next`, `deferred` and `discarded`.
- **Flow** is the execution kanban (`next`/`doing`/`review`/`blocked` by default), with an
  opt-in to include `backlog` and `deferred`. The global closed toggle adds `done` directly
  after `review` (so completion stays visible in the primary viewport) and `discarded` at
  the end.
- **Knowledge** is a read-only browser over `.planning/changelog/` and
  `.planning/learnings/`: searchable metadata index, Changelog/Learnings tabs, lazy document
  loading and a deep link to the source file. These records remain separate from operational
  cards.
- Cards use priority color and compact area/type/effort/epic metadata; the drawer exposes
  milestone, tags, hierarchy, dependencies, source and attachments.
- Views: **Explorer** · **Triage** · **Flow** · **Epics** (collapsed hierarchy) ·
  **Timeline** (cards with `start`/`due`) · **Knowledge** (changelogs + learnings) ·
  **Health** (live `backlog:doctor` report). Filters by status/area/type/priority/tag/
  milestone/free text apply across the task views.
- **Drag & drop** between columns → PATCH rewrites `status:` (+ `updated:`) in the MD.
- Card click → accessible detail drawer with previous/next navigation, editable metadata,
  rendered body, children list with statuses, `depends`
  chain, attachments from `assets/<id>/` (images inline, docs as links, drag & drop
  upload), link to `source:` (`vscode://file/...` deep link).
- Claimed cards show a 🔒 badge with session id + claim age; the board warns when two
  `doing` cards have overlapping `scope` paths.
- "New card" button → minimal form → creates the MD with the next ID (and optional parent).
- Archive action on done/discarded cards → moves file to `archive/`.
- Light/dark theme. Root scripts: `pnpm board`, `pnpm board:build`,
  `pnpm board:typecheck`.

### 4.1 Backlog doctor

`pnpm backlog:doctor` validates the complete Markdown dataset without mutating it.
`pnpm backlog:doctor --changed` limits reporting to changed cards and is the CI-friendly
mode; `--json` emits the same report consumed by the Health view.

Checks include required fields, enums, IDs/filenames, duplicate IDs, parent/dependency
references, hierarchy cycles/depth, dates/ranges, source paths, claim coherence, archive
status and unchecked acceptance criteria on `done` cards. Errors produce a non-zero exit
code; warnings remain visible but do not fail the command.

## 5. Migration of the current backlog (Fube-specific)

- Parallel agent sweep of ALL live sources: `proposals/*` (excluding `_done`),
  `mcp-tools-audit/`, `hr-registro-horario-audit-2026-07-23/`, `docs/fiscal/_FOLLOWUP.md`,
  loose root docs (multiempresa, referidos, funnel, hr-fuga-mercure, web-copy…), follow-ups
  of closed milestones (e.g. M086 a/b) and known deferrals (soft-delete gastos, allowlist-IP,
  claim-breakdown, OAuth token-scope, broken PWAs…).
- Only **pending** items are extracted — each one must cite the source line that backs it;
  anything marked done/✅ produces no card. Dedup pass + completeness critic against the
  known-pendings list.
- Related items get grouped under epics during the merge pass (e.g. one epic per audit).
- Source docs untouched; every card links back via `source:`.
- Volume is intentionally unbounded: lossless extraction is preferred over leaving pending
  work hidden in large raw files. Explorer facets, virtualized rows, search and bulk actions
  keep thousands of cards navigable.

## 6. Agent protocol

1. An agent that detects pending work → creates card(s) in the same turn (not just a digest).
2. Starting a card → `doing` + `claimed_by`/`claimed_at` (your session id) + sharpen `scope`;
   check claims and scope overlaps first (§3.6).
3. Finishing → `review` or `done`, clear `claimed_by`/`claimed_at`, bump `updated`.
4. Never delete cards: `done`/`discarded` + a Notes line saying why.
5. Sequential IDs: take the highest existing ID across `tasks/` **and** `archive/`, add 1.
6. A new section in `CLAUDE.md` points here so every agent inherits the protocol.

## 7. Out of scope (v1)

Multi-person assignment (it's owner + agents), sprints, time estimates, burn-down charts,
Taiga mirroring of cards. Add later if it hurts.

## 8. Decisions (CLOSED 2026-07-24 — owner delegated all except #8, which he decided)

1. **Priorities**: `critical/high/medium/low` (audit findings map ALTO→high, etc.). ✅
2. **IDs**: global `T-NNNN`. ✅
3. **Statuses**: the 8 proposed. ✅
4. **Subtask depth**: capped at epic → task → subtask. ✅
5. **Port**: 4747. ✅
6. **After migration**: a source whose pending content is 100% extracted and that is not part
   of an active initiative moves to `.planning/sources/_exhausted/` (cards' `source:` follows
   it). ✅ _(Superseded 2026-07-24 by the `.planning/` reorg: `proposals/` no longer exists —
   every raw document now lives under `.planning/sources/`. See `.planning/README.md`.)_
7. **Migration priorities**: pre-assigned on every card; owner adjusts on the board. ✅
8. **Taiga**: OUT of this system entirely (owner decision, 2026-07-24). Milestones keep
   their own Taiga mirror as today; cards never touch Taiga. ✅
9. **Claim lease**: 24h staleness before a claim can be broken. ✅

## 9. Owner ideas (log)

- 2026-07-24 — Must be compatible with milestones; cards can have child cards, pure Jira
  style; unsure where the milestone/task boundary lies and how folder separation would
  work → resolved as §3.2 (reference-based hierarchy), §3.3 (size rule + bridge),
  §3.4 (flat layout). Spec language: English, as a portable standard for agents. ✔ incorporated
- 2026-07-24 — Cards should accept assets (images, documents) → §3.5. ✔ incorporated
- 2026-07-24 — Agents should declare task scope, mark the card as taken while working on
  it, and declare their session id → §3.6 (scope + claim lease). ✔ incorporated
- 2026-07-25 — Prefer thousands of explicit cards over pending work hidden in giant raw
  files; optimize the UI for large-dataset exploration and bulk triage. Migrate the board
  to Vite + React + TypeScript; no need to preserve the classic UI → §4/§4.1 and migration
  volume rule updated. ✔ incorporated
- 2026-07-25 — Surface changelogs and `.planning/learnings/` in the board; when `Closed`
  is enabled in Flow, show the `done` column → §4 Knowledge view and explicit closed
  columns. ✔ incorporated
- …
