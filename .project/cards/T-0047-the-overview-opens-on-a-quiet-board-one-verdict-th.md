---
id: T-0047
title: "The Overview opens on a quiet board: one verdict, three proofs and the trail"
status: review
type: feature
priority: high
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/components/domain/Overview.tsx, packages/workfile/ui/src/main.tsx, packages/workfile/ui/src/types.ts, packages/workfile/ui/src/query.ts, packages/workfile/ui/src/components/CommandPalette.tsx, scripts/screenshots.ts]
---
## Activity

- 2026-07-31 17:34Z claude-opus-7c645bf5 · claimed
- 2026-07-31 17:53Z claude-opus-7c645bf5 · doing → review

## Notes

- 2026-07-31 17:35Z claude-opus-7c645bf5 — Design settled ahead of implementation, from three competing proposals judged against the board as it actually stands. Nine views describe the workspace and none states it; the Overview is the tenth and answers in a sentence what the Explorer table makes you read forty-six rows to learn.

The design commits to the quiet board, because the quiet board is the board this repository has: 44 of 46 closed, nothing claimed, no session live, doctor silent, 0.1.7 published. The honest headline is "Nothing is in flight", and the page is built so that reads as content rather than as a dashboard with its data missing. Three tempting blocks die for exactly that reason. A status composition bar renders one segment at 95.7% beside a 4.3% tail and says less than the legend beneath it, and Flow already draws the board by status. A standing claims panel stands permanently empty beside a verdict line already reporting the floor is clear. A fourteen-day close strip draws a time series from two calendar days - 116 events on 30 Jul, 36 on 31 Jul, twelve empty buckets - and implies a history the records do not hold; there is also no charting library in the tree and this does not earn one.

Five blocks survive. (1) A verdict sentence chosen by a strict ladder - doctor errors, stale or orphaned claims, scope conflicts, blocked cards, work in flight, public fragments waiting, all clear - so bad news can never sit below a number, and so the cut panels return as clauses that preempt the sentence the moment they have something to say. Only the offending noun is a link, and the clean sentence carries none. (2) Three tiles in the Health idiom - OPEN, ISSUES, RELEASE - each a button routing to triage, health and history, each with a hint that differs at zero. A fourth tile was cut: at four all-zero tiles the row stops reading as proof and starts reading as missing data. (3) WHAT IS LEFT lists the entire remaining backlog, because at two cards the backlog is the status. (4) THE TRAIL, the block that earns the view its place. (5) A corpus footer.

The trail numbers were verified against the records rather than taken from the proposal: 152 events parse out of the Activity sections of 44 cards, five actors, and collapsing by (actor, minute) takes them to 85 moves - 63 on 30 Jul, 22 on 31 Jul. The 31 Jul 14:53Z burst becomes one row covering T-0041 T-0042 T-0043 rather than six. The two cards with no Activity section are exactly the two open ones, T-0037 and T-0044, so both carry a "never claimed" marker that nothing in the app shows today. The parser must scope to the "## Activity" heading and require the " · " separator: "## Notes" lines share the date-and-actor prefix but use an em dash, and would otherwise swallow multi-line prose.

No new endpoint, no new client method, no charting dependency: every number reads an api method the app already calls. The view is read-only by decision, not omission. A Claim button cannot be built honestly here - api exposes no claim method, the browser has no actor identity so it would stamp a placeholder into a trail whose ids are all stable session ids, there is no HTTP release route, and both open cards carry an empty scope, so a UI claim would take a lock over zero paths and skip the very overlap warning that is this product's claim about parallel agents. The row offers the CLI on hover instead.

One trap found while verifying: the render ladder at main.tsx:1362 ends in a bare else that renders HealthView, so a view registered in the nav but missing from the ladder renders Health under the Overview heading with no compile error and no runtime error. Four enumerations must carry "overview" together - the View union in types.ts, VIEWS at query.ts:10, VIEWS at CommandPalette.tsx:57 and VIEWS at scripts/screenshots.ts:23 - plus the lazy loaders map, VIEW_MODULE, VIEW_TITLE, VIEW_COLLECTION, navCounts, the viewMeta switch and its dependency array, and the isWorkView deny-list at main.tsx:718.

Deferred deliberately, not dropped: making Overview the landing view. query.ts:30 and :67 must move together or read and write disagree, Explorer must be demoted from its eager import, test/schema-parity.test.ts hardcodes a query assertion, and three bare demo links in site/index.html would silently change meaning from "the table" to "the dashboard". Ship at ?view=overview, live with it for a release, then decide.
- 2026-07-31 17:51Z claude-opus-7c645bf5 — Implemented and verified against the served UI at 127.0.0.1:4788, not from the suite alone. The default port was already held by another workspace serving 1649 cards, so the smoke ran on a second port rather than against somebody else's board - worth knowing before reading any screenshot taken here.

Runtime evidence, light and dark at 1280x900: the meta line reads "3 open of 47 · 0 errors · 0 warnings"; the breadcrumb reads ".project / overview" with no repeated tail; the sidebar entry carries no badge; the three tiles read 3 open, 0 issues and 0.1.7 latest and route to Triage, Health and History; WHAT IS LEFT lists all three open cards and marks T-0037 and T-0044 "never claimed" while T-0047, which now has an Activity section, is not marked; THE TRAIL renders six rows and the 14:53Z burst is one row covering T-0041 T-0042 T-0043.

The verdict ladder was exercised at two rungs rather than described. On the clean board it selected rung 5 by itself - "1 card is in flight: T-0047 is doing" - because this very card was claimed, which is the honest reading. Seeding a duplicate card id then moved it to rung 1, "The doctor is failing: 2 errors must clear before a release can be cut", tinted with sev-error and linking to Health; the seed was removed and the doctor is back to 0 errors, 0 warnings.

Three defects the suite could not have caught, all found by looking at the rendered page:

The release tile announced 0.1.5 as latest. Sorting releases by date alone is not enough here because 0.1.5, 0.1.6 and 0.1.7 all carry 2026-07-31 - the same trap T-0024 fixed in the CHANGELOG renderer, arriving from a different direction. Now tie-broken by id descending.

The trail header claimed "102 events" while the corpus holds 153. The count was being taken after the fold that drops a redundant `released`, so the header described the render rather than the records. It now counts parsed events and reports moves separately: "153 events · 6 actors · 92 moves since 30 Jul".

The expander read "back to 31 Jul" over a tail that runs to 30 Jul, because it named the next hidden row instead of the oldest one.

Two smaller corrections: cards inside a collapsed row are sorted, since the server's ordering put the three-card burst on screen backwards; and that column is fixed at 186px so a burst cannot push its own verb out past the single-card rows above it.

pnpm check green: 173 tests plus 7 in search-local, 0 failures, including design-system and tokens, which forbid colour literals and undeclared vars. The Overview chunk is 10.7 kB (3.77 kB gzip), lazy, and the entry-bundle budget test still passes.

Held in review rather than done: the change is not committed, and whether the Overview becomes the landing view is deferred to T-0048.
