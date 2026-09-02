---
id: T-0232
title: The doc link checker cuts the destination at the first parenthesis
status: backlog
type: bug
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-02
---

The doc link extractor cuts the destination at the first `)`, so any link into a path that contains
parentheses is validated against a truncated target — silently.

```js
// modules/docs/validation.js:45 (0.9.1)
const LINK = /\[[^\]\n]{0,512}\]\(([^)\n]{1,1024})\)/g;
```

Run that regex over `[x](../a/(private)/b.tsx)` and the captured target is `../a/(private`. The
checker then either reports a path nobody wrote or drops the link as unverifiable. Either way the
broken link stays broken and `doctor` is green.

**And the angle-bracket form markdown defines for exactly this does not help**: `[x](<…/(portal)/…>)`
truncates the same way, because the regex does not know about `<…>`. Eight links in the fube-v2 repo
are written that way by someone who tried it.

## Why it is not a corner case

Next.js App Router route groups are parenthesised directories — `(private)`, `(portal)`, `(app)`,
`(flows)` — and that is how half of a Next application is laid out. Measured in fube-v2 on
2026-09-02: **182 links whose destination contains parentheses**, none of them validated. Fifteen
are broken and nobody could see it.

CommonMark allows balanced parentheses in a destination, and allows `<…>` to sidestep the question
entirely. Supporting either would close this.

## Repro

```md
[a](./does-not-exist/(private)/page.tsx)
```

`doctor` should report a broken link and does not report this one as written.

## Acceptance criteria

- [ ] A broken link whose destination contains balanced parentheses is reported
- [ ] A link with `<…>` around the destination is read as the whole destination
- [ ] A link that resolves and contains parentheses is not reported
- [ ] A test uses a Next route-group path, which is the real case
