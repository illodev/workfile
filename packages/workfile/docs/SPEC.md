# Spec — Repository Workfile

> **Status: v2.0 RC2 — MCP INTEGRATION CONTRACT — 2026-07-28**
>
> Product name: **Workfile**  
> Package name: `@illodev/workfile`  
> CLI name: `workfile` (alias `wf`; the MCP server is `workfile-mcp`)  
> Default storage root: `.project/`
>
> This document defines a portable, repository-native operating protocol for project work,
> documentation, change history and durable workfile memory. It is intended for humans and
> software agents working in the same codebase.
>
> The names above are placeholders. Renaming the product or package must not change the data
> model or the protocol.

## 1. Purpose

Projects accumulate operational knowledge in several incompatible places:

- pending work in issue trackers, planning documents, comments and agent summaries;
- documentation spread across READMEs, architecture notes and product specifications;
- changes recorded inconsistently in commits, release notes and changelog files;
- decisions, incidents and lessons retained only in conversations or individual memory.

This fragmentation causes two recurring failures:

1. Humans cannot obtain a reliable view of what the project knows, what it plans to do and
   why previous decisions were made.
2. Agents repeatedly rediscover context, produce duplicate work, overwrite each other or
   finish a session without persisting newly discovered knowledge.

The Repository Workfile solves this by defining a versioned, local-first standard
whose canonical records live inside the repository as reviewable text files.

The protocol covers four first-class domains:

1. **Work** — cards representing ideas, tasks, bugs, features and execution hierarchy.
2. **Docs** — discoverable project documentation, whether managed or merely indexed.
3. **History** — structured change fragments and generated release changelogs.
4. **Memory** — durable decisions, learnings, incidents, conventions and temporary context.

A local UI, CLI and agent integrations operate over the same data model. None of them owns
exclusive state.

## 2. Goals

The standard MUST:

- keep the repository as the source of truth;
- remain useful without a hosted service;
- work in single repositories and monorepos;
- be readable and editable without the official UI;
- provide deterministic parsing and serialization for agents;
- support thousands of records without hiding work in long documents;
- expose one shared model to CLI, UI, CI and agent tools;
- support configuration without making every project semantically incompatible;
- preserve history through Git instead of replacing it;
- detect invalid, contradictory or stale project state;
- permit gradual adoption by existing projects;
- version the data contract and provide migrations;
- avoid coupling the protocol to a particular AI vendor, IDE or issue tracker.

## 3. Non-goals

Version 2 does not aim to be:

- a general-purpose team chat system;
- a replacement for Git;
- a hosted multi-tenant project-management SaaS;
- a real-time distributed lock manager;
- a full sprint, payroll or time-tracking product;
- an automatic truth engine that rewrites documentation based on source code;
- a vector database committed to the repository;
- an unrestricted plugin marketplace;
- a replacement for external issue trackers where an organization requires one.

External systems MAY be integrated through adapters, but the core standard remains usable
without them.

## 4. Design principles

### 4.1 Repository-native

Canonical records are ordinary files committed to Git. A clone of the repository contains
all durable protocol data needed to understand the project.

### 4.2 Text is canonical; indexes are disposable

Markdown and configuration files are authoritative. SQLite, search indexes, embeddings and
other caches are derived state and MUST be rebuildable.

### 4.3 One fact, one owner

The same fact SHOULD NOT be duplicated across paths, filenames, frontmatter and generated
indexes. References are preferred over copied state.

Examples:

- hierarchy uses `parent:` rather than nested task folders;
- attachments are discovered by record ID rather than duplicated in frontmatter;
- generated changelogs consume fragments rather than becoming a second editable source;
- collection labels come from configuration rather than being copied into each document.

### 4.4 Deterministic agent writes

An agent must be able to create or mutate a record without guessing formatting conventions.
The official core MUST provide stable parsing, serialization, ID allocation and validation.

### 4.5 Human-editable escape hatch

The CLI and UI are preferred mutation paths, but direct file editing remains supported.
`workfile doctor` is the reconciliation mechanism after manual edits.

### 4.6 Progressive enhancement

A project MAY adopt only cards first, then documentation, history and memory later. Missing
modules MUST NOT make the installed modules unusable.

### 4.7 Portable semantics, configurable vocabulary

Core behavior is standardized. Projects may configure bounded vocabularies such as areas,
labels and memory collections, but MUST NOT redefine fundamental semantics such as the
meaning of a closed card or the identity of a record.

### 4.8 Local by default

The server binds to loopback by default, performs no telemetry by default and sends no
repository data to an external service unless the user explicitly configures an adapter.

## 5. Terminology

| Term | Meaning |
| --- | --- |
| **Workspace** | A repository root governed by one `project.config.mjs`. |
| **Protocol root** | Directory containing managed protocol records, `.project/` by default. |
| **Module** | A first-class domain: cards, docs, changelog, memory or health. |
| **Record** | A stable identifiable unit represented by a file. |
| **Collection** | A configured group of records sharing a parser and semantics. |
| **Managed document** | A document created and mutated by the protocol. |
| **Indexed document** | An existing repository document discovered by the protocol but not owned by it. |
| **Source** | A long-form or external-origin document from which operational records were derived. |
| **Derived index** | Rebuildable search and relationship data stored outside canonical files. |
| **Agent adapter** | Generated instructions or tooling for a particular assistant or IDE. |
| **Schema version** | Version of the canonical on-disk protocol contract. |

## 6. Distribution architecture

### 6.1 Initial packaging decision

The repository is a pnpm workspace with a private root; the published surface
is one core npm package plus optional provider packages (for example
`@illodev/workfile-search-local`) released in version lockstep with it.
Repository layout and npm packaging are independent decisions — the core
SHOULD keep shipping as one npm package with strong internal module
boundaries:

```text
@illodev/workfile
├── bin/                 # project executable
├── core/                # public programmatic API
├── modules/
│   ├── cards/
│   ├── docs/
│   ├── changelog/
│   ├── memory/
│   └── health/
├── server/              # local HTTP API
├── ui/                  # precompiled static application
├── agents/              # instruction generators
└── migrations/          # schema and legacy migrations
```

Reasons for a single core package:

- installation and version alignment remain simple;
- the existing implementation is already one vertical application;
- UI, server and core can evolve atomically while contracts stabilize;
- splitting the core would create release and compatibility overhead before
  independent consumers exist. Provider packages are the exception, not a
  split: they carry heavy optional dependencies (an inference runtime) that
  must never reach consumers who did not opt in.

The source code MUST still enforce boundaries that allow later extraction.

### 6.2 Future package split

The following split MAY occur after at least two independent consumers require it:

```text
@illodev/workfile-core
@illodev/workfile-cli
@illodev/workfile-ui
@illodev/workfile-mcp
@illodev/workfile
```

The metapackage would preserve the same `workfile` command and configuration contract.

### 6.3 Runtime requirements

- Node.js: current active LTS and later.
- Package managers: npm, pnpm, Yarn and Bun projects are supported.
- The distributed UI MUST be precompiled; consuming projects do not require Vite or React.
- The package MUST not modify application dependencies unless explicitly requested.
- The CLI MUST work through `npx`, `pnpm dlx`, `yarn dlx` and `bunx` where supported.

## 7. Workspace discovery

The CLI discovers a workspace using this order:

1. Explicit `--root <path>`.
2. Nearest ancestor containing `project.config.mjs`.
3. Nearest ancestor containing `.project/VERSION`.
4. Current Git worktree root.
5. Current working directory.

Every command MUST print the resolved workspace root when `--verbose` is given.
It goes to stderr, so a `--json` consumer is unaffected and the answer still
reaches a human watching the run. `workfile ui` also prints it unconditionally
as part of its startup banner, and `--verbose` additionally turns on request
logging there.

A workspace is loaded through one function:

```ts
interface LoadWorkspaceOptions {
    cwd?: string;
    configPath?: string;
    readOnly?: boolean;
}

async function loadWorkspace(
    options?: LoadWorkspaceOptions
): Promise<ProjectWorkspace>;
```

Every CLI command, HTTP route, UI request and future MCP tool MUST use the same workspace
loader. No module may infer repository-relative paths from its own installed package path.

## 8. Configuration

### 8.1 Canonical file

The canonical configuration file is `project.config.mjs` at the workspace root.

```js
import { defineProject } from "@illodev/workfile";

export default defineProject({
    schemaVersion: 2,
    name: "Example project",

    storage: {
        root: ".project",
        cache: ".project/.cache"
    },

    cards: {
        enabled: true,
        path: ".project/cards",
        archivePath: ".project/cards/archive",
        assetsPath: ".project/assets",
        idPrefix: "T",
        maxHierarchyDepth: 2,
        claimLeaseHours: 24,
        areas: ["api", "web", "infra", "docs"],
        axes: { context: ["treasury", "verifactu", "billing", "iam"] },
        tags: []
    },

    docs: {
        enabled: true,
        managedPath: ".project/docs",
        layout: "kind",
        sources: [
            "README.md",
            "docs/**/*.md",
            "apps/*/README.md",
            ".project/specs/**/*.md"
        ],
        exclude: ["**/node_modules/**", "**/vendor/**"]
    },

    changelog: {
        enabled: true,
        fragmentsPath: ".project/changelog/unreleased",
        releasesPath: ".project/changelog/releases",
        output: "CHANGELOG.md"
    },

    memory: {
        enabled: true,
        path: ".project/memory",
        collections: [
            "learnings",
            "decisions",
            "incidents",
            "conventions",
            "context"
        ]
    },

    agents: {
        canonicalInstructions: ".project/agents/protocol.md",
        targets: ["agents-md", "claude", "cursor", "copilot"]
    },

    ui: {
        host: "127.0.0.1",
        port: 4747,
        open: true
    }
});
```

### 8.2 Configuration rules

- `schemaVersion` is required.
- All paths are repository-relative and MUST resolve inside the workspace unless a specific
  read-only external source adapter permits otherwise.
- The config module MUST be loaded without transpilation.
- Unknown top-level keys produce a warning in development and an error in strict CI mode.
- Environment variables MAY override runtime settings such as host and port, but MUST NOT
  silently alter canonical storage paths.
- Functions in configuration are permitted only through documented extension points.
- Secrets MUST NOT be stored in `project.config.mjs`; adapters use environment variables or
  external secret stores.

### 8.3 Stable and configurable vocabularies

The following are protocol-defined and stable in schema version 2:

- card statuses;
- base card types;
- priority semantics;
- relationship fields;
- core memory kinds;
- changelog fragment types;
- record identity and date formats.

The following are project-configurable:

- areas;
- additional classification axes (`cards.axes`);
- optional custom tags;
- source globs;
- enabled memory collections;
- UI preferences;
- agent adapter targets;
- additional validation rules.

Projects MAY add custom card types or memory collections through namespaced extensions, but
portable tools are required to treat unknown namespaced values as generic records rather
than failing to load the workspace.

## 9. Canonical folder layout

```text
project.config.mjs
.project/
├── VERSION
├── cards/
│   ├── T-0001-example.md
│   └── archive/
├── assets/
│   └── T-0001/
├── docs/                       # optional managed documents
├── changelog/
│   ├── unreleased/
│   └── releases/
├── memory/
│   ├── learnings/
│   ├── decisions/
│   ├── incidents/
│   ├── conventions/
│   └── context/
├── specs/
├── sources/                    # optional raw inputs, created on first use
├── agents/
│   ├── protocol.md
│   └── workflows/
└── .cache/                     # gitignored, fully rebuildable
```

Rules:

- `.project/VERSION` contains the schema version and MAY contain migration metadata.
- Canonical record folders are committed to Git.
- `.project/.cache/` MUST be ignored by Git.
- Empty optional directories need not exist until first use.
- Existing project documentation may remain outside `.project/` and be indexed through
  configuration.
- Record files SHOULD remain flat within their collection unless that collection explicitly
  defines date- or release-based partitioning.

## 10. Common record contract

All managed records share a small conceptual contract:

```ts
interface ProjectRecord {
    id: string;
    kind: string;
    title: string;
    path: string;
    created?: string;
    updated?: string;
    tags?: string[];
    related?: string[];
    body: string;
}
```

Not every file must physically repeat `kind` when its collection supplies it. The normalized
runtime model includes it.

### 10.1 IDs

- IDs are stable and MUST never be reused.
- An ID is `<PREFIX>-<SEQUENCE>` unless a module defines a date-keyed release ID.
- Default prefixes:

| Record | Prefix | Example |
| --- | --- | --- |
| Card | `T` | `T-0042` |
| Managed doc | `DOC` | `DOC-0012` |
| Changelog fragment | `CHG` | `CHG-0091` |
| Learning | `LRN` | `LRN-0017` |
| Decision | `ADR` | `ADR-0008` |
| Incident | `INC` | `INC-0004` |
| Convention | `CONV` | `CONV-0006` |
| Context | `CTX` | `CTX-0011` |

- Sequence width is at least four digits and expands without changing existing IDs.
- Allocation MUST scan active and archived records or use a transaction-safe local allocator.
- Concurrent CLI writers MUST not receive the same ID.

### 10.2 Dates

- Calendar dates use `YYYY-MM-DD`.
- Exact timestamps use RFC 3339 UTC unless a field explicitly requires a calendar date.
- `created` is immutable after creation.
- `updated` changes when canonical content or metadata changes.
- Generated indexes MUST preserve the source file modification time separately from semantic
  `updated`.

### 10.3 References

Cross-module references use record IDs where possible:

```yaml
related: [T-0042, ADR-0008, CHG-0091]
```

Paths remain valid where the target is not a managed record:

```yaml
source: docs/research/payment-retries.md
```

The indexer resolves references into a graph. Unknown IDs produce doctor warnings or errors
according to the field's strictness.

### 10.4 Frontmatter format

The protocol uses a deliberately restricted YAML-compatible subset:

- one scalar per line;
- inline scalar lists using `[a, b]`;
- JSON-compatible double-quoted escaping;
- simple single-quoted scalars may be read for compatibility;
- block scalars (`|`, `>`) and block sequences may be read, and are written back in the
  style they were read in;
- nesting goes exactly one level deep, in one of two shapes — a mapping of scalars and
  inline lists, or a sequence of such mappings;
- no anchors, aliases or tags, and no nesting past that one level;
- deeper structures use dedicated JSON files or repeated Markdown sections.

A key whose value falls outside this subset MUST be preserved verbatim on read and MUST be
refused on write, with an error naming the key. Writing a value the format cannot represent
MUST be refused for the same reason: silently serializing it loses what the author wrote.

The parser and serializer MUST be exact inverses for supported values. Repeated saves MUST
not cause textual drift. A nested value's list-ness is determined by how it is written —
`[a, b]` — and not by the name of its key, since key-level list declarations apply only to
the top level.

## 11. Module: Work cards

### 11.1 Purpose

Cards represent actionable or potentially actionable project work. They are the operational
layer of the protocol and SHOULD remain concise enough to scan, prioritize and execute.

### 11.2 File format

Filename:

```text
T-NNNN-short-slug.md
```

Example:

```yaml
---
id: T-0042
title: Prevent duplicate invoice submission
status: doing
type: bug
priority: high
area: billing
parent: T-0010
depends: [T-0038]
origin: [T-0031, ADR-0004]
source: .project/sources/audits/invoicing.md
tags: [invoices, idempotency]
effort: M
start: 2026-07-28
due: 2026-08-01
scope: [apps/api/src/Billing, packages/sdk]
claimed_by: session-56a30d1b
claimed_at: 2026-07-28T09:32:00Z
created: 2026-07-26
updated: 2026-07-28
---

The submission endpoint can create duplicate records after a network retry.

## Acceptance criteria

- [ ] Repeated requests with the same idempotency key create one invoice.
- [ ] Existing non-idempotent clients remain compatible.

## Activity

- 2026-07-28 09:32Z alice@studio · claimed
- 2026-07-28 11:04Z alice@studio · backlog → doing

## Notes

- 2026-07-28 — Claimed after confirming no overlapping active scope.
```

`## Activity` is the durable trail: every claim, release, transition, archive
and renumber appends one line, written by the mutation itself rather than by
the caller. A command that moved nothing appends nothing, so `transition ID
review` against a card already in `review` leaves no entry, and archiving an
archived card leaves none either. Archiving and unarchiving are written as
`archived` and `unarchived` rather than as a status change, because neither
moves the status. `## Notes` is the opposite — free prose a human or agent
writes deliberately.

A move that `force` let past a gate MUST say which gate and why, on the same
line — `review → done (forced past 3 unproven criteria: REASON)` — and the
reason MUST be demanded when, and only when, `force` waived something. Without
it a forced close and a proven one are the same entry, and every count taken
over closed cards counts them alike.

Set `cards.activityTrail: false` to switch the trail off for a workspace. It
defaults to `true`, and the only reason to disable it is a repository where the
churn costs more than the history is worth; the claim guards and the doctor do
not read it.

### 11.3 Statuses

| Status | Meaning |
| --- | --- |
| `backlog` | Identified with no commitment on when. |
| `next` | Explicitly prioritized for the upcoming execution batch. |
| `doing` | Work is actively in progress. |
| `review` | Implementation is complete but awaits verification, deployment or sign-off. |
| `blocked` | Progress depends on an external condition; Notes explain it. |
| `deferred` | Deliberately postponed; Notes record the decision. |
| `done` | Finished and verified in an environment where the result runs. |
| `discarded` | Will not be done; Notes explain why. |

`done` does not mean merely committed or merged. User-visible changes remain `review` until
verified in an appropriate running environment.

### 11.4 Types

| Type | Meaning |
| --- | --- |
| `epic` | Grouping record for related executable work. |
| `idea` | Unvalidated proposal, hidden from execution views by default. |
| `feature` | Accepted product capability. |
| `bug` | Incorrect existing behavior. |
| `task` | General executable work. |
| `audit` | Investigation or verification work. |
| `docs` | Documentation work. |
| `chore` | Maintenance without direct product behavior. |

### 11.5 Priority

| Priority | Meaning |
| --- | --- |
| `critical` | Immediate material risk or production impact. |
| `high` | Important work that should be prioritized soon. |
| `medium` | Normal priority. |
| `low` | Valuable but safely postponed. |

Priority MUST not encode workflow state or effort.

### 11.6 Classification axes

`area` is one axis and it is shaped like a delivery layer. A project that also
needs a domain axis — bounded contexts, products, customers — declares one under
`cards.axes`:

```js
cards: {
    areas: ["api", "web", "infra"],
    axes: { context: ["treasury", "verifactu", "billing", "iam"] }
}
```

Each declared axis becomes a flat frontmatter key on the card:

```yaml
area: api
context: treasury
```

Flat, not a nested `axes:` mapping, so the value stays greppable and the
existing query grammar reads it without a second index: `search
"context:treasury"` already filters on any frontmatter key.

Rules:

- an axis name MUST NOT collide with a field a card already owns;
- an axis MUST declare a non-empty vocabulary;
- a card value outside the declared vocabulary is invalid, the way an unknown
  `area` is;
- an axis is optional on a card unless a project rule says otherwise;
- an *undeclared* frontmatter key remains legal and unvalidated — declaring an
  axis is what turns a free-text note into something that fails loudly.

Health checks MUST report a card value outside the declared vocabulary as an
error. A card carrying no value for a declared axis SHOULD be a warning, and
only while the work is open: declaring an axis on an existing repository must
not produce one diagnostic per finished record.

The schema surface reports the declared axes, so an agent discovers them the way
it discovers areas rather than by reading the config file.

### 11.7 Hierarchy and relationships

The default hierarchy is:

```text
epic → task → subtask
```

Rules:

- hierarchy is expressed only through `parent:`;
- files do not move when re-parented;
- maximum depth defaults to two levels below an epic;
- any non-epic card may have children when within the configured depth;
- hierarchy cycles are invalid;
- deleting a parent is forbidden while references remain;
- `depends:` is an ordering hint, not a hard execution lock.

A card carries five relationship fields, and they are not interchangeable:

| Field | Holds | Means |
|---|---|---|
| `parent` | one card ID | this card is **part of** that one |
| `depends` | card IDs | those must close **before** this one is actionable |
| `origin` | record IDs, any kind | this card was **discovered while working on** those |
| `related` | record IDs, any kind | worth reading alongside; no direction, no claim |
| `source` | a repository-relative path | the file the work came from, checked on disk |

`origin` is provenance, not decomposition. A card found while working on another
is not part of it — the origin is usually already closed, blocks nothing, and
the reason it matters is the direction: it answers *where did this come from*,
and read backwards, *what did that produce*. It accepts decisions and learnings
as readily as cards, because a decision spawns work as often as a card does.

`origin` is declared, never inferred. Prose naming a record is a `mention` in
the reference graph; an `origin` is a `reference`, and the two are not mixed.
An origin that resolves to no record is reported by `doctor` as
`missing-origin`, and a card naming itself as `self-origin`.

`agents context --card ID` reports both directions of it: **Came out of** for
the card's own `origin`, **Spawned** for every card declaring this one.

### 11.8 Claims and scope

A claim is an advisory lease treated as binding by protocol-aware agents.

Starting work performs one logical operation:

```text
status = doing
claimed_by = current session or actor
claimed_at = current timestamp
scope = reviewed expected paths
updated = today
```

Finishing, deferring, blocking or abandoning work clears the claim unless ownership remains
explicitly justified by a configured workflow.

Rules:

1. Never work a card claimed by another active session.
2. Compare `scope` with all other `doing` cards before claiming.
3. Path overlap produces a coordination warning.
4. Claims older than the configured lease may be broken with an explanatory Note.
5. A card outside `doing` MUST NOT retain `claimed_by` or `claimed_at`.
6. The CLI SHOULD provide atomic `claim`, `release` and `transition` operations.

### 11.9 Scheduling

`start` and `due` are optional calendar dates used for planning views.

- `due` must not precede `start`;
- either field may exist alone;
- dates do not change card status automatically;
- a future date on a completed card is not treated as lateness;
- scheduling is not a commitment unless another configured policy says so.

### 11.10 Assets

Assets are stored by card ID:

```text
.project/assets/T-0042/mockup.png
```

Rules:

- asset discovery is convention-based and not duplicated in frontmatter;
- filenames are sanitized;
- uploads are size-limited;
- path traversal is rejected;
- archiving a card does not move or break its assets;
- images may be rendered inline and other files offered as local links;
- Git suitability must be communicated before adding large binaries.

### 11.11 Archiving

- `done` and `discarded` cards may be moved to the configured archive directory.
- Archiving is explicit, never automatic.
- Archived IDs remain reserved.
- References to archived cards remain valid.
- Reopening restores a card to the live directory before transitioning it.

## 12. Module: Documentation

### 12.1 Purpose

The Docs module provides one navigable and searchable view over project documentation without
requiring a disruptive migration of existing files.

It distinguishes:

1. **Indexed documents** — existing files owned by the project structure.
2. **Managed documents** — records created under the protocol with structured metadata.

### 12.2 Indexed documents

Configured glob patterns discover documents such as:

```text
README.md
docs/**/*.md
apps/*/README.md
packages/*/docs/**/*.md
```

Indexed documents:

- remain at their original path;
- are read-only by default in the protocol UI;
- may be opened in the configured editor;
- may participate in search, backlinks and freshness checks;
- do not require protocol frontmatter;
- receive a derived identity based on path unless explicitly assigned a managed ID.

### 12.3 Managed documents

Managed documents live under `.project/docs/` or another configured path.

```yaml
---
id: DOC-0012
title: Billing architecture
kind: architecture
status: current
owners: [billing]
related: [T-0042, ADR-0008]
created: 2026-07-20
updated: 2026-07-28
---

Long-form documentation body.
```

Default document kinds:

- `architecture`
- `product`
- `runbook`
- `guide`
- `reference`
- `research`
- `spec`
- `handoff`

Default statuses:

- `draft`
- `current`
- `stale`
- `superseded`
- `archived`

Projects MAY add namespaced kinds.

Managed documents MAY live in folders below the managed path. Implementations
MUST load them recursively, so a folder created by hand is a valid organization
with no protocol change, and MUST keep the identifier global and sequential: two
documents MUST NOT share an ID even in different folders. Folders are
organization, never identity, so moving a document MUST NOT change its ID.

`docs.layout` selects where new managed documents are written:

- `kind` (default) — a folder named after the document kind;
- `flat` — the managed root.

An explicit folder (`--folder`, or `folder` in the API) MUST override the layout
and MUST be rejected when it resolves outside the managed path.

### 12.4 Relationships

Docs may reference:

- cards that implement or maintain them;
- decisions that justify them;
- incidents that changed procedures;
- other documents they supersede;
- source-code paths they describe.

The UI SHOULD show incoming and outgoing links.

### 12.5 Freshness

The protocol MUST distinguish objective checks from heuristic checks.

Objective examples:

- referenced path no longer exists;
- related managed record ID is invalid;
- document declares `supersedes` but target is missing.

Heuristic examples:

- source paths changed after the document's `updated` date;
- related cards completed after the document was last reviewed;
- configured review interval expired.

Heuristic freshness issues are warnings, never automatic rewrites.

### 12.6 Documentation mutations

The MVP UI MAY keep documents read-only. The core and CLI MUST nevertheless expose safe
create and update functions for managed documents so future editors and agents do not bypass
validation.

## 13. Module: Changelog and releases

### 13.1 Purpose

The changelog module records user-meaningful and operator-meaningful changes as atomic
fragments, then composes them into releases and optional generated files.

Git commits remain implementation history. Changelog records describe the meaning of change.

### 13.2 Change fragment format

```yaml
---
id: CHG-0091
title: Prevent duplicate invoice submissions
type: fixed
area: billing
visibility: public
cards: [T-0042]
issues: []
created: 2026-07-28
updated: 2026-07-28
---

Network retries now reuse the original invoice instead of creating another one.
```

Default types:

- `added`
- `changed`
- `fixed`
- `deprecated`
- `removed`
- `security`
- `internal`

Visibility:

- `public`
- `internal`

### 13.3 Unreleased fragments

Fragments are created under:

```text
.project/changelog/unreleased/
```

They SHOULD be created in the same change set as the implementation when the result is worth
communicating. Trivial internal changes may omit them according to project policy.

### 13.4 Releases

A release operation:

1. selects unreleased fragments;
2. validates their references;
3. orders and groups them deterministically;
4. writes a release record;
5. optionally updates a generated `CHANGELOG.md`;
6. moves or marks consumed fragments without losing their IDs;
7. records the release version and date.

Release record example:

```yaml
---
id: REL-0017
title: Version 2.4.0
version: 2.4.0
date: 2026-07-28
fragments: [CHG-0091, CHG-0092]
commit: 1a2b3c4
---

Release notes may contain curated introductory text.
```

Release ids are sequential like every other record id, not derived from the
date: `changelog.releasePrefix` supplies the prefix and defaults to `REL`. An
earlier revision of this example showed `REL-2026-07-28`, which no release has
ever been called.

### 13.5 Generated changelog

A generated changelog is output, not canonical input. Manual prose may be preserved through
explicit managed sections or release records, never by editing generated sections that will
be overwritten.

### 13.6 Card integration

- Completing a card does not always require a changelog fragment.
- Public product changes SHOULD reference at least one fragment before becoming `done` when
  configured policy requires it.
- Changelog fragments MAY reference multiple cards.
- A release can be browsed back to the work, decisions and incidents that produced it.

## 14. Module: Project memory

### 14.1 Purpose

Memory stores durable project knowledge that should survive individual conversations and
agent sessions. It is not a transcript archive.

A memory record must answer at least one of these questions:

- What did we decide and why?
- What did we learn that changes future work?
- What failed and how do we prevent recurrence?
- What convention must future contributors follow?
- What temporary context matters until a known expiry point?

### 14.2 Memory collections

#### Learnings

Reusable observations supported by experience.

```yaml
---
id: LRN-0017
title: Avoid serializing lazy proxies in audit diffs
category: backend
status: active
confidence: high
occurrences: 3
related: [T-0042, INC-0004]
created: 2026-07-20
updated: 2026-07-28
---

Describe the observed pattern, evidence and preferred response.
```

Statuses: `active`, `graduated`, `superseded`, `discarded`.

A graduated learning has been converted into a convention, automated check, documentation or
code invariant.

#### Decisions

Architecture and product decisions, compatible with ADR practice.

```yaml
---
id: ADR-0008
title: Keep protocol data in repository Markdown
status: accepted
deciders: [owner]
supersedes: []
related: [DOC-0012]
created: 2026-07-28
updated: 2026-07-28
---

## Context

## Decision

## Consequences
```

Statuses: `proposed`, `accepted`, `rejected`, `superseded`.

#### Incidents

Operational failures and their prevention.

```yaml
---
id: INC-0004
title: Deployment marked complete before migrations shipped
severity: high
status: resolved
started_at: 2026-07-26T11:04:00Z
resolved_at: 2026-07-26T14:18:00Z
related: [T-1533, T-1561, LRN-0017]
created: 2026-07-26
updated: 2026-07-28
---

## Impact

## Timeline

## Root cause

## Corrective actions
```

Statuses: `open`, `mitigated`, `resolved`, `closed`.

#### Conventions

Stable rules contributors and agents must follow.

```yaml
---
id: CONV-0006
title: Verify user-visible changes before closing cards
status: active
scope: [project-wide]
related: [INC-0004]
created: 2026-07-28
updated: 2026-07-28
---

A user-visible card remains in review until verified in a running environment.
```

Statuses: `draft`, `active`, `deprecated`, `superseded`.

#### Context

Temporary project facts with explicit expiry or review.

```yaml
---
id: CTX-0011
title: Billing migration freeze window
status: active
expires: 2026-08-15
related: [T-0042]
created: 2026-07-28
updated: 2026-07-28
---

Describe the temporary constraint and what should happen at expiry.
```

Statuses: `active`, `expired`, `resolved`.

Context records SHOULD include `expires` or `review_after`. The doctor warns about expired
active context.

### 14.3 Memory quality rules

Memory MUST NOT become a dumping ground for conversation summaries.

A valid memory record SHOULD:

- contain a stable title and a specific claim;
- explain evidence or rationale;
- link to related records or sources;
- state consequences or future behavior;
- be updated or superseded when invalidated;
- avoid credentials, personal secrets and unnecessary sensitive data.

### 14.4 Graduation

Learnings and incidents should produce stronger artifacts when appropriate:

```text
observation → learning → convention / test / runbook / decision
incident → corrective cards → learning → convention
```

The UI SHOULD show graduation links and unresolved corrective actions.

## 15. Sources and traceability

Long-form raw inputs MAY be stored under `.project/sources/` and linked by records.

Examples:

- audits;
- research dumps;
- imported issue reports;
- migration inventories;
- handoffs;
- external-system exports.

Rules:

- sources are snapshots and SHOULD not be rewritten to reflect later execution state;
- operational state belongs in cards and related records;
- a source may be marked exhausted after all actionable content is represented elsewhere;
- source paths are repository-relative;
- the doctor verifies referenced local paths;
- imported sources MAY store origin metadata such as URL or external issue ID.

## 16. Core architecture

### 16.1 Layers

```text
Configuration and schemas
          ↓
Workspace and filesystem adapters
          ↓
Module repositories and domain services
          ↓
Validation, indexing and relationship graph
          ↓
CLI / HTTP API / MCP adapters
          ↓
Local UI and generated agent instructions
```

Dependencies point downward only. The UI MUST NOT contain canonical business rules that the
core does not enforce.

### 16.2 Public core API

The package exposes a documented programmatic API. Every name below is resolved
against the built package by "no doc imports a name the package does not
export" in `test/documentation.test.ts`, so this block cannot drift from what
ships without failing the suite.

```ts
export {
    defineProject,
    loadWorkspace,
    initializeProject,
    applyLegacyMigration,
    buildProjectIndex,
    runDoctor
} from "@illodev/workfile";

export type {
    ProjectConfig,
    ProjectWorkspace,
    ProjectRecord,
    CardRecord,
    DocumentRecord,
    ChangeRecord,
    MemoryRecord,
    DoctorReport
} from "@illodev/workfile";
```

Module operations are free functions taking a workspace, not repositories
hanging off one. `ProjectWorkspace` carries the configuration, the resolved
paths, the effective schema and the declared integrations — it exposes no
methods, and a caller reaches every operation through the functions below
rather than through a raw file write:

```ts
const { cards } = await loadCards(workspace);
await createCard(workspace, input);
await patchCard(workspace, id, changes, { actor });
await claimCard(workspace, id, { actor, scope });
await transitionCard(workspace, id, status, { actor });
const { documents } = await loadDocuments(workspace);
await createChangeFragment(workspace, input);
await createMemoryRecord(workspace, collection, input);
searchProjectRecords(records, query, { kinds, limit });
```

`searchProjectRecords` takes records rather than a workspace because ranking is
pure: the caller decides what corpus is eligible, which is what lets the CLI,
the HTTP API and MCP share one ranking over different candidate sets.

Subpath exports group the same functions by module — `@illodev/workfile/cards`,
`/docs`, `/changelog`, `/memory`, `/records`, `/search`, `/agents`, `/ci`,
`/core`, `/server`, `/mcp`, `/init`, `/migration`, `/claude`,
`/integrations` — and the root re-exports all of them.

### 16.3 Filesystem adapter

All canonical writes MUST:

1. resolve and validate paths inside the workspace;
2. read the latest on-disk version;
3. validate the intended mutation;
4. write to a temporary file in the same filesystem;
5. atomically rename into place where supported;
6. preserve the body and unknown compatible fields;
7. update semantic timestamps;
8. invalidate affected indexes;
9. return the normalized saved record.

Direct `writeFile` calls outside the filesystem adapter are forbidden in protocol modules.

### 16.4 Optimistic concurrency

Mutation APIs SHOULD accept a revision token derived from file content or metadata:

```ts
interface MutationOptions {
    expectedRevision?: string;
}
```

If the file changed after the client loaded it, the mutation returns a conflict rather than
silently overwriting another human or agent.

### 16.5 Unknown fields

The parser MUST preserve unknown frontmatter fields during edits unless they are invalid or
belong to an unsupported future schema version. This permits compatible extensions and safe
round trips.

## 17. Derived index and search

### 17.1 Cache

The default derived index is stored at:

```text
.project/.cache/index.sqlite
```

The exact engine is an implementation detail. It MAY initially be an in-memory index with a
JSON cache, provided the public behavior is stable.

### 17.2 Indexed data

The index may contain:

- normalized record metadata;
- full-text document content;
- outgoing and incoming references;
- hierarchy and dependency edges;
- source paths;
- file fingerprints;
- validation summaries;
- optional embeddings.

### 17.3 Rebuildability

Deleting `.project/.cache/` MUST NOT lose canonical data. `workfile doctor --rebuild-cache`
recreates it from repository files.

### 17.4 Search syntax

A common query language should serve CLI and UI:

```text
payment retry
area:billing status:doing
kind:decision tag:architecture
related:T-0042
path:docs/fiscal
-type:idea
"exact phrase"
```

Unknown field tokens should produce a helpful warning rather than being silently interpreted
as free text.

### 17.5 Semantic search

Semantic search is optional and disabled by default. When enabled:

- embeddings are derived state;
- the provider and data boundary are explicit;
- local providers are supported where practical;
- repository content is never sent externally without user configuration;
- results always link back to canonical files.

## 18. Validation and workfile doctor

### 18.1 Command

```bash
workfile doctor
workfile doctor --json
workfile doctor --severity error
workfile doctor --new
workfile doctor --accept-baseline
workfile doctor --fix
```

`--fix` only applies deterministic, reversible fixes. It MUST show a plan unless `--yes` is
provided.

### 18.2 Severity

- `error` — invalid canonical state or unsafe operation; non-zero exit.
- `warning` — likely inconsistency or stale state; configurable CI behavior.
- `info` — recommendation or maintenance opportunity.

### 18.3 Cross-module checks

The doctor validates at least:

- configuration and schema version;
- required fields and enums;
- IDs, filenames and duplicate identity;
- parser round-trip stability;
- hierarchy depth and cycles;
- broken strict references;
- missing source paths;
- date and range validity;
- claim coherence and stale claims;
- overlapping active scopes;
- archived record eligibility;
- unchecked acceptance criteria on completed cards;
- expired active context;
- superseded records still marked active;
- missing release fragments where required by policy;
- stale managed documentation heuristics;
- orphaned asset directories;
- generated agent instructions out of sync;
- uncommitted schema migrations where detectable.

Duplicate identity has a repair contract, because sequential IDs are allocated by scanning
the local maximum and two clones therefore mint the same one independently. Filenames carry
a title slug, so both files merge without a conflict and the collision surfaces only in the
doctor.

- A duplicate is healed by moving the losing record to a free ID in its own sequence. The
  surviving record keeps the ID and keeps every reference already written to it.
- The survivor MUST be chosen deterministically, so two clones repairing the same collision
  converge without coordinating. Comparisons MUST order by code unit rather than by locale.
- A record that has been published MUST NOT move. A released changelog fragment is frozen
  when its release is cut, and renumbering it would rewrite history that has shipped.
- A collision the tool declines to heal MUST be reported with the reason it declined, and
  MUST NOT name a command that cannot perform the repair.

### 18.4 Baseline mode

`--accept-baseline` records the current issues as known, and `--new` then exits non-zero only
on issues that appeared since. This is the adoption path for an existing repository and the
recommended CI gate.

A per-diff mode was specified here for a long time and never built. It is not planned: rule
evaluation is 3–5% of the command's cost at every measured scale — the rest is reading the
corpus, which a scoped run cannot skip and which is cold in CI regardless, since the cache
directory is not committed. Several rules are also global by nature (a stale claim, an expired
context, a duplicate id), so a run scoped to touched records would report them only after the
merge that made them matter.

### 18.5 Rule registry

Rules implement a shared interface:

```ts
interface DoctorRule {
    id: string;
    modules: string[];
    run(context: DoctorContext): Promise<DoctorIssue[]>;
    fix?: (issue: DoctorIssue, context: FixContext) => Promise<FixResult>;
}
```

Project-specific rules use namespaced IDs.

## 19. CLI

### 19.1 Entry points

```bash
workfile init
workfile schema
workfile doctor
workfile upgrade
workfile version
workfile ui
workfile card
workfile doc
workfile changelog
workfile memory
workfile agents
workfile ci
workfile claude
workfile migrate
workfile mcp
workfile search
```

Running `workfile` with no subcommand starts the UI. Nothing in configuration
disables that: the command word defaults to `ui` before any config is read.

### 19.2 Initialization

```bash
pnpm dlx @illodev/workfile init
```

The initializer:

1. discovers the repository and package manager;
2. detects monorepo workspaces and likely areas;
3. finds existing documentation paths;
4. asks which modules to enable;
5. asks which agent environments are used;
6. proposes paths and previews changes;
7. creates configuration and protocol directories;
8. writes `.project/VERSION`;
9. updates `.gitignore` for cache only;
10. optionally adds package scripts;
11. optionally imports an existing v1 backlog;
12. runs the doctor and prints next steps.

It MUST NOT overwrite existing files without confirmation or an explicit merge strategy.

### 19.3 Suggested package scripts

```json
{
    "scripts": {
        "project": "workfile ui",
        "project:doctor": "workfile doctor",
        "project:agents": "workfile agents sync"
    }
}
```

The package manager prefix is detected; the protocol itself does not require these aliases.

### 19.4 Card commands

```bash
workfile card list
workfile card show T-0042
workfile card create
workfile card patch T-0042 --json-input changes.json
workfile card claim T-0042 --scope apps/api
workfile card release T-0042
workfile card transition T-0042 review
workfile card archive T-0042
workfile card reopen T-0042
```

Machine-oriented usage supports JSON input and output:

```bash
workfile card create --json-input card.json --json
```

### 19.5 Documentation commands

```bash
workfile docs list
workfile docs create --kind architecture
workfile docs show DOC-0012
workfile search "billing retry" --kind doc
```

### 19.6 Changelog commands

```bash
workfile changelog add
workfile changelog list --unreleased
workfile changelog release 2.4.0
workfile changelog render
workfile changelog verify
```

### 19.7 Memory commands

```bash
workfile memory add learning
workfile memory add decision
workfile memory add incident
workfile memory add convention
workfile memory add context
workfile memory list --query "deployment verification"
workfile memory supersede ADR-0008
workfile memory graduate LRN-0017 --to CONV-0001
```

### 19.8 Exit codes

- `0` success;
- `1` validation or expected command failure;
- `2` invalid usage or configuration;
- `3` write conflict;
- `4` migration required;
- other codes reserved for documented fatal errors.

## 20. Local server and HTTP API

### 20.1 Server behavior

```bash
workfile ui
```

- serves the precompiled UI and JSON API from one local process;
- binds to `127.0.0.1` by default;
- selects configured port or a free alternative when allowed;
- prints the workspace and URL;
- may open the browser;
- watches canonical files and updates clients;
- never assumes the package is located inside the project tree.

### 20.2 API shape

Versioned endpoints use `/api/v2`:

```text
GET    /api/v2/workspace
GET    /api/v2/schema
GET    /api/v2/records
GET    /api/v2/records/:id
POST   /api/v2/cards
PATCH  /api/v2/cards/:id
POST   /api/v2/cards/:id/claim
POST   /api/v2/cards/:id/transition
POST   /api/v2/cards/bulk
GET    /api/v2/docs
GET    /api/v2/changelog
GET    /api/v2/memory
GET    /api/v2/search
GET    /api/v2/health
POST   /api/v2/index/rebuild
```

Module-specific routes may supplement the common record API.

### 20.3 Schema endpoint

The UI MUST obtain effective vocabularies and module capabilities at runtime:

```json
{
    "schemaVersion": 2,
    "modules": {
        "cards": true,
        "docs": true,
        "changelog": true,
        "memory": true
    },
    "cards": {
        "statuses": ["backlog", "next", "doing", "review", "blocked", "deferred", "done", "discarded"],
        "types": ["epic", "idea", "feature", "bug", "task", "audit", "docs", "chore"],
        "priorities": ["critical", "high", "medium", "low"],
        "areas": ["api", "web", "infra", "docs"]
    }
}
```

The UI MUST NOT compile project-specific areas or collections into its TypeScript bundle.

### 20.4 API errors

Errors use a stable structure:

```json
{
    "error": {
        "code": "CARD_WRITE_CONFLICT",
        "message": "The card changed after it was loaded.",
        "details": {}
    }
}
```

## 21. User interface

### 21.1 Information architecture

The primary navigation groups the product by user intent:

```text
Work
├── Explorer
├── Triage
├── Flow
├── Epics
└── Timeline

Knowledge
├── Docs
├── Memory
└── Search

History
├── Changelog
└── Releases

System
└── Health
```

Exact visual navigation may use tabs, sidebar or command palette, but these concepts remain
separate.

### 21.2 Shared behaviors

- global search across enabled modules;
- bookmarkable URL state;
- light and dark themes;
- keyboard navigation;
- accessible drawers and dialogs;
- local editor deep links;
- relationship and backlink panels;
- optimistic updates with conflict recovery;
- file-change refresh without erasing unsaved edits;
- clear read-only versus editable state;
- useful empty states when a module is disabled or uninitialized.

### 21.3 Work views

The existing concepts remain:

- Explorer: virtualized table, facets, sorting and bulk mutation;
- Triage: one-card prioritization queue with keyboard shortcuts;
- Flow: execution board with drag-and-drop transitions;
- Epics: hierarchy and child progress;
- Timeline: optional scheduling view;
- card drawer: metadata, Markdown body, relationships and assets.

### 21.4 Docs view

The Docs view provides:

- source/collection tree;
- full-text search;
- Markdown rendering;
- metadata and freshness status;
- incoming and outgoing links;
- related work and decisions;
- open-in-editor action;
- optional managed-document editing after MVP.

### 21.5 Changelog view

The History view provides:

- unreleased fragments;
- release groups;
- public/internal visibility filters;
- linked cards and decisions;
- release preparation preview;
- rendered output preview;
- validation before release.

### 21.6 Memory view

The Memory view provides:

- collection filters;
- active/superseded/expired states;
- relationship graph or backlinks;
- learning occurrence and confidence metadata;
- decision chains;
- incident corrective actions;
- graduation and supersession actions.

### 21.7 Health view

Health renders the exact doctor report, supports severity filtering and links issues to their
records and files. It MUST not implement a separate set of validation rules.

## 22. Agent protocol

### 22.1 Canonical instructions

The source instruction set lives under:

```text
.project/agents/protocol.md
.project/agents/workflows/*.md
```

Adapters generate concise compatible instructions for:

```text
AGENTS.md
CLAUDE.md
.cursor/rules/workfile.mdc
.github/copilot-instructions.md
```

Generated blocks include a version marker and MUST be replaceable without overwriting
unrelated user content.

### 22.2 Core obligations

A protocol-aware agent MUST:

1. inspect relevant project records before beginning substantial work;
2. create cards in the same session when actionable pending work is discovered;
3. claim a card before modifying its scope;
4. check active claims and overlapping scopes;
5. keep the card updated while working;
6. clear claims when active work stops;
7. use `review` until verification supports `done`;
8. record durable decisions, incidents or learnings when they change future behavior;
9. add changelog fragments when project policy requires them;
10. never place credentials or unnecessary sensitive information in workfile memory;
11. run relevant doctor checks before finishing;
12. prefer CLI or MCP mutations over hand-written frontmatter.

### 22.3 Agent context budget

Agents SHOULD load the smallest relevant context:

- one card and its relationship neighborhood;
- scoped docs and decisions;
- active conventions;
- unresolved incidents relevant to the paths;
- non-expired context.

The protocol MUST not encourage injecting the entire workfile memory into every prompt.

### 22.4 Instruction synchronization

```bash
workfile agents sync
workfile agents check
```

`sync` regenerates managed instruction blocks. `check` fails when generated blocks are stale
relative to the installed protocol version or project configuration.

## 23. MCP and tool adapters

MCP is an adapter over core services, not a second implementation.

The tool catalogue is **not restated here**. `docs/mcp.md` documents every
shipped tool with its parameters and reply shape, and `workfile mcp inspect`
prints the same list from the definitions the server answers `tools/list` with.
An earlier revision of this section listed fourteen recommended tools in a
verb-first naming scheme. The server shipped noun-first in 0.1.0 and grew past
it, so from the first release until this was corrected the normative document
named thirteen tools no client could call. A second copy of a catalogue is only
right until one of them moves.

Tools are named `project_<module>_<operation>` — the module first, so a client
listing them reads them grouped: `project_card_list`, `project_card_claim`,
`project_doc_create`, `project_memory_add`. Operations that answer for any
record type drop the module: `project_search`, `project_next`,
`project_get_record`, `project_workspace`, `project_doctor`.

Rules:

- all writes use the same validation and concurrency behavior as CLI;
- tools return stable machine-readable errors;
- mutating tools report changed files;
- tool descriptions include protocol semantics, especially `review` versus `done`;
- the server may expose MCP over stdio first; network transports are optional later.

## 24. Security and safety

### 24.1 Path safety

- all local paths are normalized and checked against workspace boundaries;
- symlink escapes are rejected for writes;
- asset and document routes reject traversal;
- external read-only sources require explicit configuration;
- arbitrary file serving is prohibited.

### 24.2 Local server

- loopback binding is default and recommended;
- non-loopback binding requires an explicit flag and warning;
- no authentication is required for loopback MVP;
- remote binding requires authentication before being considered supported.

### 24.3 Content safety

- Markdown rendering sanitizes unsafe HTML;
- external links are clearly marked and opened safely;
- `vscode://` or editor links are opt-in/configurable;
- uploaded filenames and MIME handling are defensive;
- executable attachments are not launched by the server.

### 24.4 Sensitive data

The doctor SHOULD detect likely secrets in protocol records through optional integration with
existing secret scanners. The protocol itself does not store credentials.

## 25. Schema versioning and migrations

### 25.1 Version declaration

`project.config.mjs` and `.project/VERSION` declare the schema version. A mismatch is an
error requiring reconciliation.

Example `.project/VERSION`:

```json
{
    "schemaVersion": 2,
    "createdWith": "@illodev/workfile@2.0.0",
    "migratedAt": "2026-07-28T10:00:00Z"
}
```

### 25.2 Compatibility

- patch package releases do not change canonical schema;
- minor package releases may add optional backward-compatible fields or commands;
- schema-breaking changes require a new schema version and migration;
- newer unsupported schema versions are opened read-only where possible;
- unknown compatible fields are preserved.

### 25.3 Migration behavior

```bash
workfile migrate plan
workfile migrate apply
```

Migrations:

1. inspect current state;
2. produce a human-readable plan;
3. create a Git-friendly backup or require a clean worktree;
4. apply deterministic file changes;
5. run the doctor;
6. report every changed path;
7. update version metadata only after successful validation.

No migration deletes historical records by default.

## 26. Migration from Unified Backlog System v1

The existing implementation is treated as a supported legacy source.

### 26.1 Legacy layout

```text
.planning/backlog/
├── tasks/
├── archive/
├── assets/
├── board/
└── SPEC.md

.planning/changelog/
.planning/learnings/
.planning/sources/
```

### 26.2 Migration mapping

| v1 | v2 |
| --- | --- |
| `.planning/backlog/tasks/` | `.project/cards/` |
| `.planning/backlog/archive/` | `.project/cards/archive/` |
| `.planning/backlog/assets/` | `.project/assets/` |
| `.planning/changelog/` | `.project/changelog/` or configured source |
| `.planning/learnings/` | `.project/memory/learnings/` |
| `.planning/sources/` | `.project/sources/` |
| v1 board source | installed npm package; removed after verification |
| fixed Fube areas | configured `cards.areas` |

### 26.3 Compatibility-first approach

The migrator SHOULD support two strategies:

#### In-place compatibility

Keep existing paths and generate configuration pointing to them. This minimizes the first
diff and allows the package architecture to be validated before moving data.

#### Canonical relocation

Move records to `.project/` with Git-aware renames and rewrite affected relative links.

The default recommendation is:

1. install the package;
2. use existing v1 paths through config;
3. validate feature parity;
4. relocate records in a later dedicated migration.

### 26.4 Code extraction plan

The existing implementation should be transformed in this order:

1. move parser, serializer and diagnostic logic into `src/core`;
2. introduce `loadWorkspace()` and configuration-driven paths;
3. replace server-relative constants with workspace services;
4. move all canonical writes behind repositories and atomic filesystem operations;
5. add runtime schema endpoint;
6. remove project-specific enums from the UI bundle;
7. package prebuilt UI assets;
8. generalize Knowledge into configured Docs, History and Memory collections;
9. add CLI initialization and migrations;
10. generate agent instructions;
11. add MCP only after core contracts stabilize.

### 26.5 Required parity before deleting v1 board code

- all existing cards load without semantic change;
- parser round-trip tests remain byte-stable;
- create, patch, bulk patch, claim, archive and asset upload work;
- Explorer, Triage, Flow, Epics, Timeline and Health remain functional;
- changelogs and learnings remain discoverable;
- existing URLs have an equivalent or redirect where practical;
- doctor output is equal or stricter with documented changes;
- no v1 source directory is deleted automatically.

## 27. Extensibility

### 27.1 Internal module contract

```ts
interface ProjectModule {
    id: string;
    version: number;
    collections: CollectionDefinition[];
    load(workspace: ProjectWorkspace): Promise<ModuleRuntime>;
    doctorRules?: DoctorRule[];
    routes?: RouteDefinition[];
    cli?: CommandDefinition[];
    ui?: UiModuleManifest;
    agentInstructions?: InstructionFragment[];
}
```

Version 2 uses this contract internally. Third-party npm modules are not a public stability
promise until the contract has been validated by real modules.

### 27.2 Namespacing

Extensions use namespaced IDs and fields:

```text
acme/risk
acme.compliance_level
```

Core serializers preserve them. Portable UI may display unknown fields generically.

### 27.3 External adapters

Adapters may connect GitHub, GitLab, Jira, Linear, Slack or deployment systems. They MUST
state which side is authoritative and how conflicts are resolved.

No adapter may silently convert the repository into a non-authoritative cache.

## 28. Performance requirements

The MVP target workspace contains:

- 10,000 cards;
- 10,000 documentation and memory records combined;
- 5,000 changelog fragments and releases;
- ordinary Markdown bodies up to 1 MB;
- assets excluded from full-text indexing unless supported.

Targets on a typical developer machine after warm index:

- initial UI metadata response under 1 second for 10,000 cards;
- common filtered search under 150 ms;
- single-record mutation under 250 ms excluding filesystem contention;
- incremental reindex of one changed Markdown file under 200 ms;
- UI remains responsive through virtualization or incremental rendering.

Cold scans may exceed these targets but SHOULD stream progress and cache results.

## 29. Testing strategy

### 29.1 Core tests

- parser and serializer inverse properties;
- unknown-field preservation;
- ID allocation under concurrent requests;
- atomic write recovery;
- path traversal and symlink escapes;
- hierarchy and relationship validation;
- migration fixtures;
- schema compatibility fixtures;
- module repository behavior.

### 29.2 CLI tests

- workspace discovery;
- non-interactive JSON mode;
- initializer merge safety;
- exit codes;
- dirty worktree migration behavior;
- package-manager detection.

### 29.3 Server tests

- versioned endpoints;
- conflict responses;
- static UI and asset serving;
- input size limits;
- Markdown sanitization;
- runtime schema delivery.

### 29.4 UI tests

- large dataset navigation;
- filters and URL state;
- edit conflict recovery;
- unsaved-form protection on refresh;
- keyboard and accessibility flows;
- module-disabled states;
- relationship navigation.

### 29.5 Golden project fixtures

The repository SHOULD include fixtures for:

- empty project;
- cards-only project;
- full v2 project;
- legacy v1 project;
- corrupted project with expected doctor output;
- future-schema read-only project.

## 30. CI integration

Recommended workflow:

```bash
workfile doctor --new
workfile agents check
workfile changelog verify
```

Optional full validation on protected branches:

```bash
workfile doctor --severity warning
workfile changelog verify
workfile memory verify
```

CI MUST not require starting the UI.

## 31. Observability

The local server may emit structured debug logs when enabled:

```text
time, level, operation, module, recordId, durationMs, changedPaths
```

Default output remains quiet and human-readable. Telemetry is disabled by default.

Doctor reports and migration plans are reproducible artifacts suitable for CI upload.

## 32. MVP definition

Version 2 MVP is complete when all of the following are true:

### Core and configuration

- one npm package exposes the CLI and programmatic core;
- workspace discovery and `project.config.mjs` work;
- schema versioning and `.project/VERSION` work;
- all paths are configuration-driven;
- writes are atomic and preserve unknown fields.

### Work

- feature parity with the existing card system;
- runtime-configured areas;
- atomic claim and transition commands;
- cards remain readable and editable as Markdown.

### Docs

- configured Markdown sources are indexed and searchable;
- managed documents can be created through core/CLI;
- UI can browse and render documents with backlinks.

### History

- changelog fragments can be created, browsed and validated;
- release records can consume fragments;
- generated changelog preview is available.

### Memory

- learning, decision, incident, convention and context records load;
- records can be created through core/CLI;
- supersession, expiry and relationships are validated;
- UI can browse and search all collections.

### System

- unified search works across modules;
- Health renders shared doctor results;
- initializer and v1 compatibility migration exist;
- canonical agent instructions and at least `AGENTS.md` adapter exist;
- CI commands work without UI dependencies.

MCP, semantic search, remote adapters and public plugins are not required for MVP.

## 33. Implementation phases

### Phase 0 — Lock contracts

- approve this spec;
- choose final project/package name;
- settle default paths and config shape;
- add golden fixtures from the existing v1 implementation.

### Phase 1 — Core extraction

- create package skeleton;
- extract parser, serializer, loader and doctor;
- add workspace/config services;
- implement atomic writes and revision tokens;
- keep current UI temporarily connected through a compatibility server.

### Phase 2 — Portable Work module

- configuration-driven areas and paths;
- CLI card operations;
- runtime schema endpoint;
- precompiled UI package;
- v1 compatibility configuration;
- parity tests.

### Phase 3 — Docs and unified index

- glob discovery;
- common record index and search;
- Docs UI;
- backlinks and freshness checks;
- managed document CLI.

### Phase 4 — History and Memory

- changelog fragments and releases;
- memory collection schemas;
- History and Memory UI;
- graduation, supersession and expiry checks.

### Phase 5 — Initialization and agents

- interactive/non-interactive initializer;
- agent protocol generator;
- adapters for selected environments;
- CI templates;
- migration plan/apply commands.

### Phase 6 — Integrations

- MCP server;
- semantic search option;
- external tracker and deployment adapters;
- evaluate public plugin API.

## 34. Phase 0 decisions

The following decisions are locked for the v2 implementation. Changes require a dated
amendment and, when they affect canonical files, an explicit schema compatibility analysis.

1. **Product and CLI** — the technical product name is **Workfile**; the formal
   standard remains **Repository Workfile**. The executable is `workfile`.
2. **Default root** — canonical managed data uses `.project/`. Every path remains
   configurable to support compatibility and specialized repositories.
3. **Package scope** — the initial package is `@illodev/workfile`. The package is internally
   modular but ships as one release unit through the v2 MVP.
4. **Canonical language** — the whole protocol surface is English: normative
   specifications, field names, enum values, diagnostic codes, machine contracts, UI
   labels, generated instructions and record bodies. Localization was offered through
   `config.language` until 0.6.x and removed in ADR-0012; the key is accepted and
   ignored so existing configurations keep loading.
5. **Card statuses** — the existing eight statuses are fixed protocol semantics in schema v2.
   Projects may hide statuses from selected views but may not remove or redefine them.
6. **Managed Docs UI** — indexed and managed documents are read-only in the MVP UI. Managed
   documents can be created and updated through core and CLI. In-UI document editing is
   deferred until conflict handling has proven stable on cards.
7. **Release model** — release identifiers are project-configurable. Semver is the default;
   calendar/date releases are supported. The selected strategy is declared in configuration
   and may not be inferred differently by CLI, UI and CI.
8. **ID allocation** — MVP allocation scans active and archived IDs, proposes the next
   sequence and exclusively creates a transient ID reservation under the disposable cache
   before writing the slugged record file. A collision causes a bounded retry with the next
   sequence. No canonical counter file is introduced in schema v2. Stale reservations are
   diagnosable and recoverable.
9. **Derived index** — Phase 1 starts with an in-memory index behind an `IndexStore` contract.
   The MVP persistent implementation is disposable SQLite under `.project/.cache/`. Canonical
   behavior must not depend on SQLite being present or intact.
10. **Agent instruction ownership** — `.project/agents/protocol.md` and workflow files are the
    canonical instruction source. Root/editor files contain generated, replaceable managed
    blocks and may also contain unrelated human-maintained instructions.
11. **v1 migration** — compatibility-path adoption is the default. Canonical relocation to
    `.project/` is a separate explicit migration after functional parity is verified.
12. **Publication** — development begins as a private package. Publication and license are
    product-governance decisions and do not block or alter the v2 technical contracts.

### 34.1 Phase 0 acceptance criteria

Phase 0 is complete when:

- this RC is accepted as the implementation contract;
- the legacy v1 implementation is preserved as a golden fixture;
- default configuration and effective schema fixtures exist;
- parser round-trip and doctor parity tests run outside the legacy board directory;
- Phase 1 code no longer imports paths or enums from the Fube repository layout.

## 35. Locked implementation defaults

Unless amended, implementations use these defaults:

```text
Product:             Workfile
Package:             @illodev/workfile
CLI:                 project
Schema:              2
Root:                .project/
Config:              project.config.mjs
Canonical language:  English, with no localized surface
Index:               in-memory first; disposable SQLite for MVP
Migration:           compatibility paths first
Instructions:        .project/agents/protocol.md is canonical
```

The following original design recommendations remain in force:

1. One npm package for the v2 MVP, with internal boundaries suitable for later extraction.
2. Markdown as canonical storage and a disposable local index.
3. Project-specific areas are supplied at runtime by configuration.
4. Docs index existing files and manage optional protocol-owned documents.
5. Changelog uses atomic fragments plus release records.
6. Memory is split into learnings, decisions, incidents, conventions and expiring context.
7. CLI/core operations are authoritative; prompts only explain how to invoke them.
8. MCP is built after the core API stabilizes.
9. The local UI remains one precompiled application served by the package.

## 36. Phase 6 integration decisions

1. **MCP transport** — schema-v2 ships a local stdio server. Messages are UTF-8,
   newline-delimited JSON-RPC. Streamable HTTP is deferred until authentication, Origin
   validation and deployment-specific authorization have a concrete remote-use case.
2. **Protocol revisions** — the server is dual-era. Modern requests implement revision
   `2026-07-28` with per-request metadata, `server/discover`, stateless operation,
   `resultType` and cache metadata. Legacy clients may negotiate `2025-11-25` and the
   implementation's declared earlier revisions through `initialize`.
3. **Shared domain core** — MCP tools call the same core mutations as CLI and HTTP. No MCP
   handler may write canonical files directly.
4. **Safety mode** — MCP can be started read-only. Mutating tools are omitted from discovery
   and direct mutation calls fail with a stable protocol result.
5. **Resources and prompts** — canonical records are readable through `project://` resources.
   Start-work, finish-work and record-knowledge prompts are protocol adapters, not separate
   sources of project truth.
6. **Semantic search** — lexical search remains the built-in deterministic default. Semantic
   ranking is accepted only through an explicitly injected provider. The package never sends
   repository content to a network service by itself.
7. **Integration API** — the 0.6 integration registry is experimental and limited to approved
   semantic search and health adapters. It must mature from real usage before becoming a
   general plugin ABI.
8. **Vendor adapters** — issue tracker and deployment-provider adapters are deferred. Their
   credentials, remote identity and synchronization semantics are not canonical schema-v2
   concerns.
9. **Publication governance** — technical packaging is prepared, but the package remains
   `private: true` and `UNLICENSED` until the owner makes the publication and license decision
   recorded as open in Phase 0.

## 37. Amendment log

- **2026-07-28 RC2** — Locked the dual-era local MCP stdio contract (`2026-07-28` modern
  semantics plus legacy initialization compatibility), explicit read-only behavior,
  host-injected semantic search and the intentionally narrow experimental integration API.
- **2026-07-28 RC1** — Locked Phase 0 technical contracts: product/package names, `.project/`
  root, fixed statuses, read-only Docs MVP UI, release strategy, collision-safe transient ID reservation,
  staged index implementation, canonical agent instructions and compatibility-first migration.
- **2026-07-28 DRAFT** — Initial v2 draft derived from Unified Backlog System v1 and expanded
  into a portable repository operating protocol covering Work, Docs, History and Memory.
