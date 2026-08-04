---
id: T-0151
title: The CLI reference omits a command family, six aliases and three config keys
status: done
type: docs
priority: medium
area: docs
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/docs/cli.md, packages/workfile/docs/SPEC.md, packages/workfile/docs/mcp.md, packages/search-local/README.md, packages/workfile/test/documentation.test.ts]
---

`documentation.test.ts` proves no doc teaches something the binary rejects. It
proves nothing in the other direction, and the other direction has holes.
Everything below was measured against `COMMAND_FLAGS` and `DEFAULT_CONFIG`.

## `docs/cli.md` has no `claude` section

The file is the CLI reference and carries a section per command family:
Workspace, Work, Docs, History, Memory, Agents, CI templates, Legacy
migration, MCP. `workfile claude` has none. The word appears three times in the
whole file, and only one is about the command — a row in the `--force` table
listing `claude install`, `claude sync`. `workfile claude install`, the command
that writes the Claude Code surface into a repository, is documented as a
command only in `docs/mcp.md:43`.

`workfile version` is in the binary's USAGE and appears nowhere in cli.md. It
is the only one of the 17 top-level words that does not.

## Six subcommand aliases are documented nowhere

All six resolve in the dispatcher and none is in USAGE:

| alias | canonical | dispatcher |
|---|---|---|
| `agents status` | `agents check` | bin/workfile.ts:1996 |
| `ci status` | `ci check` | bin/workfile.ts:2045 |
| `changelog create` | `changelog add` | bin/workfile.ts:1683 |
| `memory create` | `memory add` | bin/workfile.ts:1863 |
| `claude sync` | `claude install` | bin/workfile.ts:2076 |
| `mcp stdio` | `mcp serve` | bin/workfile.ts:2210 |

The last two at least appear in cli.md's flag tables. The first four are in no
document at all. Whether an alias deserves documenting is a real question —
but it should be answered once, not by omission six times.

## Three config keys are documented nowhere

Not in any of the seven docs, either README, or
`project.config.example.mjs`:

- `cards.activityTrail` (default `true`)
- `changelog.releasePrefix` (default `"REL"`)
- `mcp.maxMessageBytes` (default `1048576`)

Wider, and worth a decision rather than a patch: 18 of the 60 keys in
`DEFAULT_CONFIG` are never named in SPEC, whose 8.1 is titled "Canonical
file" — including `search.semanticWeight`, `changelog.releaseStrategy`,
`docs.reviewIntervalDays` and every `mcp.*` limit. Either 8.1 stops claiming
to be canonical or something generates the full reference from
`DEFAULT_CONFIG`.

## `packages/search-local/README.md` omits `dtype`

The README's Options block lists 8 of the 9 options
`localSearchIntegration` destructures at `index.js:150`. `dtype` (default
`"q8"`) is missing, though `index.d.ts:13` documents it. One line.

## The fix

Add the reverse-coverage check to `documentation.test.ts`: every key in
`COMMAND_FLAGS` is named somewhere in cli.md, and every leaf in
`DEFAULT_CONFIG` is named in some doc or in the example config. Both tables are
already read by `dispatchTable()`; this reuses it.

The check will fail on the aliases until the alias question is answered, so
answer it first: either document all six in USAGE and cli.md, or make the test
resolve an alias to its canonical spelling and require only that. Do not add an
allowlist of exceptions — that is how the forward check would have rotted too.

## Acceptance criteria

- [x] cli.md documents the `claude` family and `workfile version`
- [x] The six aliases are either documented or deliberately resolved by the test
- [x] The three orphan config keys are documented
- [x] The SPEC 8.1 "canonical" claim is either made true or withdrawn
- [x] `dtype` is in the search-local Options block
- [x] A reverse-coverage check fails on today's gaps and passes after
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 19:32Z illodev@local#cfe281b4 · claimed
- 2026-08-04 19:38Z illodev@local#cfe281b4 · doing → review
- 2026-08-04 20:32Z illodev@local#cfe281b4 · review → done

## Notes

- 2026-08-04 19:38Z illodev@local#cfe281b4 — Done locally. cli.md gains a Claude Code section and workfile version; an Accepted spellings table names all nine aliases, the six subcommand ones and the three command words (docs, history, serve) that were equally undocumented. Two new checks: cli.md names every one of the 62 subcommands in COMMAND_FLAGS, and every leaf in DEFAULT_CONFIG is named in some doc or the example config. Stashing cli.md reproduces exactly the five gaps; stashing SPEC.md and mcp.md reproduces exactly the three orphan keys. 13 checks in documentation.test.ts, suite 275/275, pnpm run check exit 0, ratchet 554/56 none new, doctor 0/0.

Criterion 4 was written on a misreading of my own. SPEC 8.1 is titled 'Canonical file' and its sentence is 'the canonical configuration file is project.config.mjs at the workspace root' — canonical describes the file's role, not the completeness of the example under it. There was no false claim to withdraw. The real gap behind that criterion is that no single complete configuration reference exists anywhere; the new membership check closes the part that bites (a key added to the schema and to nothing else) without inventing a sixty-row table that would rot in its descriptions. A consolidated reference generated from DEFAULT_CONFIG is a reasonable next step and is Alvaro's call, not mine.

Two defects found while writing this, neither in the card. SPEC 13.4 showed a release record as id: REL-2026-07-28; real ids are sequential (REL-0017 is 0.5.4) and the prefix is changelog.releasePrefix. Fixed here because it is the same sentence that documents the key. SPEC 11.2's card example omitted the ## Activity section every real card carries, so the trail was undocumented in the file format that defines it — added, with what appends to it and when. The third, mcp.md claiming .mcp.json registers workfile-mcp, is outside this scope and opened as T-0153.

The claim was extended mid-card to mcp.md, with --force against my own claim, to host mcp.maxMessageBytes next to maxToolResultBytes where a reader looking for limits will find it.

Not verified on Windows. Stays in review until CI is green. Uncommitted.
- 2026-08-04 20:29Z illodev@local#cfe281b4 — CI green on all eight matrix jobs at 86be3c0 (PR #14, run 30947778231): ubuntu, macos and windows on node 22 and 24, plus smoke, codeql and doctor. Windows 22 in 1m59s, Windows 24 in 3m42s. That closes the platform gap every note above flagged — the checks resolve paths through new URL against a document base, and Windows checkouts are where that has broken before.

Staying in review rather than done: the protocol reads review as 'awaiting verification, deployment or approval', and this is awaiting approval. The runtime evidence exists; the merge does not.
