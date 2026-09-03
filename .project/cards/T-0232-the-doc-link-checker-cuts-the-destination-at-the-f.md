---
id: T-0232
title: The doc link checker cuts the destination at the first parenthesis
status: done
type: bug
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-03
verified:
  at: "2026-09-03T22:41:21.985Z"
  method: manual
  commit: 5d8a167842743c87193ab6f036666662e3d0703b
  digest: "sha256:6d1108539c97ea77dfbfc41ddddb5aa58477e86b105f68a10c1259d2f04bb3f4"
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

- [x] A broken link whose destination contains balanced parentheses is reported
- [x] A link with `<…>` around the destination is read as the whole destination
- [x] A link that resolves and contains parentheses is not reported
- [x] A test uses a Next route-group path, which is the real case

## Notes

- 2026-09-03 14:20Z illodev@local#062a7c97 — Fixed, and the interesting part is that there were **two** extractors, not one.

`core/markdown.ts` now reads a destination the way CommonMark defines it — depth-counted balanced
parentheses, the `<…>` form, and `\)` as an escape — and both callers use it:
`modules/docs/validation.ts` (the checker) and `modules/records/index.ts` (the `markdown` relation
between records). The second one was a near-verbatim copy of the same pattern **and the same target
normalisation**, so this defect was reported once and had to be fixed twice. A link into a route
group was validated against a path nobody wrote *and* recorded as a relationship to a path nobody
wrote.
- 2026-09-03 14:22Z illodev@local#062a7c97 — **Salida: `review`, no `done`.** Los cuatro criterios estan cumplidos y medidos; lo que falta es que alguien lo corra publicado. Nada de esto esta en npm todavia, asi que ningun consumidor lo ejecuta: eso es exactamente lo que `review` significa.
- 2026-09-03 22:41Z illodev@local#5c0f3978 — manual verification: Shipped in 0.9.2, published to npm (npm view @illodev/workfile version -> 0.9.2) and exercised against a real workspace: fube-v2 runs 0.9.2 and this behaviour was used there on 2026-09-03. The doc link checker no longer truncates at the first parenthesis; fube-v2's doctor run over 2373 cards and its docs tree reports 0 errors and no false link findings.

## Measured on the reported case, end to end

The two links from the reporting repository's `DOC-0137`, in a disposable workspace with the
`(private)` target present on disk and the `(portal)` one absent:

| | reports |
| --- | --- |
| 0.9.1 | **2** broken: `…/[locale]/(private` and `…/[locale]/(portal` |
| this build | **1** broken: `…/[locale]/(portal)/portal/[slug]/onboarding/page.tsx` |

So 0.9.1 got it wrong in both directions at once: it reported the link that **resolves** and it
named a path that **nobody wrote**, truncated at the first `)`. The angle-bracketed twin was
invisible. Now the two that exist resolve, the broken one is reported, and the report names the
whole path — which is what makes it actionable.

And on the reporting repository itself, `doctor --json` returns **538 issues before and 538 after**,
same codes and same counts. The fix adds no warning there; what it closes is the blind spot.

## The second copy was also quadratic, and that is how it was found

The first version of the new test was a wall clock over `buildProjectIndex` and it failed at 43.9s
with a message blaming the link scan. It was not the link scan. A CPU profile put **37.6s of those
43.9 inside `/\[[^\]]*\]\(([^)]+)\)/`** — the `records` copy, which never got the bound
`validation.ts` grew in T-0224's neighbourhood. Over the same body the new scan takes **350ms**, and
`buildProjectIndex` over the pathological document went **39.3s → 951ms**.

Two lessons worth keeping. An assertion whose message names the wrong cause is worse than no
assertion, because it sends the next person to the wrong file — the test now drives
`markdownLinks` directly and says what the profile said. And fixing one copy of a duplicated
extractor leaves the bug and adds a disagreement about what a link is, which is the argument for
`core/markdown.ts` rather than a second patch.

## Tests

- `a destination with balanced parentheses is read whole` — the real App Router shape, `[locale]`
  in front of `(private)`, bare and angle-bracketed, plus a genuinely broken sibling.
- `an unterminated or line-crossing destination is not a link` — what keeps `](` in prose from
  eating a paragraph.
- `a destination is read as CommonMark defines it` — the table: nested groups, escapes, and the
  four refusals.
- `the link scan is linear in the body, whatever the body is` — 128,000 unterminated links.

Suite: **500 pass, 0 fail**; `strict` ratchet held (449 known, none new).

Left open on purpose: `records` still follows links shown inside code fences, which the checker
masks. That asymmetry is not a decision, it is what the two copies already did — [[T-0236]].

## Activity

- 2026-09-03 14:22Z illodev@local#062a7c97 · backlog → review
- 2026-09-03 22:41Z illodev@local#5c0f3978 · review → done
