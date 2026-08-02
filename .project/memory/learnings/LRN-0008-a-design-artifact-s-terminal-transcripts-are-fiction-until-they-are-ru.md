---
id: LRN-0008
title: A design artifact's terminal transcripts are fiction until they are run
status: active
created: 2026-08-02
updated: 2026-08-02
---
`Workfile Landing v2.dc.html` shipped a beautiful agent-session block built on two commands that do not exist: `workfile claim T-0142 --paths "src/api/**"` and `workfile done T-0142 --evidence ci:run/8841`. Neither the top-level `claim`/`done` verbs nor the `--paths`/`--evidence` flags are in the dispatch table. A design tool writes what reads well; it has no way to check.

That is the worst possible place for a fake flag. The landing is where someone decides to run `npx @illodev/workfile init`, and the first command they copy failing with `CLI_ARGUMENT_UNKNOWN` costs more trust than a plain page ever would have earned.

## What to do instead

Before a command reaches a public surface — landing, README, social, docs — run it. `workfile init` in a scratch directory is seconds, and the real output is usually better copy than the invented one. Porting this landing that way turned a fictional `✓ evidence recorded` into the refusal the protocol actually produces:

```
$ workfile card transition T-0142 done
CARD_ACCEPTANCE_UNMET: 2 unproven acceptance criteria.
```

Which sells the guarantee better than the success line did, because it is the part no competitor can fake.

The same pass confirmed the claims worth keeping: `mcp inspect --json` reports exactly 30 tools, and `CARD_CLAIM_OWNER_MISMATCH` is real and enforced on `transition` and `release`.

Related: [[ADR-0001]] governs the UI's relationship to its design artifacts. The rule here is narrower and applies to any artifact showing a shell.
