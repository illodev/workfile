---
id: T-0042
title: "Shell chrome: doctor and SSE chips join the ledger; the tagline leaves"
status: done
type: chore
priority: medium
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/main.tsx]
---
## Intent

Two chrome wishes. The sidebar footer tagline "Markdown is the source. No database." leaves — the path line stays. The doctor chip (`doctor 0E · 6W · 2I`, click → Health) and the SSE chip (`sse live` / `polling`) move from the topbar to the bottom ledger strip, right-aligned by `index N records`, keeping their exact behaviour: doctor stays a button with its severity dot, SSE keeps its statusColor/sev-warning dot logic.

## Acceptance

- The tagline string is gone from main.tsx.
- Both chips render in the ledger, none in the topbar; doctor still navigates to Health; dots keep their semantic tones.

Wishes: tagline (2), badges to footer (3).

## Activity

- 2026-07-31 14:53Z claude-fable-4df73848 · doing → done
- 2026-07-31 14:53Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 14:53Z claude-fable-4df73848 — Implemented and runtime-verified in the same main.tsx pass as T-0041. The tagline string is gone from the file; doctor and SSE badges render in the ledger footer after the spacer, left of "index N records", with byte-identical behaviour (doctor still a button into Health with its severity dot; SSE keeps statusColor and sev-warning tones). Topbar now holds only search, inspector toggle, theme and New card. Smoke item 7: both chips present in the footer, tagline absent from the DOM.
