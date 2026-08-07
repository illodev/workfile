/**
 * The cards a branch touched, and what running their declared checks decided.
 *
 * T-0189, the `ci` tier of ADR-0016 — the only tier with a witness. `local` is a
 * command that ran on the author's machine and is still self-reported; this is
 * the same commands run somewhere the author does not control, recorded with the
 * run that ran them.
 *
 * ## What it will and will not close
 *
 * A criterion bound to a command is machine-owned: `card ac --check` refuses it
 * and only the runner writes it. A narrative criterion is not, and nothing here
 * can judge one — "the recut demo video reads correctly" is not a thing a runner
 * has an opinion about. So the rule is mechanical and it is the whole of the
 * safety here:
 *
 * **A card is closed by CI only when every one of its criteria is bound.**
 *
 * A card with one narrative criterion gets its bound boxes written and stays
 * open, which is not a failure — it is the run doing the part it can witness and
 * declining the part it cannot. A card with none of its criteria bound is not
 * touched at all: it declares no commands, so there is nothing to run.
 *
 * ## Why the close happens here and not in the job that pushes
 *
 * Every Workfile command loads the workspace, and loading the workspace
 * `import()`s `project.config.mjs` from the checkout. On a pull request that is
 * code the pull request wrote — see ADR-0019. So the job that runs card commands
 * must hold nothing, and the job that holds a write token must not run this. The
 * generated workflow splits them: this produces the finished card files and a
 * report, and a second job with no repository code in it commits the result.
 * `ci.ts` is where that split is written down.
 */

import { NotFoundError, ValidationError } from "../../core/errors.js";
import { normalizeRepoPath } from "../../core/glob.js";
import { ensureWritable } from "../../core/guards.js";
import { criterionOwners, parseAcceptance } from "./acceptance.js";
import { loadCards } from "./cards.js";
import { changedPaths } from "./git.js";
import { releaseCard } from "./mutations.js";
import { runCardVerification } from "./runner.js";
import type { VerifyRunReport } from "./runner.js";

/** What happened to one card in the run. */
export interface ChangedCardResult {
    id: string;
    file: string;
    /**
     * `verified` — every declared command passed.
     * `failed` — at least one decided against a criterion it owns.
     * `undecided` — a command reached no verdict: killed at the timeout, or
     *   never started because this machine has no such command.
     * `skipped` — the card declares no commands, so there was nothing to run.
     */
    outcome: "verified" | "failed" | "undecided" | "skipped";
    /** Absent for `skipped`, which never reached the runner. */
    report?: VerifyRunReport;
    /** Whether every criterion is bound, which is what CI may close. */
    fullyBound: boolean;
    /** Set when this run moved the card to `done`. */
    closed?: { commit: string | null; run: string | null };
    /** Why a card that passed was nevertheless left open. */
    heldOpen?: string;
}

export interface ChangedCardsReport {
    /** The ref the diff was taken against. */
    base: string;
    /**
     * False when git could not answer, in which case `cards` is empty and means
     * nothing. A caller that reports this as "no cards to verify" is reporting
     * the opposite of what happened.
     */
    resolved: boolean;
    /** Card files the branch touched, whether or not they declare commands. */
    touched: string[];
    cards: ChangedCardResult[];
    /** True when nothing failed and nothing was left undecided. */
    ok: boolean;
}

/**
 * Card ids, from the paths a diff reported.
 *
 * Composed from the configured directories rather than parsed out of the
 * filename. A card's name is derived from its title and `card renumber` exists,
 * so a path is not an id — and the two places cards live are declared values a
 * project may move. An archived card answers too: a branch that archived one
 * touched it.
 *
 * Matched by full path rather than by basename, because the archive holds files
 * whose names collide with live ones by design.
 */
function idsForPaths(
    workspace,
    cards,
    paths: string[]
): Array<{ id: string; file: string }> {
    const live = normalizeRepoPath(workspace.config.cards.path);
    const archive = normalizeRepoPath(workspace.config.cards.archivePath);
    const byPath = new Map<string, { id: string; file: string }>();
    for (const card of cards) {
        const directory = card.archived ? archive : live;
        byPath.set(`${directory}/${normalizeRepoPath(card.file)}`, {
            id: card.id,
            file: card.file
        });
    }
    const found: Array<{ id: string; file: string }> = [];
    const seen = new Set<string>();
    for (const path of paths) {
        const hit = byPath.get(normalizeRepoPath(path));
        if (!hit || seen.has(hit.id)) continue;
        seen.add(hit.id);
        found.push(hit);
    }
    return found.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Run the declared checks of every card this branch touched.
 *
 * `close` is opt-in, because writing `verified` is what the caller may not be
 * entitled to do — and because a run that only reports is the useful half on a
 * fork, where the write can never land anyway.
 */
export async function verifyChangedCards(
    workspace,
    {
        base,
        actor = null,
        close = false,
        run = null,
        commit,
        now
    }: {
        base: string;
        actor?: string | null;
        /** Move a fully-bound card that passed to `done`, with `method: ci`. */
        close?: boolean;
        /** The run that witnessed it, recorded on the card. */
        run?: string | null;
        /**
         * The commit the checks ran against.
         *
         * Absent, not null: `commitForClose` reads `undefined` as "resolve HEAD
         * yourself" and any other value — including `null` — as the answer. So
         * threading a `null` through from an unset CLI flag would record a card
         * closed at no commit, which is exactly the field criterion 2 of T-0189
         * asks for. Worth supplying explicitly all the same on a pull request,
         * where HEAD is a merge commit that exists on no branch.
         */
        commit?: string;
        now?: string | number | Date;
    }
): Promise<ChangedCardsReport> {
    // Before the diff rather than after: a read-only workspace can record
    // nothing these commands prove, and a run that spawns a test suite and then
    // finds that out has already spent the expensive part.
    ensureWritable(workspace);
    if (!base) {
        throw new ValidationError(
            "CARD_VERIFY_NO_BASE",
            "A base ref is required to know which cards this branch touched. " +
                "Pass `--base main`, or the pull request's base branch in CI."
        );
    }

    const paths = await changedPaths(workspace.root, base);
    if (paths === null) {
        // Reported, never treated as an empty diff. The two are opposite claims
        // and only one of them is safe to act on.
        return { base, resolved: false, touched: [], cards: [], ok: false };
    }

    // Archived cards come back from this too, which is wanted: a branch that
    // archived a card touched it, and the diff will say so.
    const { cards } = await loadCards(workspace);
    const touched = idsForPaths(workspace, cards, paths);
    const results: ChangedCardResult[] = [];

    for (const { id, file } of touched) {
        const card = cards.find((candidate) => candidate.id === id);
        const reading = parseAcceptance(card?.body || "");
        const owners = criterionOwners(reading, card?.verify);
        const fullyBound =
            reading.items.length > 0 && owners.size === reading.items.length;

        if (!(card?.verify as unknown[] | undefined)?.length) {
            results.push({ id, file, outcome: "skipped", fullyBound });
            continue;
        }

        let report: VerifyRunReport;
        try {
            report = await runCardVerification(workspace, id, { actor, now });
        } catch (error) {
            // A card that declares entries the allowlist refuses, or whose
            // bindings are stale, raises rather than returning a report. That is
            // a fact about the card and belongs in the report as one, not as a
            // crash that abandons every card after it in the list.
            if (error instanceof ValidationError || error instanceof NotFoundError) {
                results.push({
                    id,
                    file,
                    outcome: "failed",
                    fullyBound,
                    heldOpen: error.message
                });
                continue;
            }
            throw error;
        }

        const decided = report.entries.filter(
            (entry) => entry.outcome === "passed" || entry.outcome === "failed"
        );
        const outcome: ChangedCardResult["outcome"] = report.ok
            ? "verified"
            : decided.length === report.entries.length
              ? "failed"
              : "undecided";
        const result: ChangedCardResult = { id, file, outcome, report, fullyBound };

        if (outcome === "verified" && close) {
            if (card?.status === "done") {
                // Already closed, so there is nothing to record and the door
                // would refuse: a card that is done keeps the verification the
                // write that closed it recorded. Re-running the checks on a
                // branch that touches a closed card is ordinary — a second push
                // to the same pull request does it — so this is a normal state
                // and not a failure.
                result.heldOpen = "already done; the run that closed it keeps the record";
            } else if (!fullyBound) {
                // The honest half-answer: the boxes this run owns are written,
                // and the ones a person judges are left to the person.
                result.heldOpen =
                    `${reading.items.length - owners.size} of ${reading.items.length} ` +
                    "criteria are not bound to a command, so this run cannot say " +
                    "they are met";
            } else {
                try {
                    await releaseCard(workspace, id, {
                        status: "done",
                        actor,
                        method: "ci",
                        run,
                        commit,
                        now
                    });
                    result.closed = { commit: commit ?? null, run };
                } catch (error) {
                    // A refusal is a fact about this card — an area whose policy
                    // does not accept `ci`, a transition its status does not
                    // allow — and it must not abandon every card after it in the
                    // list. One card's policy is not the run's verdict.
                    if (error instanceof ValidationError) {
                        result.heldOpen = error.message;
                    } else {
                        throw error;
                    }
                }
            }
        }
        results.push(result);
    }

    return {
        base,
        resolved: true,
        touched: touched.map((entry) => entry.file),
        cards: results,
        ok: results.every(
            (entry) => entry.outcome === "verified" || entry.outcome === "skipped"
        )
    };
}
