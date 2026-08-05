---
id: CHG-0134
title: Frontmatter holds one level of nesting, and refuses the rest by name
type: changed
area: core
visibility: public
cards: [T-0200]
tags: [protocol]
created: 2026-08-05
updated: 2026-08-05
---

A record's frontmatter can now carry a mapping of scalars, or a list of such
mappings, one level deep:

```yaml
verify:
  - id: gate-test
    run: pnpm test acceptance
    criteria: ["sha256:ab12\u2026"]
verified:
  method: ci
  commit: 4b939fd
```

Both shapes round-trip: they parse to data rather than to raw text, and re-render
byte for byte. Anything nested more deeply than that is still preserved verbatim
on read and refused on write \u2014 but the refusal now carries a code
(`RECORD_FRONTMATTER_OPAQUE`), where it used to be a bare `Error` that surfaced
as an internal failure. Writing a value the format cannot represent is refused
the same way instead of being serialised as `[object Object]`.

A key declared as a list stays a list whatever it looks like, so no existing
record changes meaning. All 403 records in this repository re-render byte for
byte, before and after.
