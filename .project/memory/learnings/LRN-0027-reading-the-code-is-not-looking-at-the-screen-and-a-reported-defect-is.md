---
id: LRN-0027
title: Reading the code is not looking at the screen, and a reported defect is not a proposal
status: active
confidence: high
related: [T-0197, ADR-0018, T-0210]
tags: [ui, process]
created: 2026-08-05
updated: 2026-08-05
---

Two failures in one card, and they compounded.

**A report was retyped as an idea.** The owner listed "en vista history cuando se
pulsa un fragmento salta el drawer de inspector" in a list headed *Bugs y
mejoras*, directly below the docs report that became T-0192 and was fixed the
same day. It was filed as `type: idea`, `priority: low`, on the agent's own
reading — the record is short, the behaviour is current, there is a comment
explaining it. That reclassification is what later licensed an ADR arguing
against fixing it. Nobody had to be argued out of the fix; the label had already
done it.

**Then the design decision was made from source.** `navigation.ts`,
`RecordPanel` and `Inspector` were all read carefully. None of them says what is
on the screen at the same time as what else, which was the entire question.
History had been a two-column view since it was built: the fragment rendered in
the right-hand pane and the drawer opened on top of that pane with the same
fragment in it. Fifteen seconds with the view open would have settled it. Instead
a plausible taxonomy was invented — reference material versus queue — and
shipped as an accepted decision. See ADR-0018 for what replaced it.

The token cost is the sharp end of this. A large parallel investigation had run
over the same code and produced real findings elsewhere, which made the reasoning
feel well-founded. Breadth of reading is not depth of evidence, and for anything
visual it is not evidence at all.

**Why:** an agent's classification of somebody else's report is a claim about
their experience, and it is not the agent's to make. A design decision about a
rendered surface is a claim about what is on screen, and only the screen can
settle it.

**How to apply:**

- A defect reported by a person is a bug until that person says otherwise.
  Downgrading one to an idea or a task needs their agreement first, not a
  paragraph in the card body explaining the reclassification.
- For any card whose symptom is visual, open the view before writing anything
  down — plan, decision or fix — and capture before and after. A screenshot is
  cheaper than the workflow that will otherwise be spent reasoning around it.
- A rule about a rendered surface should be one a reviewer can perform, not one
  they have to be argued into. ADR-0018's test is "open the view and look";
  ADR-0017's was a taxonomy, and the taxonomy is what got it wrong.
