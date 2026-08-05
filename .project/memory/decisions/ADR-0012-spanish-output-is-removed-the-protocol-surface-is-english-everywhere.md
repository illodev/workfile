---
id: ADR-0012
title: Spanish output is removed; the protocol surface is English everywhere
status: accepted
created: 2026-08-05
updated: 2026-08-05
related: [T-0158, T-0167, CONV-0001, DOC-0005]
---
## Context

[[T-0158]] laid out three ways to resolve `config.language`, and closed by
saying the choice was the owner's: remove the feature, keep the key as inert
metadata, or finish the localization properly. It recommended removal unless
Spanish output was a product goal.

It is not. The owner decided on 2026-08-05 to remove Spanish outright — option
1 of the three.

The decision is consistent with what the repository had already done to itself.
[[CONV-0001]] made protocol records English and [[T-0061]] translated the
Spanish filenames that predated it. `config.language` shipped in the first
commit, `c034193`, and was never a decision anybody took; the translation moved
the records and left the rendering code behind.

What is actually being removed is smaller than it sounds: 15 `isEs` branches,
all in `src/modules/agents/agents.ts`. The SPEC promised localized UI labels and
record bodies — the first was never built, the second was deliberately reversed
by CONV-0001.

## Decision

The protocol surface is English everywhere. The `language` branches, the config
key's effect, the CLI flag and the interactive prompt go.

A config that still declares `language` must keep loading and running
unchanged — that is T-0158's fourth acceptance criterion and it is not softened
here. The key becomes accepted and ignored rather than rejected; anyone who ran
`workfile init --language es` keeps a working workspace.

## Consequences

`getting-started.md` teaches `--language es` as its worked example on the first
page and has to stop. SPEC invariant 4 and its summary block have to say the
surface is English.

It is a breaking change in the sense that a promised feature disappears, and
the key that requested it is written into user config files. Making it inert
rather than invalid is what keeps that from being an upgrade that fails.

**What this decision does not fix.** The Spanish acceptance heading that
[[DOC-0005]] found is not closed by removing Spanish. Measured on 0.6.0,
`## Definition of done`, `## Success criteria` and `## Criteria` are just as
invisible to the gate as `## Criterio de aceptación` — the parser matches one
English phrase and reports everything else as "declares no acceptance
criteria", with `done` passing and `doctor` silent. Removing Spanish narrows who
walks into it; it does not make the gate honest. That is [[T-0167]], and it
stands on its own.
