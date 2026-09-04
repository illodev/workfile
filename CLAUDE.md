<!-- workfile:begin kind=adapter-claude version=0.10.0 digest=sha256:fcf40dde953cbb5a6e7529d2d62e0ccc3197d63dafb203d6fbaf538eed14d4be -->
# Workfile for Claude Code

Before substantial changes, read `.project/agents/protocol.md` and the relevant workflow under `.project/agents/workflows`.

Critical rules:

- Search context with `pnpm workfile search` or `pnpm workfile agents context`.
- Claim cards before modifying their scope.
- Use CLI/MCP for protocol mutations.
- Two exits, and say which: `review` only when every criterion is met and just runtime evidence is missing; otherwise `next`/`blocked` with the reason in a note. `review` is not "my turn ended".
- `done` requires evidence from where the change actually runs.
- Acceptance criteria live under `## Acceptance criteria`; checkboxes are only for criteria; a criterion with a false premise is rewritten with the measurement, not left unmarked.
- Finish discovered work rather than carding it when it is the same file and the same run; card what you cannot do, and record durable knowledge.
- Run `pnpm workfile doctor` before finishing.
<!-- workfile:end -->
