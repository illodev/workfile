---
id: CHG-0160
title: A trailing strip over an uncapped body no longer backtracks
type: security
area: core
visibility: public
cards: [T-0224]
created: 2026-08-07
updated: 2026-08-07
---

`replace(/\n+$/, "")` in the frontmatter reader ran over a record body, which nothing caps, and retries the anchored quantifier from every start position — O(N²) with no bound but the disk. Replaced by a linear strip, and a test now refuses the shape across the package with an allowlist that has to state the bound making each remaining site safe.
