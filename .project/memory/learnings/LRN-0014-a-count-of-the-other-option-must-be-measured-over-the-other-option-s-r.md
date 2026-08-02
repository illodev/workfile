---
id: LRN-0014
title: A count of the other option must be measured over the other option's rows
status: active
created: 2026-08-02
updated: 2026-08-02
related: [T-0121]
---
When a control switches which records a view holds, every number about the
option you are *not* on has to be computed from that option's records — not
from the ones in hand. The component only ever has the current selection's
rows, so it is structurally unable to count the alternative correctly, and the
number it produces looks plausible rather than wrong.

The timeline's plan/actual mode shipped this twice in one screen ([[T-0121]]):

- The empty state offered "show what actually happened · 3 cards" and then drew
  128. `plan` receives open cards, `actual` receives the closed ones too, and
  the offer had counted trails among the three cards `plan` was holding.
- The sidebar badge read 130 while the chart under it read 128 — the badge
  measured the whole corpus and the chart its filtered rows.

Both are the same mistake, and both survived a full green test run, the strict
ratchet and a typecheck: the types are identical because the sets are the same
type. Only the browser said so, and only because the numbers were read side by
side rather than one at a time.

The fix is structural rather than careful arithmetic — the counts moved up to
the caller, the one place holding the rows every option would get, and the
component takes them as a prop it cannot compute. Worth reaching for whenever
a mode, a tab or a filter toggle changes the population under it.

The general shape is the same one [[LRN-0012]] records for guards: a thing that
must be true across several doors, implemented behind one of them. There it was
a rule enforced at one entrance; here it is a population measured at one.
