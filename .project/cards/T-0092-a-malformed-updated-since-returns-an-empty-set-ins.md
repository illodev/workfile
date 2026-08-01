---
id: T-0092
title: A malformed --updated-since returns an empty set instead of an error
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
---
`--updated-since` compares dates as raw strings, with no validation, at two
call sites: `bin/workfile.ts:558` and `src/modules/mcp/tools.ts:160`.

Measured today:

| value | result |
|---|---|
| `2026-07-01` | `"total": 84` |
| `2026-7-1` | `"total": 0` |
| `last week` | `"total": 0` |
| `garbage` | `"total": 0` |

Exit 0 every time, no error. MCP behaves identically, and `tools.ts:359`
declares `updatedSince: { type: "string" }`, so a client gets no signal at all.
`docs/cli.md:117` documents it only as `[--updated-since DATE]`.

A filter that returns an empty set for a malformed input is the worst failure
shape for an agent, which reads `total: 0` as "nothing changed" and moves on.

## The fix

Reject anything that is not `YYYY-MM-DD` with `CLI_OPTION_INVALID` naming the
expected format. Optionally accept an RFC 3339 timestamp by truncating to its
first ten characters, since a same-day boundary currently mis-sorts against the
shorter stored value. State the format in `docs/cli.md:117` and `docs/mcp.md:20`,
and tighten the MCP input schema.

Do **not** ship `card stale` or a `card-stale-in-progress` doctor rule, which is
what the originating item proposed: `card reap` already covers the lease, and
`doing` cannot exist without a claim (`validation.ts:172`).

## Acceptance criteria

- [ ] A malformed `--updated-since` is refused, on the CLI and over MCP
- [ ] The MCP input schema states the format
- [ ] A well-formed date behaves exactly as it does today
- [ ] The format is documented in both places
