---
id: T-0084
title: Acceptance criteria become addressable, and done stops being a vibe
status: review
type: feature
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/cards, packages/workfile/bin/workfile.ts, packages/workfile/test]
---

"`done` requires runtime evidence" is the strongest rule in the protocol and it is enforced by the weakest mechanism in the codebase: `uncheckedAcceptanceCount` counts `- [ ]` lines under a `## Acceptance criteria` heading and produces one generic warning. An agent cannot enumerate what is still unproven, a reviewer cannot see which criterion failed, and nothing stops a card moving to `done` with every box empty.

## What ships

- A parser producing `{index, text, checked}` from the section that already exists.
- `card ac ID` lists them; `--check N` and `--uncheck N` are repeatable and mixable, addressed by index, under the usual lock and revision check.
- `card show --json` exposes `acceptance`, so an agent can ask what is left.
- `transition done` refuses while criteria are unchecked, naming them, with `--force` to override.
- The doctor rule names the unproven indices instead of counting them.

## Two design calls

**No marker protocol.** The landscape study treats machine-owned body regions (`<!-- SECTION:AC:BEGIN -->`) as a prerequisite. They are not: the `## Acceptance criteria` heading already delimits the region and the existing parser proves it. A marker protocol is a second, larger change that would touch every card ever written.

**Positional indices, not `- [ ] #1` written into the text.** Explicit numbers are stable across insertions but drift from position, need renumbering, and turn every existing card into a migration. Positional indices are safe here because `card ac` takes `--expected-revision` like every other mutation: a concurrent reorder is rejected rather than silently mis-addressed.

## Activity

- 2026-08-01 17:46Z illodev@local#e55eab30 · claimed
- 2026-08-01 17:46Z illodev@local#e55eab30 · claimed
- 2026-08-01 17:49Z illodev@local#e55eab30 · doing → done
- 2026-08-01 17:49Z illodev@local#e55eab30 · done → review
- 2026-08-01 17:49Z illodev@local#e55eab30 · review → done
- 2026-08-01 17:49Z illodev@local#e55eab30 · claimed
- 2026-08-01 17:52Z illodev@local#e55eab30 · doing → review

## Acceptance criteria

- [x] `card ac ID` lists criteria with 1-based indices and a met count
- [x] `--check` and `--uncheck` are repeatable, accept comma lists, and mix
- [x] An unknown index is refused, not silently dropped
- [x] `card show --json` carries the reading when the section exists
- [x] `transition done` refuses while criteria are unproven, and names them
- [x] `--force` still gets through, because some criteria do not survive contact
- [x] The doctor names the unproven criteria instead of counting them

## Notes

- 2026-08-01 17:52Z illodev@local#e55eab30 — Shipped. `pnpm run check` green at 193 + 7 tests, strict ratchet 599 across 59 files (down from 601: typing the doctor's details bag retired two it had been carrying). All seven criteria above were checked through `card ac` itself.
