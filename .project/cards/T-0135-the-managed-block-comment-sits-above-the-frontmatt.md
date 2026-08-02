---
id: T-0135
title: The managed block comment sits above the frontmatter, so nothing parses it
status: next
type: bug
priority: high
area: core
created: 2026-08-02
updated: 2026-08-02
---

`workfile claude install` writes each command and skill through
`renderManagedBlock({ style: "html" })`, which opens the file with its
marker comment:

```
<!-- workfile:begin kind=claude-command-claim version=0.4.0 digest=sha256:… -->
---
description: Claim a card before working on it
---
```

YAML frontmatter is only frontmatter when the opening `---` is the first byte
of the file. Here it is on line 2, so it is not frontmatter at all — it is body
text that happens to look like a fence, and the whole block is inert.

Unlike [[T-0134]], this one is not a parse error anywhere. Every field is
well-formed. It is simply never read.

## Evidence

The session that found this had the five records installed in this very
repository, and its skill listing rendered each one's description as the
marker comment:

```
- workfile: <!-- workfile:begin kind=claude-skill version=0.4.0 digest=sha256:dd8f50d…
- claim:    <!-- workfile:begin kind=claude-command-claim version=0.4.0 digest=sha256:717922…
- context:  <!-- workfile:begin kind=claude-command-context version=0.4.0 digest=sha256:1f6e0e…
- done:     <!-- workfile:begin kind=claude-command-done version=0.4.0 digest=sha256:99c1db…
- next:     <!-- workfile:begin kind=claude-command-next version=0.4.0 digest=sha256:7511d9…
```

The first line of the file is what a reader falls back to when the description
is missing. All five, not the two [[T-0134]] catches — that card's validator
runs against `plugins/workfile/`, where the files are written without the
managed wrapper and open with `---` directly. The plugin copy is the only one
whose frontmatter was ever live, which is why the plugin surfaced the YAML
errors and the install surfaced nothing.

So the blast radius is every repository that has run `workfile claude install`:
no command carries its description, and none carries its `allowed-tools`
grant. It fails safe — a missing grant prompts rather than over-permits — but
the scoping the comment in `surface.ts` describes has never taken effect on an
installed surface.

## The fix

The marker has to survive, because `claude check` uses the digest to detect a
hand-edited file. So it moves rather than goes: emit the frontmatter first and
carry the marker inside it, or below the closing `---` at the head of the body.
Whichever way, `renderManagedBlock` needs to know that a body starting with
`---` is frontmatter and must stay at byte 0, instead of treating every body as
opaque text.

Worth checking the same question for the other managed targets — `agents-md`,
`cursor`, `copilot` — before assuming Claude is the only surface where
position carries meaning.

## Acceptance criteria

- [ ] Every file written by `workfile claude install` starts with `---`
- [ ] `claude check` still detects a hand-edited managed file
- [ ] A test asserts byte 0, not merely that the marker and the frontmatter are
      both present
- [ ] The other managed targets are checked for the same assumption, and what
      was found is recorded either way
