<!-- workfile:begin kind=adapter-agents-md version=0.10.0 digest=sha256:06c49f6643fd97c0098443121774ad0b8334694faff2545a731efaae9c976827 -->
# Workfile for AGENTS.md

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
