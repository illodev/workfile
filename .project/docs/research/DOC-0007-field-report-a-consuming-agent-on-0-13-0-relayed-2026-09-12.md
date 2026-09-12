---
id: DOC-0007
title: "Field report: a consuming agent on 0.13.0, relayed 2026-09-12"
kind: research
status: current
related: [DOC-0006]
created: 2026-09-12
updated: 2026-09-12
---

Relayed by the owner on 2026-09-12: an agent working in a consuming repository was asked, after that repository moved from 0.10.0 to 0.13.0 and after the changes made on the first field report ([[DOC-0006]]), whether it noticed improvements. Its answer, in its own structure, with the consumer's identifiers removed.

## What it noticed working

- **The activity guard.** When one of its agents touched a file inside a scope it held, the warning arrived with the right actor and `claimed_by`, and the event landed in `events.jsonl`. It reports one false positive: its subagents run inside its own session, so the report said "most likely yours" when the change was the claim holder's own, made through the CLI.
- **Errors say what to do.** `CARD_TITLE_TOO_LONG` with the limit, `RELEASE_AMEND_EMPTY` listing what can be amended, `CHANGE_RECORD_NOT_A_FRAGMENT`. Corrected at the first attempt every time, without opening the help.
- **`--expected-revision` on `doc write` and `doc patch`, `changelog show REL --fields revision`, `changelog verify`, and `card ac --check` printing the text of the criterion it marks.** Used without a stumble.
- **The protocol names the mistakes it used to make.** "review is not that my turn ended", "the scope is not a fence", "a missing decision is a question, not a card". It reads as an answer to what it had been reporting, and it used them to decide two cards without hesitation.

## What still bites

1. **A cut release does not release a fragment.** A duplicate slipped in (its agent had already added a fragment for the change; it added a second one). `changelog patch` on the release refuses and `--amend` does not take `--fragments`, although the help for `release` lists that flag. It undid the cut with git and cut again. It asks for `release --amend --fragments` or a `--drop CHG-…`.
2. **`changelog verify` did not see the broken reference.** With the fragment's file deleted and its id still listed in the release record, it answered "0 errors".
3. **`doctor` prints 592 warnings, almost all `filename-stale` on old ADRs and fragments.** Any new warning is lost in there. A baseline, or "only what is new since X", would make somebody read it.
4. **`transition review` does not warn about an unchecked criterion.** In its case that was correct — the criterion was the runtime evidence — but the gate could say "1 left unchecked" and let it through.

Overall: fewer times it had to guess, and two smoother days because of it.

## What the repository already had, checked on 2026-09-12

- Bite 3 exists as `doctor --accept-baseline` / `doctor --new` (documented in `docs/cli.md`, "did I make it worse"). The consumer did not find it: the 592-line report does not name it, and the usage line printed by `doctor --help` lists neither flag. The gap is discoverability, not the feature.
- Bite 1 is a recorded decision: `RELEASE_AMENDABLE` leaves `fragments` out on purpose ("which changes went into a release is what the cut decided, and rewriting it detaches the record from the files it consumed"), but the `--amend` path accepts `--fragments` and drops it silently, and the only exit from a wrong cut is git.
- Bite 4 is by construction: `assertAcceptanceMet` runs only for `done`.
- Bite 2 and the guard's false positive are measured below in their cards.
