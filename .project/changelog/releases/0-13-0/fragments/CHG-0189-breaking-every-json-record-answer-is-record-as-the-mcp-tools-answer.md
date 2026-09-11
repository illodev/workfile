---
id: CHG-0189
title: "Breaking: every --json record answer is { record }, as the MCP tools answer"
type: changed
area: core
visibility: public
cards: [T-0250]
tags: [breaking]
created: 2026-09-11
updated: 2026-09-11
---

**Breaking.** Every command the shape table in `docs/cli.md` marked *record* now answers `{ "record": … }` by default — `show`, `create`, `patch`, `transition`, `release`, `archive`, `reopen`, `note` and `write` on cards; `create`, `patch`, `write`, `note` and `move` on docs; `add`, `patch` and `release` on the changelog; `add`, `patch`, `graduate` and `supersede` on memory — with named extras beside the record (`ignored` on `card write`) exactly as `card claim` and every MCP tool already did. The one-line fix for a caller that read the record at the top level is `.record` (`d["record"]` in Python). Nothing else moves: listings keep `{ records, total }` and reports keep their own shapes. `--fields a,b` still cuts the record down, inside the envelope.

The stderr note 0.12.x printed on every record answer is gone. `WORKFILE_JSON_ENVELOPE=1`, the 0.12.x opt-in, is accepted and ignored throughout 0.13.x so a script that set it does not break twice; 0.14.0 refuses it as unknown.
