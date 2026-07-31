---
id: T-0049
title: "The media catches up with the tenth view: the curated corpus grows a trail"
status: review
type: chore
priority: medium
area: docs
created: 2026-07-31
updated: 2026-07-31
scope: [scripts/screenshot-workspace.ts, scripts/demo-video.ts, scripts/screenshots.ts, artifacts, .github/media, site/assets, packages/workfile/ui/src/demo-data.json]
---
## Activity

- 2026-07-31 17:59Z claude-opus-7c645bf5 · claimed
- 2026-07-31 18:14Z claude-opus-7c645bf5 · doing → review

## Notes

- 2026-07-31 18:14Z claude-opus-7c645bf5 — Media regenerated for the tenth view. The order mattered: the corpus had to grow a trail before any picture was worth taking.

The curated workspace wrote every card with a one-line body, which was enough for the nine views that photograph metadata but left the Overview showing its busiest block empty and every open card labelled "never claimed". `screenshot-workspace.ts` now generates an `## Activity` ledger per card - deterministic from the card index so two machines produce the same frame, shaped like real work (a claim precedes the transition it explains, a done card releases afterwards), across four actors. Cards that never left backlog, next or deferred get no lines at all, which is both honest and useful: it puts a real "never claimed" marker in frame instead of a synthetic one on every row. The corpus now yields 96 events over 39 of 68 cards, 29 never claimed, and one deliberate burst - three cards closed by one actor in the same minute - so the collapse-by-minute is visible on camera rather than merely implemented.

That first render exposed a defect in the view itself that this repository could not have shown. The trail read 09:41, 09:32, 09:26, 10:39, 05:15 and looked unsorted; it was correctly ordered across days, but the row printed only the hour, and the hour alone cannot say which day it belongs to. Every event in this workspace's recent history falls on one day, so the bug was invisible here and obvious the moment the corpus spanned three weeks. The row now states the day when it changes and stays quiet when it does not.

Screenshots: 20 instead of 18, both themes, all ten views. Every published still was stale independently of content, because each one photographs a sidebar that no longer matches the app - so explorer, flow, history, timeline and memory-dark were refreshed in .github/media, and flow and history in site/assets, from the newly generated artifacts.

Video: 49s, seven scenes. The tour used to end where it began, on Flow, spending its last shot repeating its first. It now closes on the Overview under "However many agents are working - one line tells you where it stands", with the install call to action landing over the verdict sentence. Poster and thumbnail were regenerated from the new film at their existing sizes (1152x720, 1280x800) plus artifacts/hero-video.png at 1440x1000; all three previously showed a nine-view sidebar.

Demo data rebuilt: 49 cards, 155 trail events, 6 actors, 30 history records. Verified that the hosted demo will resolve 0.1.7 as latest under the (date desc, id desc) rule rather than 0.1.5.

Two things found on the way. `site/assets/flow.png` is referenced nowhere in `site/index.html` - it was refreshed anyway, but it is dead weight and should either be used or dropped. And the README's inline film at line 23 is a GitHub user-attachments URL, not a repository path: it still serves the 43s six-scene cut and cannot be updated from here. Replacing it needs the new mp4 uploaded to GitHub by hand and the link swapped, which is why this card stays in review.

pnpm check green: 173 tests plus 7, 0 failures, demo-parity and design-system included.
- 2026-07-31 18:24Z claude-opus-7c645bf5 — The blocker is cleared from the other side: the README's inline film now points at user-attachments/eb3ae94b-6635-4faa-bd58-33197a6d9abc, replacing the c86847e8 link that still served the 43s six-scene cut. Committed on the remote as ab15de3 and fast-forwarded here; the local Overview gallery edit was stashed across the merge and reapplied, so both changes coexist with no conflict markers and HEAD now matches origin/main.

The uploaded binary itself could not be verified from here - user-attachments answers 403 without a browser session, so the 11491533-byte size of the regenerated film could not be compared against what the link serves. Worth an eyeball on the rendered README rather than an assumption.

What remains before this card is done is only that none of the media is committed: twelve modified binaries across .github/media and site/assets, plus the two new overview.png files, are still sitting in the working tree.

