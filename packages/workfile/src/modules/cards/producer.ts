import { readFile } from "node:fs/promises";

import { resolveSessionId } from "../../core/actor.js";
import { sessionPath } from "./claims.js";

/**
 * What produced a protocol write, beside who did it.
 *
 * The trail records an actor — `alvaro@local#bf4c5f67` — which says which human
 * and which session, and nothing about what did the work. Two cards closed a
 * day apart by the same actor may have been written by different models at
 * different reasoning budgets, and afterwards there is no telling them apart.
 * The point is the statistics: which model closes a card without it being
 * reopened, which one needs forcing past the gate, which one files the work it
 * discovered. None of it can be backfilled — the fact exists only at the moment
 * of the write (T-0209).
 *
 * Three decisions, all the owner's (2026-09-11):
 *
 * - **Beside the actor, never inside it.** Folding a model into the actor
 *   string would change every trail line's grammar and break the claim guard,
 *   which compares actors for equality. `claimed_by` is untouched by this
 *   file; a test proves it.
 * - **Self-declared, and the record says so.** A model name is an environment
 *   fact and an agent can set an environment variable to anything, so every
 *   block carries `basis: self-reported` — the same honesty `method: local`
 *   carries in ADR-0016. Nobody should read it as attested.
 * - **Written twice, for two readers.** On the trail line as `via:MODEL/REASONING`,
 *   because the trail is the history of who did what; and as `produced_by` in
 *   frontmatter, because a field can be counted over without parsing prose —
 *   at the cost of holding only the last writer.
 *
 * With nothing declared the record is byte-identical to today: no token on the
 * line, no field in the frontmatter.
 */
export interface Producer {
    /** The model, or `undeclared`. */
    model: string;
    /** The reasoning budget or effort level, or `undeclared`. */
    reasoning: string;
    /** Always `self-reported`: the record must not read as attested. */
    basis: "self-reported";
}

export const PRODUCER_BASIS = "self-reported";

/** Written when one half is declared and the other is not, so the absence is stated. */
export const UNDECLARED = "undeclared";

/**
 * What a declared value may look like: a label, not a payload.
 *
 * Sixty-four characters of a token alphabet. That is what keeps this field from
 * becoming a route for anything else — a prompt, a key, a path — into a record
 * that is committed to the repository. `/` is excluded because the trail token
 * uses it to separate model from reasoning.
 */
export const PRODUCER_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;

/**
 * Where each half comes from, most explicit first.
 *
 * `WORKFILE_*` is the caller naming itself outright. `ANTHROPIC_MODEL` is what
 * a Claude Code user sets to choose a model, and is visible to the processes
 * that session spawns. `CLAUDE_EFFORT` is documented: "the level is also
 * available to hook commands and the Bash tool as the `$CLAUDE_EFFORT`
 * environment variable"; `CLAUDE_CODE_EFFORT_LEVEL` is the input that sets it.
 * The session file is last: the Claude hook copies `model` off a `SessionStart`
 * payload when the host includes it, and `effort.level` off every tool call.
 */
const MODEL_ENVS = ["WORKFILE_MODEL", "ANTHROPIC_MODEL"];
const REASONING_ENVS = ["WORKFILE_REASONING", "CLAUDE_EFFORT", "CLAUDE_CODE_EFFORT_LEVEL"];

export interface ResolvedProducer {
    producer: Producer | undefined;
    /** Environment variables that were set and refused, by name, so a caller can say so. */
    ignored: string[];
}

export function producerToken(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed && PRODUCER_TOKEN.test(trimmed) ? trimmed : undefined;
}

function firstToken(
    env: Record<string, string | undefined>,
    names: string[],
    ignored: string[]
): string | undefined {
    for (const name of names) {
        const raw = env[name];
        if (typeof raw !== "string" || !raw.trim()) continue;
        const token = producerToken(raw);
        if (token) return token;
        ignored.push(name);
    }
    return undefined;
}

async function sessionHalves(workspace, sessionId: string | undefined) {
    if (!workspace || !sessionId) return { model: undefined, effort: undefined };
    try {
        const session = JSON.parse(
            await readFile(sessionPath(workspace, sessionId), "utf8")
        );
        return {
            model: producerToken(session?.model),
            effort: producerToken(session?.effort)
        };
    } catch {
        return { model: undefined, effort: undefined };
    }
}

/**
 * Resolve what produced this process's writes.
 *
 * `undefined` when nothing declares anything, which is what makes a workspace
 * with no declaration behave exactly as it did — and what makes the
 * frontmatter block the **last declared writer**: a write that declares
 * nothing puts no token on its trail line and leaves the block alone, so a
 * human's note after an agent's close does not erase which model closed it.
 * The trail line without a token is the record of that write. Never throws: a
 * producer that could fail a write would be the wrong trade for a statistic.
 */
export async function resolveProducer(
    workspace?,
    {
        env = process.env as Record<string, string | undefined>,
        sessionId
    }: { env?: Record<string, string | undefined>; sessionId?: string | null } = {}
): Promise<ResolvedProducer> {
    const ignored: string[] = [];
    let model = firstToken(env, MODEL_ENVS, ignored);
    let reasoning = firstToken(env, REASONING_ENVS, ignored);
    if (!model || !reasoning) {
        const halves = await sessionHalves(
            workspace,
            resolveSessionId({ sessionId: sessionId ?? undefined, env })
        );
        model = model ?? halves.model;
        reasoning = reasoning ?? halves.effort;
    }
    // Nothing declared, nothing written — unless something was declared and
    // refused. A writer that set a value the record cannot hold has said it is
    // something; the honest record of that write is `undeclared` on both
    // halves, not silence that leaves the previous writer's block standing as
    // if it had made this write too.
    if (!model && !reasoning && !ignored.length) return { producer: undefined, ignored };
    return {
        producer: {
            model: model ?? UNDECLARED,
            reasoning: reasoning ?? UNDECLARED,
            basis: PRODUCER_BASIS
        },
        ignored
    };
}

/**
 * The trail token: `via:MODEL/REASONING`, one `\S+` so every parser that reads
 * the actor as the word before the separator keeps working. The reasoning half
 * is dropped when undeclared; the model half is written even when undeclared,
 * so the token still says a producer was declared and what was not.
 */
export function producerTag(producer: Producer | undefined | null): string {
    if (!producer) return "";
    return producer.reasoning === UNDECLARED
        ? `via:${producer.model}`
        : `via:${producer.model}/${producer.reasoning}`;
}

/** What is wrong with a `produced_by` block that arrived by hand, if anything. */
export function producerProblems(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return ["produced_by must be a mapping"];
    }
    const block = value as Record<string, unknown>;
    const problems: string[] = [];
    for (const key of ["model", "reasoning"]) {
        if (!producerToken(block[key])) {
            problems.push(`${key} must be a label of at most 64 characters`);
        }
    }
    if (block.basis !== PRODUCER_BASIS) {
        problems.push(`basis must be "${PRODUCER_BASIS}"`);
    }
    for (const key of Object.keys(block)) {
        if (!["model", "reasoning", "basis"].includes(key)) {
            problems.push(`unknown key ${key}`);
        }
    }
    return problems;
}
