---
id: T-0134
title: The generated slash commands ship YAML frontmatter that does not parse
status: next
type: bug
priority: high
area: core
created: 2026-08-02
updated: 2026-08-02
---

`frontmatterBlock` in `packages/workfile/src/modules/claude/surface.ts`
serialises every value by interpolation:

```ts
...Object.entries(entries).map(([key, value]) => `${key}: ${value}`)
```

Nothing quotes or escapes, so any value carrying YAML syntax lands as YAML
syntax. Two of the four commands do:

- `/claim` has `argument-hint: [T-0042] [scope,paths]`. YAML reads `[T-0042]`
  as a flow sequence and then finds more content after it, which is a parse
  error.
- `/done` has `description: Finish a card: verify, record, release`. A plain
  scalar cannot contain `: `, so the value ends at `card` and the rest is an
  unexpected token.

Found by running the check Anthropic's plugin review pipeline runs:

```
$ claude plugin validate ./plugins/workfile
✘ frontmatter: YAML frontmatter failed to parse ... (commands/done.md)
✘ frontmatter: YAML frontmatter failed to parse ... (commands/claim.md)
✘ Validation failed
```

The validator states the consequence: "At runtime this command loads with
empty metadata (all frontmatter fields silently dropped)." So `/claim` and
`/done` reach the model with no `description` and no `allowed-tools`. The
latter is the one that matters — the comment above `commandDefinitions` says
the grant is deliberately narrower than `Bash(project *)` because "a generated
file that lands in someone else's repository grants permissions". The narrow
grant is never applied, because the field never parses.

There is a third case that does not error and is still wrong.
`argument-hint: [T-0042]` in `/done` and `/context` is valid YAML: it parses
as a one-element array where a string was meant. A quoting fix has to cover
that too, or it fixes the crash and leaves the wrong type.

## The fix

Quote at the serialiser, not at the three call sites — the next value someone
adds will carry a colon too. `JSON.stringify` emits a double-quoted scalar
that YAML 1.2 accepts verbatim, since YAML is a superset of JSON, and it
forces every value to a string:

```ts
`${key}: ${JSON.stringify(String(value))}`
```

This blocks [[T-0133]]: the community-marketplace submission runs
`claude plugin validate` and this fails it.

## Acceptance criteria

- [ ] `claude plugin validate ./plugins/workfile` passes
- [ ] Every generated `argument-hint` parses as a string, not an array
- [ ] A frontmatter value containing `: `, a leading `[` or a quote round-trips
      through a YAML parser unchanged, proven by a test
- [ ] The regenerated `.claude/` and `plugins/` surfaces are committed together
