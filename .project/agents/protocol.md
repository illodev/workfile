<!-- workfile:begin kind=canonical-agent-protocol version=0.1.0 digest=sha256:c37c02639918fd1ed9ce76a474036bccc3660aaf18aa559c7140bf7edacd4709 -->
# Repository operating protocol

This repository uses **Repository Workfile schema v2**. Repository Markdown files are canonical. The UI, CLI and every agent adapter must use the same services and rules.

## Before working

1. Search related work and knowledge with `pnpm workfile search`.
2. Read the card and its relationship neighborhood before substantial code changes.
3. Claim the card before touching its scope: `pnpm workfile card claim ID --actor ACTOR --scope path,path`.
4. Inspect active claims and overlapping scopes. Do not overwrite another actor's work.
5. Load the smallest relevant context; do not inject all workfile memory into every prompt.

## While working

- Keep the card current when scope, state or blockers change.
- Create cards in the same session for actionable pending work you discover.
- Record decisions, incidents, conventions or learnings when they change future behavior.
- Add a changelog fragment for user-visible changes or whenever project policy requires one.
- Prefer the CLI or an official adapter for mutations; do not hand-edit frontmatter except in an emergency.
- Never store credentials, tokens or unnecessary sensitive data in Work, Docs, History or Memory.

## Work states

- `backlog`: identified without a commitment.
- `next`: prioritized for the next batch.
- `doing`: actively worked and claimed.
- `review`: implementation finished, awaiting verification, deployment or approval.
- `blocked`: externally blocked; record why.
- `deferred`: deliberately postponed; record why.
- `done`: verified in an environment where it actually runs. A commit or merge is insufficient.
- `discarded`: will not be done; record why.

## Finishing

1. Run relevant tests and verification.
2. Run `pnpm workfile doctor`.
3. Keep the card in `review` if verification or deployment is pending; use `done` only with real evidence.
4. Release the claim when active work stops.
5. Record durable knowledge and changelog fragments when appropriate.

## Project contracts

- Valid areas: `core`, `ui`, `docs`, `infra`, `mcp`, `search`.
- Maximum card hierarchy depth: 2 levels below the root.
- Claims are operationally stale after 24 hours, but must not be ignored without reviewing context.
- Canonical instructions: `.project/agents/protocol.md`.
- Workflows: `.project/agents/workflows/*.md`.

## Essential commands

`pnpm workfile search "query"`  
`pnpm workfile agents context --card T-0001`  
`pnpm workfile card show T-0001 --json`  
`pnpm workfile card claim T-0001 --actor session-id --scope apps/api`  
`pnpm workfile card transition T-0001 review --actor session-id`  
`pnpm workfile changelog add --title "Change" --type changed --area api`  
`pnpm workfile memory add decision --title "Decision" --status accepted`  
`pnpm workfile doctor`
<!-- workfile:end -->
