<!-- workfile:begin kind=canonical-agent-protocol version=0.9.2 digest=sha256:7ed161e7f9a0679fcaa122eb7dcf6613acf1c70b140b240a140410cefd97544b -->
# Repository operating protocol

This repository uses **Repository Workfile schema v2**. Repository Markdown files are canonical. The UI, CLI and every agent adapter must use the same services and rules.

## Before working

1. Search related work and knowledge with `pnpm workfile search`.
2. Read the card and its relationship neighborhood before substantial code changes.
3. Claim the card before touching its scope: `pnpm workfile card claim ID --scope path,path`. Your identity resolves on its own and `pnpm workfile agents whoami` prints it. Pass `--actor` only to claim on someone else's behalf: an actor invented by hand does not match the one the edit guard sees.
4. Inspect active claims and overlapping scopes. Do not overwrite another actor's work.
5. Load the smallest relevant context; do not inject all workfile memory into every prompt.

## While working

- Keep the card current when scope, state or blockers change.
- Create cards in the same session for actionable pending work you discover — but see the next two rules first, because the default is to finish it.
- **Finish it before you card it.** You have the files open, the run done and the failure understood; whoever picks the card up starts from nothing, so it is paid for twice and the second time costs more. If it is fixed in the same file and proved by the same run, it is not another card — it is this one. Carding is what you do when you **cannot**: another subject, another owner, an environment you do not have.
- **A batch that advances updates its own card.** Finishing a batch does not open a new card for the remainder: the remainder has not changed subject, owner or file, it is only smaller, and that is a number inside the card. A board showing seven open cards where there is one number does not tell anyone what to read.
- Record decisions, incidents, conventions or learnings when they change future behavior.
- Add a changelog fragment for user-visible changes or whenever project policy requires one.
- Prefer the CLI or an official adapter for mutations; do not hand-edit frontmatter except in an emergency.
- Never store credentials, tokens or unnecessary sensitive data in Work, Docs, History or Memory.

## Work states

- `backlog`: identified without a commitment.
- `next`: prioritized, and **startable by whoever picks it up**.
- `doing`: actively worked and claimed.
- `review`: the work is finished and the only thing missing is seeing it run. Not "my turn ended".
- `blocked`: waiting on a hand that is not yours — a decision, a third party, a deployment. Record what it waits on. A card that waits in `next` looks startable, so the next agent opens it, finds nothing to do and puts it back.
- `deferred`: deliberately postponed; record why.
- `done`: verified in an environment where it actually runs. A commit or merge is insufficient.
- `discarded`: will not be done; record why.

## Acceptance criteria

`card ac` reads exactly one heading: `## Acceptance criteria`. A card that spells it any other way cannot have a single box marked, so closing it needs `--force` — and a forced close leaves an Activity line **identical to a clean one**. The board then holds cards nobody can tell apart from verified work.

- **Checkboxes are only for criteria.** Pending items written as `- [ ]` under "what is left" are read as criteria the gate cannot interpret. Pending items take plain bullets.
- **One criterion, one claim.** "If X do A, otherwise B" can never be marked whole; the branch not taken moves to prose with its reason.
- **A criterion whose premise turns out false is rewritten with the measurement beside it**, or retired with it. Left as `- [ ]` it makes the card uncloseable and hides that the finding was wrong. Keep the original where it can still be read, so nobody re-derives it.
- **Write the criterion you can check.** If no command answers it, say that in the card instead of leaving it implied.

### Binding a criterion to a command

`card verify` marks a criterion when its command exits 0, and a search exits 0 **when it finds**. So a criterion phrased as an absence — "X no longer appears" — bound to a search for X marks itself **exactly backwards**: satisfied while the thing is still there, and silently. Phrase it as the end state a search can find, or leave it unbound and say so.

## Finishing: two exits, not one

A turn ends in exactly one of two ways, and the card has to say which.

- **`review`** — every acceptance criterion is met and only runtime evidence is missing.
- **`next` or `blocked`, with the reason written** — the turn ended with work still inside the card. Say what is left and why.

**`review` does not mean "my turn ended".** Those are the same state to a board and different states to a reader, and once they are written the same way the difference cannot be recovered. Measured in a consuming repository on 2026-09-03: 181 of 249 cards in `review` had been put there by automated agents with a **seven-minute median between claim and review**. The work was not bad — the protocol gave "I finished" and "I stopped" the same word. Telling them apart afterwards cost an audit of the whole board.

Where the reason goes matters, because the plausible places fail differently: `--evidence` is only accepted on a transition to `done`; `transition --reason` is only recorded when a gate was skipped. **A card note is the only place that always keeps it.**

Then:

1. Run relevant tests and verification.
2. Run `pnpm workfile doctor`.
3. Use `done` only with evidence from where the change actually runs.
4. Release the claim when active work stops.
5. Record durable knowledge and changelog fragments when appropriate.

## Project contracts

- Valid areas: `core`, `ui`, `docs`, `infra`, `mcp`, `search`.
- Maximum card hierarchy depth: 2 levels below the root.
- Claims are operationally stale after 24 hours, but must not be ignored without reviewing context.
- Canonical instructions: `.project/agents/protocol.md`.
- Workflows: `.project/agents/workflows/*.md`.

## Essential commands

`pnpm workfile next`  
`pnpm workfile search "query"`  
`pnpm workfile agents context --card T-0001`  
`pnpm workfile card show T-0001 --json`  
`pnpm workfile card claim T-0001 --scope apps/api`  
`pnpm workfile card transition T-0001 review`  
`pnpm workfile changelog add --title "Change" --type changed --area api`  
`pnpm workfile memory add decision --title "Decision" --status accepted`  
`pnpm workfile doctor`
<!-- workfile:end -->
