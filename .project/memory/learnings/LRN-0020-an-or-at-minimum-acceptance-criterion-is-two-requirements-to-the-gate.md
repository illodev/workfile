---
id: LRN-0020
title: An 'or at minimum' acceptance criterion is two requirements to the gate
status: active
created: 2026-08-05
updated: 2026-08-05
tags: [acceptance]
---
T-0027 listed its two criteria as a choice:

```
- [ ] A record beyond the cap that answers the query semantically can be returned
- [ ] Or at minimum: the truncation is visible in the search result metadata
```

The second was the fallback if the first proved impossible. The first was
achieved, so the fallback was never built — and nothing in the format carries
that. `card ac` counts checkboxes; the gate counts unchecked ones. To every
reader after the author, the card had two requirements and met one.

It sat that way for five days without being noticed, because a second defect
was hiding it: the acceptance reader did not know the heading `## Acceptance`,
so the card parsed as declaring no criteria at all (see [[T-0167]]). Widening
the reader is what surfaced this one.

**Write the alternative into the criterion that survives, not as a second
box.** `A record beyond the cap can be returned — or, failing that, the
truncation is visible in the result metadata` is one requirement with two
acceptable proofs, and it is checkable. Two boxes are two requirements, whatever
the prose between them says.

The same applies to any criterion joined by *or*, *at minimum*, *ideally*, or
*nice to have*. The gate reads none of those words.
