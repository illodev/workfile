---
id: T-0092
title: A malformed --updated-since returns an empty set instead of an error
status: done
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/docs]
---
A filter given a value it cannot parse has two honest answers: refuse, or ignore
the filter. It gave neither.

Measured before the change, all exiting 0:

| command | result |
|---|---|
| `card list --updated-since 2026-07-01` | `total: 84` |
| `card list --updated-since 2026-7-1` | `total: 0` |
| `card list --updated-since "last week"` | `total: 0` |
| `card list --limit abc` | `total: 3`, **0 records** |
| `card list --offset abc` | `total: 3`, **0 records** |
| `project_card_list {updatedSince:"2026-7-1"}` | `total: 0` |

`--limit abc` is the worse half and was not in the original report: `Number("abc")`
is `NaN`, `slice(NaN, NaN)` is empty, and the response says three records exist
and returns none. An agent reads either shape as "nothing here", which is the
one answer a broken filter must never give — a wrong result that looks valid is
worse than an error, because nothing downstream can tell.

## What shipped

`src/core/inputs.ts`, shared by the CLI and the MCP tools so the two surfaces
cannot disagree about what a date is.

- `dateBoundary` takes `YYYY-MM-DD`, or an RFC 3339 timestamp read as its date.
  Anything else is refused, naming the format and the value it got.
- `wholeNumber` matches the text before converting, because `Number("")` is 0
  and `Number(" 3 ")` is 3 — exactly the leniency that lets a typo through.
  Bounds are checked too, so `--limit -5` is refused rather than paging to
  nothing.

Wired at every site that used to coerce: `--updated-since`, `--limit`,
`--offset`, `--max-issues`, `--older-than`, `--occurrences`, `--port`, and
`updatedSince` on `project_card_list` — whose input schema said only
`{ type: "string" }`, so a client got no signal at all until the call came back
empty. It now carries the format in its description and a pattern.

## The same-day boundary

Records store `updated` as a plain date. Compared as strings,
`"2026-08-01" < "2026-08-01T10:00:00Z"` is true, so passing a timestamp silently
dropped everything changed that day — the boundary a caller is most likely to
hit. Truncating to the date fixes it, and a test covers it.

## Found while doing this

The heartbeat is wired for three tools while its code claims to cover all of
them, so `doctor` reported this session's own claim as abandoned mid-work.
Filed as [[T-0093]], not fixed here.

## Acceptance criteria

- [x] A malformed `--updated-since` is refused on the CLI, with the format named
- [x] The same value is refused over MCP, with `MCP_ARGUMENT_INVALID`
- [x] The MCP input schema states the format
- [x] A malformed `--limit` or `--offset` is refused instead of returning an empty page
- [x] A negative `--limit` is refused
- [x] An RFC 3339 timestamp is accepted and does not exclude the day it names
- [x] A well-formed value behaves exactly as it did
- [x] The tests fail on the code as it was
- [x] Both docs state the accepted format

## Activity

- 2026-08-01 20:09Z illodev@local#e55eab30 · doing → review
- 2026-08-01 20:13Z illodev@local#e55eab30 · review → done

