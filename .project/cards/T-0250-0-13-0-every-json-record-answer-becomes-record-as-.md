---
id: T-0250
title: "0.13.0: every --json record answer becomes { record }, as the MCP tools answer"
status: backlog
type: task
priority: medium
area: core
depends: [T-0246]
source: .project/cards/T-0246-every-json-answer-has-its-own-shape-and-the-caller.md
tags: [breaking, 0.13.0]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

The owner decided on 2026-09-11 ([[T-0246]]) that the CLI converges on the MCP envelope in 0.13.0. 0.12.x ships the table of shapes in `docs/cli.md`, a stderr line on every **record** answer naming the version and the new shape, and `WORKFILE_JSON_ENVELOPE=1` to opt into the envelope early. This card is the cut itself, and it is a separate card because it is a separate release: a card has to stay closeable against the thing that shipped, and 0.12.x cannot ship a breaking default.

What flips: every row the table marks **record** answers `{ record, …extras }` by default — `show`, `create`, `patch`, `transition`, `release`, `archive`, `reopen`, `note`, `write` on cards; `create`, `patch`, `write`, `note`, `move` on docs; `add`, `patch`, `release` on changelog; `add`, `patch`, `graduate`, `supersede` on memory. Nothing else moves: listings keep `{ records, total }`, claim keeps `{ record, warnings, verify? }`, reports keep their own shapes.

What goes: the stderr note, and the variable — accepted and ignored for one more minor so a script that set it does not break twice, then refused as unknown.

Who has to be told: the changelog entry is `changed` and says **breaking** in its first line; the release notes name `d["record"]` as the one-line fix; the scratch consumer scripts and Fube's `scripts/` that parse `--json` are the known callers.

## Acceptance criteria

- [ ] Every command the `docs/cli.md` table marks **record** answers `{ record }` by default, and the table's Today column is collapsed into one
- [ ] The pinned shape test runs against the default and passes with the envelope expected
- [ ] The stderr note is gone; `WORKFILE_JSON_ENVELOPE=1` is accepted and ignored for 0.13.x and the release notes say when it is refused
- [ ] The 0.13.0 changelog entry opens with the word breaking and names the one-line fix for a caller
- [ ] Fube's scripts that parse `--json` are found by grep and updated, or the note on this card says which ones were left and why
