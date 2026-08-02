---
id: T-0134
title: The generated slash commands ship YAML frontmatter that does not parse
status: done
type: bug
priority: high
area: core
created: 2026-08-02
updated: 2026-08-02
scope: [packages/workfile/src/modules/claude, packages/workfile/test, plugins/workfile, .claude]
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

- [x] `claude plugin validate ./plugins/workfile` passes
- [x] Every generated `argument-hint` parses as a string, not an array
- [x] A frontmatter value containing `: `, a leading `[` or a quote round-trips
      through a YAML parser unchanged, proven by a test
- [x] The regenerated `.claude/` and `plugins/` surfaces are committed together

## Activity

- 2026-08-02 21:21Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:30Z illodev@local#bd44efc7 · doing → done

## Notes

- 2026-08-02 21:30Z illodev@local#bd44efc7 — Fixed at the serialiser rather than at the three call sites, since the next value someone adds will carry a colon too. `JSON.stringify(String(value))` emits a JSON string literal, which YAML 1.2 accepts verbatim as a double-quoted scalar, and forces the type to string in the process.

Evidence, against the tool that found it:

    claude plugin validate ./plugins/workfile  -->  before: 2 errors, "Validation failed"
                                                    after:  "Validation passed"
    pnpm run check                             -->  250 + 7 pass, 0 fail
    strict ratchet                             -->  590 known errors, none new
    workfile claude check                      -->  8 files current

The new test parses every generated frontmatter value with `JSON.parse` and asserts it comes back a string. That is a faithful YAML check for this subset and takes no dependency, which matters: the package ships with `@types/node` and nothing else.

Proven red before green, per [[LRN-0011]]. Reintroducing the interpolation fails 4 tests including the new one:

    not ok 4 - every generated frontmatter value parses back to the string meant

The quote case needed forcing. No live value contains one, because nothing user-supplied reaches frontmatter — `cli` is the only interpolated input and it comes from a fixed set of package managers. So the test drives `claudeCommandFiles('npx "wf"')` and asserts the escape round-trips, instead of trusting `JSON.stringify` unobserved.

Not fixed here, and the reason the installed surface still looks wrong: [[T-0135]]. Quoting makes the values parseable, but `workfile claude install` still writes its marker comment above the opening fence, so on an installed surface the block is not read at all. The plugin copy is the only one where this fix is visible today.
