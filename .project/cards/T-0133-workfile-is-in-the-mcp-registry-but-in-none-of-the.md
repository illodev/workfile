---
id: T-0133
title: Workfile is in the MCP Registry but in none of the directories that mirror it
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-09-07
scope: [.project/cards]
---

[[T-0114]] shipped the half a repository can own: `v0.4.0` published
`server.json` from CI and `io.github.illodev/workfile` is active in the
official MCP Registry. Everything below is a browser session with an account
behind it, which is why none of it can be wired into `release.yml` the way the
registry step was.

[[DOC-0004]] holds the requirements per registry and the copy to reuse. This
card holds the state.

## Where each one stands

| Registry | State |
| --- | --- |
| Official MCP Registry | Listed, `active`, `isLatest`, 0.5.0 |
| `punkpeye/awesome-mcp-servers` | PR [#11406](https://github.com/punkpeye/awesome-mcp-servers/pull/11406) open, rebased, `CLEAN`, awaiting merge |
| mcpservers.org | Live at [`/servers/illodev/workfile`](https://mcpservers.org/servers/illodev/workfile) |
| Glama | Claimed and verified, two grades A, quality still ungraded — [[T-0141]] |
| Claude Code community marketplace | Submitted, awaiting review |
| mcp.so | Charges for a listing — decision below |
| Smithery | Dropped |

## The punkpeye pull request

Open, `MERGEABLE` and `CLEAN`, with the repository's bots holding `has-emoji`,
`valid-name` and `has-glama` — all three positive, and all three kept across the
rebase because the entry text did not change.

It did not stay mergeable on its own. Filed clean on 2026-08-02, it began
conflicting on 2026-08-10, when `gonnagetapower/kelvia-mcp` was appended to
Product Management at the same anchor and merged: one hunk, one file, three
markers at `README.md:3096`. It sat that way for 28 days, because the only
signal anyone here was reading was `check-submission`, which stayed green
throughout and says nothing about mergeability. The rebase on 2026-09-07 took
`mergeable` back from `CONFLICTING` to `MERGEABLE` and `mergeStateStatus` from
`DIRTY` to `CLEAN`.

One bot comment still asks for something the pull request cannot supply on its own:

> Thank you for adding the Glama badge! Please make sure the server has been
> evaluated by Glama and has a quality score.

It is a request, not a failing check, and nothing marks the pull request
blocked. The badge has since stopped being an empty promise: [[T-0136]] claimed
the listing and two of its three slots now render A, with the quality score
still ungraded because that one needs a container the card declined to build.
The bot's ask is unmet and stays unmet; the line is no longer misleading.

The line as filed, kept here because the working copy that produced it is
disposable:

```
- [illodev/workfile](https://github.com/illodev/workfile) [![illodev/workfile MCP server](https://glama.ai/mcp/servers/illodev/workfile/badges/score.svg)](https://glama.ai/mcp/servers/illodev/workfile) 🎖️ 📇 🏠 🍎 🪟 🐧 - Work, Docs, History and durable Memory as Markdown inside the repository, so the backlog reviews, branches and merges with the code that answers it. Cards carry a lifecycle and a claim, so parallel agents refuse to edit a card another actor holds. 30 tools, plus a CLI, a Claude Code plugin and a local UI. `npx -y @illodev/workfile mcp`
```

## The two that cost something

**mcp.so** charges for a submission. The listing was described here as "reach"
rather than signal, which is the wrong side of a price. Nothing else on this
card costs money, so it is a decision rather than a step: leave it unfiled
unless the free listings turn out not to carry.

**Smithery** is dropped. It takes a local stdio server only as an `.mcpb`
bundle, which nothing here builds, so it is an artifact to design and maintain
in exchange for one listing. Reopen it if the bundle becomes worth having for
its own sake.

## Still to file

The Claude Code community marketplace, at
<https://platform.claude.com/plugins/submit> for an individual author. It was
blocked on [[T-0134]] and is not any more: `claude plugin validate` passes.
This is the only listing left with a review queue behind it.

## Acceptance criteria

- [ ] `punkpeye/awesome-mcp-servers` lists Workfile
- [x] mcpservers.org lists Workfile
- [x] The Claude Code community marketplace submission is filed
- [ ] Glama shows a real score rather than `–`
- [x] mcp.so and Smithery are decided rather than pending

## Activity

- 2026-08-02 21:11Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:12Z illodev@local#bd44efc7 · released
- 2026-08-02 21:34Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:36Z illodev@local#bd44efc7 · released
- 2026-08-02 22:09Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:09Z illodev@local#bd44efc7 · released
- 2026-08-02 22:13Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:14Z illodev@local#bd44efc7 · released
- 2026-08-03 09:32Z illodev@local#bd44efc7 · claimed
- 2026-08-03 09:33Z illodev@local#bd44efc7 · released
- 2026-09-03 22:42Z illodev@local#5c0f3978 · next → blocked
- 2026-09-07 14:34Z illodev@local#8dca5ed1 · claimed
- 2026-09-07 14:57Z illodev@local#8dca5ed1 · released
- 2026-09-07 15:04Z illodev@local#8dca5ed1 · claimed
- 2026-09-07 15:05Z illodev@local#8dca5ed1 · released

## Notes

- 2026-08-02 21:12Z illodev@local#bd44efc7 — punkpeye is open as #11406 (+1/-0, MERGEABLE), filed from a fork of the current upstream HEAD with the agent fast-track title.

wong2 cost a wasted branch. I read its entry format off the file and its ordering off the surrounding lines, and never read the top of its README — which says, in its second line, "We do not accept PRs. Please submit your MCP on the website". The repository confirms it: `GET /repos/wong2/awesome-mcp-servers/pulls` 404s and `has_issues` is false, so `gh pr create` failed with a permissions error that never mentions the real cause. The branch pushed to the fork was deleted; the line survives in the body above.

The general shape, for the remaining registries: a list's contributing rules describe the format, not the intake channel. Check where submissions are accepted before preparing one.
- 2026-08-02 21:36Z illodev@local#bd44efc7 — Filed state as reported: mcpservers.org submitted and awaiting review; punkpeye #11406 open with valid-name, has-emoji and has-glama; mcp.so charges, so unfiled; Smithery dropped; Claude Code marketplace still to file, no longer blocked now that [[T-0134]] closed. Glama had already crawled the server and could not score it — [[T-0136]].
- 2026-08-02 22:09Z illodev@local#bd44efc7 — The Claude Code community marketplace submission is filed, through the Console form at platform.claude.com/plugins/submit rather than the claude.ai one, which needs a Team organisation. It was blocked on [[T-0134]] until `claude plugin validate` passed.

The form required example use cases, which nothing here had written down. The four supplied are now in [[DOC-0004]] with the rest of the reusable copy, so the next registry that asks gets the same answer rather than a fresh improvisation.

What happens next is not a queue to watch: approved plugins are pinned to a commit SHA in `anthropics/claude-plugins-community`, CI bumps the pin as this repository moves, and the public catalog syncs nightly. So absence right after an approval is expected. The check is the plugin's name in that repository's `.claude-plugin/marketplace.json`.
- 2026-08-02 22:13Z illodev@local#bd44efc7 — mcpservers.org approved it. Live at https://mcpservers.org/servers/illodev/workfile with the description and the category as submitted.

The page renders this repository's README rather than the submitted copy, so the install block it shows leads with `pnpm add -D @illodev/workfile`. That is the README's ordering, not the registry's choice, and every aggregator that mirrors a README will show the same. The MCP Registry advertises `npx -y @illodev/workfile mcp`, which is the form someone evaluating a server actually runs — see [[T-0139]].
- 2026-08-03 09:33Z illodev@local#bd44efc7 — Two rows moved without anyone filing anything. Glama verified the listing from the committed `glama.json` alone — see [[T-0136]] and [[LRN-0015]] — and mcpservers.org approved the submission, so `https://mcpservers.org/servers/illodev/workfile` now answers 200. The registry row is refreshed to 0.5.0, read with `?version=latest` because the search endpoint returns every published version and its first element is not the current one.

What is left on this card is entirely other people: the punkpeye merge and the Claude Code marketplace review. Neither has a next action here.
- 2026-09-03 22:42Z illodev@local#5c0f3978 — Moved from `next` to `blocked` on 2026-09-03. The two open criteria are not work: #1 is a pull request sitting in `punkpeye/awesome-mcp-servers` and #4 is Glama computing a score. Both wait on somebody else's hand, and a card that waits in `next` looks pickable — an agent draining the board will open it, find nothing to do, and put it back. `blocked` is the state that says so. Re-open when either directory answers.
- 2026-09-07 14:56Z illodev@local#8dca5ed1 — The card said this row waited on somebody else's hand. It does not, and has not since 2026-08-10.

#11406 stopped being mergeable without anyone touching it. `gonnagetapower/kelvia-mcp` was appended to Product Management at the same anchor and merged on 2026-08-10, so the branch, still based on `375407c7`, now conflicts: one file, one hunk, three markers at `README.md:3096`. The 2026-09-07 nudge says "the entry looks correct and all checks pass", which is true and beside the point — `check-submission` is green and `mergeStateStatus` is `DIRTY`. The bot that nudges and the bot that flags conflicts are different templates (`triage-nudge` vs `triage-conflict`), and this pull request drew the wrong one, so the comment names inactivity as the problem and never mentions the conflict.

What the nudge is worth, measured rather than assumed. Over eight weeks of that repository's comments: 2,465 `triage-nudge`, 1,517 `triage-close-inactive`, 179 `triage-conflict`, 786 merges. Of 80 nudged pull requests with known outcomes, 0/65 merged where the author never replied and 3/15 where they did. Cross-tabbed against pushing a commit after the nudge: 2/7 merged where the author pushed, 1/73 where they did not. Of 180 conflict-flagged pull requests, 41 merged, and 41 of 41 were resolved by the author — no case of the maintainer resolving one himself. Median lag from the resolving push to the merge: 0.9 hours.

So the reply is necessary and the push is what merges. Ordering matters: push first, then comment, so the comment describes a branch that is already green.

The rebase is prepared and verified in a throwaway clone, nothing pushed: `git rebase upstream/main`, keep both lines with kelvia first, and the result is `README.md | 1 +` against `upstream/main` with the entry still last under Product Management. The entry text is byte-identical to the one the bots already labelled `has-emoji`, `valid-name` and `has-glama`, so the rebase cannot cost those labels. "30 tools" in the line still measures true: `grep -cE '^\s+name: "project_' packages/workfile/src/modules/mcp/tools.ts` answers 30 at 0.10.0.

One thing to know before reading the timing as urgent. A sweep was running on 2026-09-07 — 248 merges and 493 inactivity-closes that day — but the median nudge-to-close gap is 47 days, so the threat is the next sweep rather than this one. And replying is not sufficient on its own: #8187 got "I'll proceed with merging as soon as I hear back", was answered the same day, and was still open unmerged 47 days later.

CONTRIBUTING.md says "maintain alphabetical order within each category" and the file disagrees — Product Management is arrival-ordered across all fourteen entries, and every merged pull request inspected appended. The pull request body's claim was right, and appending stays right.
- 2026-09-07 15:05Z illodev@local#8dca5ed1 — Pushed and commented on 2026-09-07, in that order, because the measurement in the previous note says the push is what merges and the reply on its own is worth 1 in 73.

The rebase landed as `1b99ee7a` → `4ec90394`, a forced update of one commit on `illodev/awesome-mcp-servers@add-workfile`. GitHub agreed within seconds: `mergeable` went `CONFLICTING` → `MERGEABLE`, and `mergeStateStatus` `DIRTY` → `UNSTABLE` → `CLEAN` once the checks re-ran. `check-submission` is `success` at 2026-09-07T15:04:52Z against the new commit, replacing the 2026-08-02T21:10:20Z result the nudge had been reading. `has-emoji`, `valid-name` and `has-glama` all survived, which is what the byte-identical entry text was for. The pull request diff is still `+1/-0` at `README.md:3095`.

Comment: https://github.com/punkpeye/awesome-mcp-servers/pull/11406#issuecomment-5572541490

The comment names the conflict rather than only confirming interest, because the nudge asserted "all checks pass" from a run that predated the conflict by eight days. Nothing here can close the criterion: the merge is still the maintainer's hand, and the branch is now in the state where his own history says that hand lands within about an hour of the resolving push.

One thing this leaves standing. The green `check-submission` was never evidence about mergeability, and reading it as such is what made the row look like it had no next action for 28 days. The signal that mattered was `mergeStateStatus`, which no bot on that repository surfaced for this pull request and which nothing here was watching.
