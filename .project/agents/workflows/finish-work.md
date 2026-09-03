<!-- workfile:begin kind=workflow-finish-work version=0.9.2 digest=sha256:b0fe852d8318e166bd573e975c8639d03b68b620846cee187a6fcda1f1fa2f58 -->
# Finish work

1. Run relevant tests, typecheck, lint and verification.
2. Update notes and acceptance criteria with verifiable evidence. A criterion whose premise turned out false is rewritten with the measurement beside it, not left unmarked forever.
3. Add a changelog fragment when required.
4. Record durable decisions, incidents or learnings.
5. Run `pnpm workfile doctor`.
6. **Choose one of two exits and write which it is in a card note.**
   - `review`: every criterion met, only runtime evidence missing.
   - `next` or `blocked` with the reason: the turn ended with work still inside the card. `blocked` when it waits on a hand that is not yours; `next` when the next agent could pick it up.
   `review` is not "my turn ended". A board cannot tell the two apart afterwards.
7. Use `done` only after verification where the change actually runs.
8. Release the claim when active work stops.
<!-- workfile:end -->
