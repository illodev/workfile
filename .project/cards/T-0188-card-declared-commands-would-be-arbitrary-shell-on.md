---
id: T-0188
title: Card-declared commands would be arbitrary shell on the CI runner
status: review
type: audit
priority: high
area: infra
parent: T-0183
tags: [protocol, acceptance]
effort: S
created: 2026-08-05
updated: 2026-08-05
origin: [ADR-0016]
related: [LRN-0025]
---

Blocks the `ci` method. A card is a Markdown file; in a repository that takes
pull requests, a card can arrive from a fork. `verify[].run` executed by CI is
then arbitrary shell on the runner.

**The premise this card was filed on is wrong, and LRN-0025 records why.** The
runner already executes repository-supplied code from a fork's head, and has
since the first generated workflow: `loadWorkspace` `import()`s
`project.config.mjs` out of the checkout, so every command that loads a workspace
runs that file — `doctor` included, which is the one command the generated
workflow exists to run. This repository's own workflow additionally runs
`pnpm install` and a build before reaching it. That is the ordinary cost of
building a pull request, and GitHub prices it: a fork PR gets a read-only token
and no secrets.

So an allowlist is not the boundary between a fork and the runner. It is worth
building for what it does do:

- a declared command stays reviewable, in one place, against a stated policy;
- a card cannot silently introduce a command that runs where the repository's
  code is not otherwise executed — a maintainer running `card verify` on a
  branch they only meant to read is the case that matters;
- refusing at write time means the card never lands, so the refusal is a
  reviewable diff rather than a red build.

Write-time refusal alone does not cover the fork, because a card from a fork
arrives as a *file* in a diff and never calls `createCard` or `patchCard`. The
gate that turns that pull request red is `doctor`, so the allowlist has to be
checked on read as well as on write, and `doctor` has to report a card carrying
a command the project does not permit.

What actually bounds the damage is the job rather than the card: card checks run
where there are no secrets and no write token, and evidence is never written back
from a fork's head. That belongs to T-0189 and is the reason this card blocks it.

Filed as an audit rather than a task because the same question needs asking of
the GitLab and generic targets, which have their own permission models, and the
answer may differ per target.

## Acceptance criteria

- [x] `verify[].run` is refused on write unless it matches a prefix the project declares.
- [x] The allowlist is empty by default: a project that declares nothing can run nothing.
- [x] `doctor` reports a card carrying a command the project does not permit, so a card that arrived as a file rather than through the protocol is caught too.
- [x] The matcher is stated against a shell-free execution model, and rejects what that model cannot make safe.
- [x] The three generated CI targets are each reviewed for what a card-declared command can reach, and the finding is recorded.
- [x] A card carrying a disallowed command is refused with a named error, proven by a test.

## Notes

- 2026-08-05 19:46Z illodev@local#bf4c5f67 — Reframed against LRN-0025: the runner already executes repository-supplied code from a fork's head via loadWorkspace's import() of project.config.mjs, so the allowlist is not the fork boundary and must not be argued as one. Two criteria added — doctor has to check the allowlist on read, because a card from a fork arrives as a file in a diff and never calls createCard; and the matcher has to be stated against a shell-free execution model rather than against a character blacklist.
- 2026-08-05 23:08Z illodev@local#bf4c5f67 — Verified end to end through the real binary against a scratch workspace declaring commands [[node, -e]] and methods {*: [ci, manual], docs: [manual]}. A command outside the allowlist is refused on write with CARD_VERIFY_COMMAND_NOT_ALLOWED naming both what was asked and what is declared. And the criterion that matters: a card written straight into .project/cards, which never calls a mutation, is caught by doctor at severity error — ok: false, errors: 1 — which is what turns a pull request red. The audit is LRN-0028 and it turned up a second channel nobody had recorded: runDoctor builds an integration registry from the same config module and calls each declared healthCheck. Filed as T-0213.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
