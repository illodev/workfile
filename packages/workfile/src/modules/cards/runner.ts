/**
 * Running the commands a card declares, and writing down what they decided.
 *
 * T-0185 built the binding — a criterion can name the command that proves it,
 * and `card ac --check` refuses that criterion once it does — which left a
 * bound criterion as a criterion nothing could check. This is the only thing
 * that can: `setCardAcceptance` takes a `runner`, permits exactly the criteria
 * bound to that entry and refuses everything else, and this module is its one
 * caller. A second caller would be the hole one rung further in, reached by
 * declaring a `verify` entry instead of by typing `--check`.
 *
 * Three decisions the card asked for, settled here rather than left implicit.
 *
 * **The command is an argument vector and it is spawned with no shell.** That
 * is T-0188's decision and `argvElements` is where it is argued; this file is
 * what makes it true. `spawn(file, args)` hands the vector to the operating
 * system with nothing parsing it in between, so the array the allowlist matched
 * is the array the process receives.
 *
 * **Only a command that decided something writes a criterion.** Exit 0 checks
 * the criteria bound to the entry; a non-zero exit unchecks them, because a
 * proof that no longer reproduces is not a proof and leaving the box would let
 * `done` pass on it. A run that reached no decision — killed at the timeout, or
 * never started because the machine has no such command — writes nothing at
 * all. "We stopped waiting" and "pnpm is not installed here" are facts about
 * the run, not about the criterion, and the second one is not hypothetical: a
 * `.cmd` shim cannot be started without a shell, so on Windows the most
 * ordinary declared command in existence reaches exactly that branch. A rule
 * that unchecked there would let running `card verify` on the wrong machine
 * erase a proof a right one produced, and the criterion is machine-owned, so
 * `card ac --check` cannot put it back.
 *
 * **Every state change carries an actor.** The write goes through
 * `setCardAcceptance` with the entry id and a phrase, and the card's trail gets
 * a line naming the entry, the command and what moved. An untraced state change
 * is the failure mode T-0184 exists to prevent, and a box that changed because
 * a subprocess exited is the least visible one there is.
 *
 * There is no `--dry-run`, and that is a decision too: the flag is documented
 * as previewing filesystem changes, and a run that spawns every declared
 * command and then skips the write-back has already done the part worth
 * previewing. `card show ID --json` reports the `verify` block, which is what
 * looking first actually means here.
 */

import { spawn } from "node:child_process";

import { NotFoundError, ValidationError } from "../../core/errors.js";
import { ensureWritable } from "../../core/guards.js";
import { criterionOwners, parseAcceptance, verifyEntries } from "./acceptance.js";
import type { AcceptanceReading, VerifyEntry } from "./acceptance.js";
import { loadCards } from "./cards.js";
import { setCardAcceptance } from "./mutations.js";
import {
    allowedCommands,
    argvElements,
    commandAllowed,
    commandNotAllowedMessage,
    formatCommand,
    verifyTimeoutSeconds
} from "./validation.js";

/**
 * How much of each stream is kept, per entry.
 *
 * The tail rather than the head, because a test runner prints its failures
 * last and its banner first. Bounded at all because the report goes into
 * `--json` and into a server response, and an unbounded field there is a test
 * suite's whole log held in memory once per entry.
 */
const OUTPUT_LIMIT_BYTES = 64 * 1024;

/**
 * How long a command gets to exit after being asked to, before it is killed.
 *
 * A test runner that traps its termination signal to write a coverage report
 * deserves the chance; one that ignores it is why the second signal exists.
 * Only the child is reaped — the processes it started are not, because Node
 * offers no portable way to kill a process group, and saying otherwise in a
 * comment would be the more expensive kind of wrong.
 */
const KILL_GRACE_MS = 5_000;

/** What a command decided, or that it decided nothing. */
export type VerifyOutcome = "passed" | "failed" | "timed-out" | "errored";

export interface VerifyEntryResult {
    id: string;
    run: string[];
    outcome: VerifyOutcome;
    /** The exit status, or `null` when the command produced none. */
    code: number | null;
    /** The signal that ended it, which for `timed-out` is the one we sent. */
    signal: string | null;
    durationMs: number;
    /** Why there is no exit status — an OS error, or the timeout. */
    reason: string | null;
    stdout: string;
    stderr: string;
    /** Whether either stream was longer than what is reported above. */
    truncated: boolean;
    /** The criteria this entry proves, by index, as the card read them. */
    criteria: number[];
    checked: number[];
    unchecked: number[];
    /**
     * Why the write did not happen, when there was one to make.
     *
     * A run that took ten minutes must not lose its result to an unreported
     * exception, and the write can legitimately be refused: a criterion edited
     * while the commands were running is no longer bound to this entry, so
     * `setCardAcceptance` answers `CARD_ACCEPTANCE_NOT_BOUND` rather than
     * writing the wrong line. Recorded on the entry and reflected in `ok`.
     */
    writeError: { code: string; message: string } | null;
}

export interface VerifyRunReport {
    id: string;
    /** Whether every entry that ran passed and every write it wanted landed. */
    ok: boolean;
    entries: VerifyEntryResult[];
    /** The criteria as they stand after the writes. */
    acceptance: AcceptanceReading;
    timeoutSeconds: number;
}

interface CommandResult {
    outcome: VerifyOutcome;
    code: number | null;
    signal: string | null;
    reason: string | null;
    stdout: string;
    stderr: string;
    truncated: boolean;
    durationMs: number;
}

/**
 * The last `OUTPUT_LIMIT_BYTES` of a stream, discarding the rest as it arrives.
 *
 * Bounded while the command runs rather than trimmed at the end, because the
 * command whose output most needs bounding is the one printing megabytes a
 * second, and holding all of it to report the last 64 KiB is how a verify run
 * takes a machine down. Compacted at twice the limit instead of on every chunk:
 * a test runner emits thousands of small writes, and concatenating on each one
 * would be quadratic in their number.
 */
function tailSink() {
    let chunks: Buffer[] = [];
    let held = 0;
    let dropped = false;
    return {
        push(chunk: Buffer) {
            chunks.push(chunk);
            held += chunk.length;
            if (held <= OUTPUT_LIMIT_BYTES * 2) return;
            const whole = Buffer.concat(chunks);
            chunks = [whole.subarray(whole.length - OUTPUT_LIMIT_BYTES)];
            held = chunks[0].length;
            dropped = true;
        },
        read(): { text: string; truncated: boolean } {
            const whole = Buffer.concat(chunks);
            const kept =
                whole.length > OUTPUT_LIMIT_BYTES
                    ? whole.subarray(whole.length - OUTPUT_LIMIT_BYTES)
                    : whole;
            return {
                text: kept.toString("utf8"),
                truncated: dropped || kept.length < whole.length
            };
        }
    };
}

/**
 * One declared command, run to whatever end it reaches.
 *
 * `shell: false` is the whole design and is not an option this takes. `stdin`
 * is closed rather than inherited, for the reason `git.ts` sets
 * `GIT_TERMINAL_PROMPT=0`: a command that stops to ask a question would
 * otherwise wait for a terminal nobody is watching until the timeout, and
 * report as hung something that merely wanted an answer.
 *
 * Failure to spawn is an outcome rather than an exception, because it is
 * information the report has to carry — the caller needs to see which entry
 * could not start and why, not lose the other entries' results to a throw.
 */
export async function runVerifyCommand(
    argv: readonly string[],
    { cwd, timeoutSeconds }: { cwd: string; timeoutSeconds: number }
): Promise<CommandResult> {
    const started = Date.now();
    return await new Promise<CommandResult>((settle) => {
        const stdout = tailSink();
        const stderr = tailSink();
        let timedOut = false;
        let finished = false;
        let hardKill: NodeJS.Timeout | null = null;

        const child = spawn(argv[0], argv.slice(1), {
            cwd,
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            hardKill = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
            hardKill.unref?.();
        }, timeoutSeconds * 1000);
        // Neither timer should hold the event loop open on its own; the child
        // does that, and once it is gone there is nothing left to wait for.
        timer.unref?.();

        const done = (
            result: Omit<CommandResult, "stdout" | "stderr" | "truncated" | "durationMs">
        ) => {
            // A failed spawn emits `error` and then `close`, and the second
            // would report a null exit status as a failure. Guarded rather than
            // left to the promise settling once, so the rule is visible to
            // whoever adds the third listener.
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (hardKill) clearTimeout(hardKill);
            const out = stdout.read();
            const err = stderr.read();
            settle({
                ...result,
                stdout: out.text,
                stderr: err.text,
                truncated: out.truncated || err.truncated,
                durationMs: Date.now() - started
            });
        };

        child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
        child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

        child.on("error", (error: NodeJS.ErrnoException) => {
            // The OS code matters — `ENOENT` and `EACCES` are acted on
            // differently — and Node usually puts it in the message already, so
            // it is prepended only when it is missing rather than doubled.
            const message = String(error.message || error);
            const code = error.code || "";
            done({
                outcome: "errored",
                code: null,
                signal: null,
                reason: code && !message.includes(code) ? `${code}: ${message}` : message
            });
        });

        // `close` rather than `exit`, so the streams are drained before the
        // tail is taken. On `exit` the last chunk of a failing test's output —
        // the part naming what failed — is still in flight.
        child.on("close", (code, signal) => {
            if (timedOut) {
                return done({
                    outcome: "timed-out",
                    code,
                    signal,
                    reason: `killed after ${timeoutSeconds}s without exiting`
                });
            }
            done({
                outcome: code === 0 ? "passed" : "failed",
                code,
                signal,
                reason: null
            });
        });
    });
}

/**
 * The entries this run will execute, refused as a whole if any of them is one
 * the project does not permit.
 *
 * The whole block rather than only the selected entries, and that follows
 * `validateVerify`: a card carrying a command the project refuses is refused
 * every write until the block is cleared, and a run that quietly executed the
 * permitted half of such a card would be the one place the rule bent. `doctor`
 * already reports it as an error, so the card should not have landed.
 */
function selectEntries(
    workspace,
    id: string,
    declared: VerifyEntry[],
    only: string[] | null
): VerifyEntry[] {
    const allowed = allowedCommands(workspace);
    for (const entry of declared) {
        const argv = argvElements(entry.run);
        if (!argv) {
            throw new ValidationError(
                "CARD_VERIFY_RUN_INVALID",
                `Verify entry ${entry.id} on ${id} does not carry an argument ` +
                    `vector, so nothing can decide what it would run.`,
                { id, entry: entry.id, run: entry.run ?? null }
            );
        }
        if (!commandAllowed(allowed, argv)) {
            throw new ValidationError(
                "CARD_VERIFY_COMMAND_NOT_ALLOWED",
                commandNotAllowedMessage(entry.id, argv, allowed),
                { id, entry: entry.id, run: argv, declared: allowed }
            );
        }
    }
    if (!only) return declared;
    const known = new Set(declared.map((entry) => entry.id));
    const unknown = only.filter((wanted) => !known.has(wanted));
    if (unknown.length) {
        throw new ValidationError(
            "CARD_VERIFY_ENTRY_UNKNOWN",
            `${id} declares no verify ${unknown.length === 1 ? "entry" : "entries"} ` +
                `called ${unknown.join(", ")}. Declared: ${[...known].join(", ")}.`,
            { id, unknown, declared: [...known] }
        );
    }
    return declared.filter((entry) => only.includes(entry.id));
}

/** The phrase the trail carries, which says what happened and not what changed. */
function outcomePhrase(entry: VerifyEntry, result: CommandResult): string {
    const command = formatCommand(entry.run);
    if (result.outcome === "passed") return `${command} passed`;
    return `${command} failed (exit ${result.code ?? "none"})`;
}

/**
 * Runs a card's declared commands and writes down what they proved.
 *
 * The commands run outside the card lock, deliberately. They take minutes, and
 * a lock held across them would block every other write to the card — a note,
 * a claim, a status move — for as long as a test suite runs. The lock is taken
 * once per entry afterwards, for the write alone.
 *
 * That interval is real, so the criteria are addressed by *digest* rather than
 * by the indices read before the commands started: the card is read again after
 * the last command exits, and the owner map is built from that reading. A
 * criterion reworded in between is then no longer bound to the entry and the
 * write is refused by name rather than applied to whatever line moved into that
 * position.
 */
export async function runCardVerification(
    workspace,
    id: string,
    {
        only = null,
        actor = null,
        now
    }: {
        only?: string[] | null;
        actor?: string | null;
        now?: string | number | Date;
    } = {}
): Promise<VerifyRunReport> {
    // Before the first spawn rather than at the first write: a read-only
    // workspace cannot record anything these commands prove, and finding that
    // out after ten minutes of tests is the answer arriving too late to be
    // worth anything.
    ensureWritable(workspace);

    const located = async () => {
        const { cards } = await loadCards(workspace);
        const card = cards.find((candidate) => candidate.id === id);
        if (!card) throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
        return card;
    };

    const card = await located();
    const declared = verifyEntries(card.verify);
    if (!declared.length) {
        // Exiting 0 having run nothing would report a card as verified by
        // commands it does not declare, which is the silent no-op an agent
        // cannot detect.
        throw new ValidationError(
            "CARD_VERIFY_NONE_DECLARED",
            `${id} declares no verify entries, so there is nothing to run. ` +
                `Bind a criterion to a command with \`card patch ${id} --json-input\`.`,
            { id }
        );
    }
    const selected = selectEntries(workspace, id, declared, only);
    // No per-call override, deliberately. How long this project's commands may
    // take is a fact about the project, and a second way to say it would be a
    // second place for the answer to differ.
    const timeout = verifyTimeoutSeconds(workspace);

    // Sequentially. Two declared commands are usually two suites over one
    // working tree, and deciding that a project's own build is safe to run
    // twice at once is not this tool's decision to make on its behalf.
    const ran = new Map<string, CommandResult>();
    for (const entry of selected) {
        ran.set(
            entry.id,
            await runVerifyCommand(entry.run, { cwd: workspace.root, timeoutSeconds: timeout })
        );
    }

    // Read again, after the commands: the bindings that decide what each entry
    // may write are the ones on the card now, not the ones from before it ran.
    const after = await located();
    const reading = parseAcceptance(after.body || "");

    const entries: VerifyEntryResult[] = [];
    for (const entry of selected) {
        const result = ran.get(entry.id)!;
        // The same map `applyAcceptance` consults under the lock, built from
        // the same reading — which is what makes "the entry may write these and
        // no others" one rule rather than two that agree today.
        const owned = [...criterionOwners(reading, [entry]).keys()].sort(
            (left, right) => left - right
        );
        // Only an exit status is a decision, so only an exit status writes.
        const decided = result.outcome === "passed" || result.outcome === "failed";
        const wanted = decided ? owned : [];
        const checking = result.outcome === "passed";

        let changed: Array<{ index: number; checked: boolean }> = [];
        let writeError: VerifyEntryResult["writeError"] = null;
        if (wanted.length) {
            try {
                const written = await setCardAcceptance(workspace, id, {
                    check: checking ? wanted : [],
                    uncheck: checking ? [] : wanted,
                    runner: entry.id,
                    outcome: outcomePhrase(entry, result),
                    actor,
                    now
                });
                changed = written.changed;
            } catch (error: any) {
                writeError = {
                    code: String(error?.code || "CARD_ACCEPTANCE_WRITE_FAILED"),
                    message: String(error?.message || error)
                };
            }
        }

        entries.push({
            id: entry.id,
            run: [...entry.run],
            outcome: result.outcome,
            code: result.code,
            signal: result.signal,
            durationMs: result.durationMs,
            reason: result.reason,
            stdout: result.stdout,
            stderr: result.stderr,
            truncated: result.truncated,
            criteria: owned,
            checked: changed.filter((item) => item.checked).map((item) => item.index),
            unchecked: changed.filter((item) => !item.checked).map((item) => item.index),
            writeError
        });
    }

    const final = await located();
    return {
        id,
        ok: entries.every((entry) => entry.outcome === "passed" && !entry.writeError),
        entries,
        acceptance: parseAcceptance(final.body || ""),
        timeoutSeconds: timeout
    };
}
