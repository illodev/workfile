---
id: DOC-0006
title: "Field report: a Fube agent's session on the Workfile CLI, relayed 2026-09-11"
kind: research
status: current
tags: [field-report, cli, consumer, fube]
created: 2026-09-11
updated: 2026-09-11
---

An agent working in Fube (a consuming repository) wrote up its session with Workfile for whoever works on the tool. The owner relayed it on 2026-09-11. The installed version was not reported. The text below is the report, translated; each item carries what was measured against `main` at 0.10.0 on the same day, so the cards derived from it start from a measurement rather than from the report.

## What worked

`card create --json-input` with `raised`, `source`, `parent`, `scope` and `related` in one call. The scope-overlap warning between claims. `card ac --check N`, repeatable. `doc patch` with `--expected-revision`. The `source:` guard on derived cards. `workfile schema` to see valid statuses and areas without guessing.

## Actor identity

> `claim --actor claude-88b287fd` warns on every claim that the session is `illodev@local#88b287fd` and that releasing needs the same actor. The consumer's CLAUDE.md asks for `--actor <session-id>` and does not say which of the two identities that is. Suggestion: when `--actor` is omitted, use the session identity, and warn once per session rather than once per claim.

**Measured.** Omitting `--actor` already resolves to the session identity, and the generated protocol has said so since 0.9.x ("Pass `--actor` only to claim on someone else's behalf"). The warning fires only when `--actor` is passed and differs from the resolved actor. The consumer's CLAUDE.md carries an older generated block; `agents sync` there replaces it. Once per session is not available to a CLI that is one process per call. What the warning does not say is the repair — *omit the flag* — which is the part that reaches a repository whose instructions are stale.

## Evidence only on done

> `transition ID review --evidence "…"` fails with `CARD_VERIFICATION_NOT_APPLICABLE`. Review is exactly when there is local evidence to record and runtime evidence is missing. I had to put it in `card note`. Suggestion: accept `--evidence` on review and store it as a note, or say so in the transition help.

**Measured.** Reproduced. The refusal says what `--evidence` is for and does not name `card note`, which the protocol already designates as "the only place that always keeps it". Whether `review` should accept the flag is a decision for the owner; the message naming the door is not.

## Title of 80 characters

> Seven of eleven creations failed with `CARD_TITLE_TOO_LONG` after the whole body had been written. The limit is neither in the help nor in `schema`. Suggestion: show it in both, or truncate with a warning.

**Measured.** Cards refuse past 80, documents past 120. Neither number appears in `--help`, in `docs/cli.md`, or in `workfile schema --json`; the MCP `project_card_create` schema carries `maxLength: 80` and is the only surface that does.

## Shape of the JSON

> `card create` returns `{record, warnings}`, `doc show` returns the bare record, `doctor --json` has an issues key you have to guess. I ended up reading everything with `d.get("record", d)`. Suggestion: one documented envelope.

**Measured on 0.10.0.** `card create --json` returns the bare card; `card claim --json` returns `{record, warnings}`; `card transition --json` returns the bare card with its body; `doc show --json` returns the index record (with `outgoing`, `incoming`, `freshness`); `doc patch --json` returns the normalised document; `doctor --json` returns `{generatedAt, cards, modules, counts, ok, issues}`. The report's attribution of `{record, warnings}` to `card create` does not match `main`; the inconsistency it describes does.

## doc patch takes the whole body

> There is no `doc write --body-file` and no way to append, so I keep a working file outside the repository and pour it in each time. For a document edited in conversation over hours, a `doc write --body-file` and a `doc note` (append) would save a lot.

**Measured.** Cards have both (`card write --body-file`, `card note`); documents have neither, on the CLI or the MCP.

## Truncated --expected-revision

> Early in the session a `doc patch` with the revision cut in half applied anyway. If that is a prefix match it should say so; if not, the check is broken.

**Measured.** The check is strict equality and a truncated revision passed as `--expected-revision REV` is refused with `DOC_WRITE_CONFLICT`, exit 3. The same revision passed as `--expected-revision=REV` is **accepted and never read**: the flag validator recognises the `=` spelling and lets it through, and `option()` looks for the exact token and finds nothing, so the patch runs with no revision check. This holds for every value-taking flag on the CLI, not only this one. That is the failure the report saw.

## Two calls per patch

> Every `doc patch` forces a prior `doc show --json` to get the revision. Suggestion: `--expected-revision latest`, or a patch without a revision should warn rather than refuse.

**Measured.** A patch without `--expected-revision` applies silently today; the `show` is what a caller does to be safe, and it returns the whole body to obtain one field. Design question, carded.

## transition --json returns the whole record

> On long cards that is several KB per transition. A `--quiet` returning id and status would do.

**Measured.** Without `--json` the output is already one line, `T-0003 → next`. With `--json` it is the full card. Folded into the envelope card.

## Not used

> The MCP (`mcp__workfile__*`). I went through the CLI because the CLAUDE.md documents it and because the JSON input gave me control over every field.
