---
id: T-0225
title: "A re-wrapped scope: makes a card unclaimable"
status: review
type: bug
priority: high
area: core
tags: [frontmatter, codec, doctor, prettier]
effort: S
created: 2026-08-27
updated: 2026-08-27
raised: derived
---

A formatter reformats the YAML header along with the Markdown around it, and a flow
sequence wider than its print width comes back spread over lines:

```yaml
scope:
  [
    apps/api/src/FubeCore/Domain/Billing/TaxModel/State/Provider/Model349StateProvider.php,
  ]
```

Valid YAML, the same list, and `scanEntries` classified it `opaque` — so `patchFrontmatter`
refused to rewrite the key. `card claim` writes `scope`, so every card a formatter had
reached died on the first command of the protocol: **135 of 1 811** on the consuming
repository, each one unstartable until somebody rewrote the header by hand.

The data was repaired there, and the formatter excluded from its record directory. Neither
is durable: the codec is what has to hold the shape, or the next repository, editor or
agent reopens it.

## Acceptance criteria

- [x] A flow sequence spread over several lines reads as the list it is, for a declared list key
- [x] Nesting inside one — `[[a], [b]]`, `[{id: a}]` — is still refused rather than flattened
- [x] The refusal names the repair for the shape it found, not for nesting that is not there
- [x] `doctor` reports a record whose header holds a key no write can touch, on any kind

## Decisions

- 2026-08-27 12:35Z fube-v2-3a — Codec: `readFlowSequence` joins a key's continuation lines and parses the result through the same `splitListItems`/`unquote` path the single-line form already used, so the two readings cannot drift. Gated on `listKeys`, deliberately: `[a, b]` is the only shape this codec writes and it writes it only for those keys, so those are the only values a re-wrap can reach — reading an array out of any other key would hand `serializeValue` a list it has no list rule for and write `a,b` over the author's structure. Brackets inside a quoted item are text; `opensCollection` tracks quoting the way `splitListItems` does.

Refusal: `opaqueRepairHint` picks the repair from the value rather than answering "nested structure" to everything.

Doctor: every normalizer carries `frontmatterOpaque` onto the record and `runDoctor` emits one `frontmatter-opaque` warning per record — one rule, one message, all five kinds, beside the duplicate-identity check that is there for the same reason. A warning, not an error: the record reads, lists and searches perfectly, and erroring would take a pipeline down over files that are fine until somebody edits them.

Also: `src/core/frontmatter.ts` went from 25 strict-null errors to 0. `FrontmatterEntry` names the shape `scanEntries` builds, so `entries`, `edits` and `appended` stop inferring `never[]` and every downstream `entry.style`/`entry.value` types. Baseline re-recorded: 466 across 55 files.

## Verification

- 2026-08-27 12:35Z fube-v2-3a — A/B on the real bytes, not a fixture: T-0024 as it stood in the consuming repository before commit 108f30fde9 repaired it, dropped into a throwaway workspace and claimed with each build. Published 0.8.0 → RECORD_FRONTMATTER_OPAQUE, the exact reported failure. This build → claim succeeds, status doing, all 3 scope entries read, header written back as `scope: [a, b]` on one line.

`pnpm check` green end to end: build, plugin, strict held at 466, 451 + 7 tests — including the corpus test that re-renders every record in this repository byte for byte, so no existing header started parsing as something else.

No regression on scale: `doctor` over the consuming repository's 1 811 records reports rule-for-rule what published 0.8.0 reports (1251 missing-axis, 638 doc-broken-local-link, 158 done-unchecked, …) and no `frontmatter-opaque` — that repository's 135 were repaired in August, so the check finds nothing to say, which is the right answer and proves it does not fire on healthy records.

Still `review`, not `done`: nothing is published, and the consuming repository is on 0.8.0 from npm.

## Activity

- 2026-08-27 12:35Z fube-v2-3a · backlog → review
- 2026-08-27 12:37Z fube-v2-3a · renumbered from T-0215
