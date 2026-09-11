---
id: T-0250
title: "0.13.0: every --json record answer becomes { record }, as the MCP tools answer"
status: doing
type: task
priority: medium
area: core
depends: [T-0246]
source: .project/cards/T-0246-every-json-answer-has-its-own-shape-and-the-caller.md
tags: [breaking, 0.13.0]
raised: reported
created: 2026-09-11
updated: 2026-09-11
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
claimed_by: "illodev@local#597ecdc9"
claimed_at: "2026-09-11T19:13:58.579Z"
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/cli.md, packages/workfile/test/cli.test.ts]
---

The owner decided on 2026-09-11 ([[T-0246]]) that the CLI converges on the MCP envelope in 0.13.0. 0.12.x ships the table of shapes in `docs/cli.md`, a stderr line on every **record** answer naming the version and the new shape, and `WORKFILE_JSON_ENVELOPE=1` to opt into the envelope early. This card is the cut itself, and it is a separate card because it is a separate release: a card has to stay closeable against the thing that shipped, and 0.12.x cannot ship a breaking default.

What flips: every row the table marks **record** answers `{ record, …extras }` by default — `show`, `create`, `patch`, `transition`, `release`, `archive`, `reopen`, `note`, `write` on cards; `create`, `patch`, `write`, `note`, `move` on docs; `add`, `patch`, `release` on changelog; `add`, `patch`, `graduate`, `supersede` on memory. Nothing else moves: listings keep `{ records, total }`, claim keeps `{ record, warnings, verify? }`, reports keep their own shapes.

What goes: the stderr note, and the variable — accepted and ignored for one more minor so a script that set it does not break twice, then refused as unknown.

Who has to be told: the changelog entry is `changed` and says **breaking** in its first line; the release notes name `d["record"]` as the one-line fix; the scratch consumer scripts and Fube's `scripts/` that parse `--json` are the known callers.

## Acceptance criteria

- [x] Every command the `docs/cli.md` table marks **record** answers `{ record }` by default, and the table's Today column is collapsed into one
- [x] The pinned shape test runs against the default and passes with the envelope expected
- [ ] The stderr note is gone; `WORKFILE_JSON_ENVELOPE=1` is accepted and ignored for 0.13.x and the release notes say when it is refused
- [x] The 0.13.0 changelog entry opens with the word breaking and names the one-line fix for a caller
- [x] Fube's scripts that parse `--json` are found by grep and updated, or the note on this card says which ones were left and why

## Notes

- 2026-09-11 18:47Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Order, recorded on 2026-09-11 after T-0227, T-0208 and T-0209 closed: this card must not start before a 0.12.x release ships what T-0246 promised for 0.12.x (the shape table, the stderr note, the WORKFILE_JSON_ENVELOPE opt-in) together with the additive work now on main — otherwise the 0.12.x half of the decision never reaches a consumer and the four cards in review (T-0246, T-0247, T-0249, T-0214) have no published package to close against. Cutting that release is the owner's call; the flip is the release after it.
- 2026-09-11 19:22Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Fube's scripts, grepped on 2026-09-11: eighteen '--json' mentions under scripts/, seventeen of them the scripts' own output flags; the one Workfile parser is scripts/workfile-criterion-digest.mjs, which reads 'card show --json'. Updated in place to read both shapes (answer.record ?? answer) so it works on 0.12.x and 0.13.x alike; left uncommitted in the Fube checkout for the owner to commit with Fube's own workflow. The bench scripts/workfile-guard-cases.mjs drives the hook, not --json.

## Activity

- 2026-09-11 19:13Z illodev@local#597ecdc9 via:undeclared/xhigh · claimed
