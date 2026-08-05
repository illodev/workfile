---
id: T-0200
title: The frontmatter codec cannot hold the two shapes the done gate needs
status: doing
type: feature
priority: high
area: core
parent: T-0183
tags: [protocol]
effort: M
scope: [packages/workfile/src/core/frontmatter.ts, packages/workfile/docs/SPEC.md]
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-08-05
claimed_by: "illodev@local#bf4c5f67"
claimed_at: "2026-08-05T19:31:36.019Z"
---

ADR-0016 draws `verify:` as a block sequence of mappings and `verified:` as a nested
mapping. The codec can hold neither, and nothing in the ADR or in T-0185, T-0186 and
T-0187 noticed. Reproduced against the build:

```text
verify parses as:   "    - id: gate\n      run: pnpm test\n      criteria: [sha256:ab]"
patch throws:       Error | code: (none)
                    frontmatter key "verify" holds a nested structure this codec does not rewrite
verified parses as: "    at: 2026-01-01\n      method: ci"
```

`scanEntries` classifies both as style `opaque`, so the value reads back as the raw
indented text rather than as data, and the first write to either throws — a bare
`Error`, not a `ProtocolError`, so it escapes the surfaces as an internal error
rather than as a refusal anyone can act on. `renderCard` is worse on the create
path: `serializeValue` writes `verify: "[object Object]"`.

SPEC §10.4 states the limit normatively — "no anchors, aliases, tags, multiline YAML
scalars or arbitrary nested objects" — so this is a deliberate boundary being moved,
not a bug being fixed. Two notes on that clause: the codec has shipped `literal` and
`folded` block scalars for a while, so the multiline half is already false and gets
corrected in the same pass.

## What moves

Two shapes, both flat one level down, and nothing else:

- a block sequence whose every item is a mapping of scalars or flow lists (`verify`)
- a mapping of scalars (`verified`)

A shape outside those two stays `opaque` and keeps today's behaviour. The classifier
must refuse what it cannot represent rather than guess at it: a `criteria:` written as
a nested block sequence rather than a flow list is representable YAML that this codec
still will not hold, and reading it as something else would silently rewrite a card.
Round-tripping is the contract — `parse(render(x))` deep-equals `x`, and re-rendering
is byte-identical — because every record in the workspace passes through here.

Keys already in `CARD_LIST_KEYS` keep their exact current classification. This must be
provable on the corpus: no card, doc, fragment, release or memory record in
`.project/` may render one byte differently after the change.

## Acceptance criteria

- [ ] A block sequence of flat mappings parses to an array of objects and renders back byte-identically.
- [ ] A flat nested mapping parses to an object and renders back byte-identically.
- [ ] A nested shape outside those two stays `opaque` and behaves exactly as today.
- [ ] Writing a key the codec cannot represent fails with a `ProtocolError` carrying a code, not a bare `Error`.
- [ ] Every record under `.project/` re-renders byte-for-byte unchanged, proven by a test over the real corpus.
- [ ] SPEC §10.4 states the new boundary, and its multiline-scalar clause stops being false.

## Activity

- 2026-08-05 19:31Z illodev@local#bf4c5f67 · claimed
