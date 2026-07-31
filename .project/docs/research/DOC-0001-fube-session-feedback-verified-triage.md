---
id: DOC-0001
title: "Fube session feedback: verified triage"
kind: research
status: current
tags: [fube-feedback, agent-experience, cli]
created: 2026-07-31
updated: 2026-07-31
---

An agent ran a long session against a 1,630-card Workfile repository (Fube) and
reported back. Every claim below was re-checked against the source and by running
the CLI against a throwaway workspace. This document is the evidence; the cards it
is the `source` of carry the work.

## What the agent got right about its own mistakes

Two complaints were withdrawn before delivery, and both withdrawals are correct.

`CARD_TITLE_TOO_LONG` is loud: exit 1, in text and in JSON
(`packages/workfile/src/modules/cards/validation.ts:97`). The agent had piped
stderr to `/dev/null` in its own script and lost the message. `doctor` filters do
exist — `--severity`, `--max-issues`, `--fix`
(`packages/workfile/bin/workfile.ts:198`).

Both were features that already existed and that no surface taught. That is the
pattern, and it is the most valuable thing in the report.

## What works, unprompted

The `review` / `done` split with "done needs runtime evidence" is what the agent
said changed its behavior most: it left six cards in `review` with green tests,
clean phpstan and `tsc` at zero, because it had not opened the ZIP by hand nor
seen the screen in a browser. Hybrid `search` scoring surfaced a card sharing no
words with the query. `card note` was used ~18 times. `exists:` on the card graph
in `card show --json` removed a manual check. The start-up hook showing another
session's claim and its scope prevented a real collision on `limit-period.ts`.

## Verified defects

### `card create` drops `--parent` in silence

`--parent` is registered in `COMMAND_FLAGS.card` (`bin/workfile.ts:212`) but the
`create` branch never reads it; only the `list` filter does (`:464`). Reproduced:

```
$ workfile card create --title "Child with parent flag" --parent T-0001
T-0002 T-0002-child-with-parent-flag.md   # exit 0, no parent: in the frontmatter
```

This contradicts the stated rule directly above the validator: unknown flags are
refused rather than ignored, "which is worse than failing because the caller
believes the filter was applied."

### `--severity` filters the list but not the summary

`bin/workfile.ts:1589` prints the filtered issues, but `:1587` reads
`report.counts` unfiltered and `:1600` iterates `report.issues` unfiltered to
build the "By rule" block. Under `--severity error` the agent still got
"0 errors, 688 warnings" and the full per-rule warning breakdown. The `--json`
branch has the same split: filtered `issues`, unfiltered `counts`.

### Retitling leaves the filename behind

Reproduced: patching the title of `T-0001-parent-card.md` to "Completely
different title now" leaves the filename untouched, and `doctor` reports nothing.
`renumber` exists for IDs; there is no equivalent for titles, and no rule that
notices the drift.

### Enum errors know the valid values and hide them

`validation.ts:110` attaches `allowed` to the card enum error details, and
`--json` prints it. The text renderer drops it, so `Invalid area: treasury` sends
the reader to `project.config.mjs` to find out what would have worked. The
document enums are worse: `DOC_KIND_INVALID` and `DOC_STATUS_INVALID`
(`src/modules/docs/docs.ts:316-327`) never attach `allowed` at all, so even the
JSON caller is left guessing. Writing this document hit that error live.

## Verified gaps

### Every surface teaches the worst way to create a card

`card create` reads `--json-input FILE`, and `createCard`
(`src/modules/cards/mutations.ts:272-293`) accepts `parent`, `source`, `tags`,
`scope`, `depends`, `milestone`, `effort`, `related`, `start`, `due` and `body`.
One call does the whole job, with accents, backticks and `$` in the body intact.
`--body`, `--tags` and `--scope` also work as plain flags.

`--json-input` on `card create` appears exactly once in the whole documentation
corpus: `packages/workfile/docs/SPEC.md:1345`. Not in `card --help`, not in
`docs/cli.md:88`, not in the README. All of them show the four-flag form. The
agent's three-call workaround — `create`, then `patch --json-input`, then
`write --body-file` — plus heredoc quoting bugs, was the only path the project
ever showed it.

### `next` is not in the CLI

`workfile next` exits 2 and prints the usage banner. `project_next` exists only
over MCP, alongside the `/next` slash command. The protocol's "Essential commands"
does not mention it either. An agent working through the CLI has no way to find
it, which is why a whole long session went by without it.

### `doctor` has no baseline

No baseline concept anywhere in the source. The agent worked around it by writing
down 640/44/3 at session start and using the triple as a fingerprint. It caught a
genuinely new `ci-template-stale` after the 0.1.9 adapter bump, but by luck, among
688 lines. A "new since last run" mode is what turns `doctor` from advice into a
gate.

### The protocol never says where durable knowledge goes

`.project/agents/workflows/record-knowledge.md` chooses between memory
*collections*, but never between a memory record, a card note and a doc. All
three fit "I learned this and it must not be lost", so the agent used whichever
was already open — card notes — and touched none of the 21 memory records.

### `area` conflates delivery layer and domain

There is no `bc` field. `cards.areas` is project-configurable, so Fube could
declare its 15 bounded contexts as areas today, but it would then lose the layer
axis. With `api` swallowing Treasury, Verifactu, Billing, IAM and Subscription,
the agent filed fiscal models under `fiscal` and treasury under `api` and called
the result incoherent.

## The structural reading

Three of the report's complaints were about things that already existed. That is
not the reporter being careless — it is the surface being larger than its
discoverability. `--help` lists syntax but never names the recommended path, and
error messages hold the information the caller needs and print only part of it.
The fix is not more documentation; it is that failing should stop being the way
you learn what the tool can do.
