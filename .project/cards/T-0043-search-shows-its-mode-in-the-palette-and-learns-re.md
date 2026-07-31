---
id: T-0043
title: Search shows its mode in the palette and learns regex
status: done
type: feature
priority: high
area: search
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/src/modules/search, packages/workfile/src/server, packages/workfile/ui/src/components/CommandPalette.tsx, packages/workfile/ui/src/query.ts, packages/workfile/ui/src/api.demo.ts, packages/workfile/test, packages/workfile/docs]
---
## Intent

Two search wishes that share a wire. The core already computes `mode: "lexical" | "hybrid"` and the provider — the UI just never showed it, so semantic search is indistinguishable from lexical (the exact trap `changelog preview` set for releases: green that teaches nothing). The palette gains a muted Badge naming the mode ("hybrid · <provider>", "lexical", "regex") with a one-line Tooltip.

Regex arrives as a third mode: a full `/pattern/flags` query (flags ⊆ imsu, pattern ≤ 256 chars) compiles safely — `SEARCH_REGEX_INVALID` on bad patterns — and scans id, title and body (first 20k chars), ranking title hits first, then match count. The provider is bypassed on purpose: regex is exact-intent. Plain queries containing slashes do not trigger it.

Parity: the demo's local search returns the same envelope and answers regex, so the hosted replay behaves identically; the Explorer's client-side filter gains the same `/.../` form, falling back silently on half-typed patterns.

## Acceptance

- /api/v2/search responses carry `mode` and `provider`; palette displays them.
- `/error/i` finds records; `/(` yields a clear error server-side and never throws in the Explorer filter.
- test/search.test.ts covers detection, invalid pattern, ranking, caps and the mode field on all three paths; demo-parity stays green.
- cli.md query grammar and http-api.md document the form.

Wishes: semantic visibility (4), regex (5).

## Notes

- 2026-07-31 14:53Z claude-fable-4df73848 — Implemented across core, server, palette, demo and the Explorer filter; verified at runtime against the served UI and by direct execution of the demo adapter.

Core: /pattern/flags (flags within imsu, pattern <= 256 chars, body scanned to 20k chars) short-circuits into regex mode - title hits outrank body-only, provider bypassed by design; invalid patterns raise SEARCH_REGEX_INVALID. The response envelope now always carries mode and provider on all three paths, and the /api/v2/search handler passes them through (confirmed on the wire: mode lexical, provider null for a plain query). Six new tests in search.test.ts; docs updated (cli.md query grammar, http-api.md).

Palette: mode badge next to the result count - "lexical" observed live for a plain query, "regex" with the "Regular expression - /pattern/flags" hint row and 52 hits for /T-00\d+/i; hybrid renders "hybrid . provider-id" (test-covered; this workspace declares no provider, so it cannot be photographed here). Demo adapter answers the same envelope and regex form (runtime-probed: mode regex; invalid pattern rejects with the compile message); the Explorer filter survived 11 hostile probes including half-typed and over-long patterns without throwing.

Discovered en route and fixed under this claim's scope: src/server/http.ts carried a raw NUL byte inside a hash-separator string literal, making the file read as binary to grep and file(1); normalized to the backslash-u0000 escape, server tests green. Accepted risks, recorded: catastrophic-backtracking patterns run unguarded on both sides (local tool, user's own query); demo regex ordering is close to but not byte-identical with the server's tie-break.

## Activity

- 2026-07-31 14:53Z claude-fable-4df73848 · doing → done
- 2026-07-31 14:53Z claude-fable-4df73848 · released

