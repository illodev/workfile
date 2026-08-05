/**
 * What `done` says about how it was proved.
 *
 * Per ADR-0016. Reaching `done` writes a `verified` block — `at`, `method`,
 * `commit`, `run` and `digest` — and the tiers carry more of the substance than
 * the digest does. `local` is a command that ran on the author's machine and
 * stays self-reported. `ci` has a witness anyone can open. `manual` is
 * legitimate for a criterion no command expresses, but it has to be labelled
 * rather than left indistinguishable from a green test. `forced` is what T-0184
 * made visible on the trail, given a field so it can be counted.
 *
 * Everything here is pure: text in, text out. The clock, the commit and the
 * actor all arrive as arguments, because the one thing this must not do is
 * decide any of them itself — a refusal has to be reachable before the write
 * that would have recorded it, and `mutations.ts` runs all of this under the
 * card lock ahead of `writeFileAtomic`.
 */

import { createHash } from "node:crypto";

import {
    REQUESTABLE_VERIFICATION_METHODS,
    VERIFICATION_METHODS
} from "../../config/defaults.js";
import { ValidationError } from "../../core/errors.js";
import { normalizeCriterion, parseAcceptance, verifyEntries } from "./acceptance.js";
import { COMMIT_SHA } from "./git.js";

// The two vocabularies moved to `config/defaults.ts` when T-0187 gave projects
// a policy over them: config validation refuses a method a project cannot
// declare, and it runs before any module loads. Re-exported from here because
// this is where the meaning lives and where every caller already imports them.
export { REQUESTABLE_VERIFICATION_METHODS, VERIFICATION_METHODS };

/** The fields of the block, in the order ADR-0016 draws them. */
export const VERIFIED_FIELDS = Object.freeze([
    "at",
    "method",
    "commit",
    "run",
    "digest"
] as const);

/** `sha256:` and 64 lowercase hex digits, the form `verified.digest` holds. */
export const VERIFIED_DIGEST = /^sha256:[0-9a-f]{64}$/;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** Code-unit order, so a digest computed on Windows matches one from Linux. */
function byCodeUnit(left: string, right: string): number {
    if (left < right) return -1;
    return left > right ? 1 : 0;
}

export interface VerifiedBlock {
    at: string;
    method: string;
    commit?: string;
    run?: string;
    digest: string;
}

/**
 * A digest of what the card claimed, and of what was bound to prove it.
 *
 * **Criteria region and `verify` block, and nothing else.** It cannot cover the
 * body: the transition that writes this appends a trail entry of its own, so a
 * whole-body digest would be invalidated by the very write that created it.
 *
 * It is taken over a canonical *reading* rather than over the region's raw
 * text, and that is what makes it stable rather than lucky. Appending to
 * `## Activity` goes through `appendUnderHeading`, which rebuilds the body from
 * `splitSections` and normalises blank lines between sections and trailing
 * whitespace inside them — so the bytes of the criteria region genuinely do move
 * when a trail entry lands two sections away. `parseAcceptance` plus
 * `normalizeCriterion` is blind to all of it.
 *
 * Sorted, deliberately. T-0185's whole argument is that reordering criteria is
 * harmless and only an edit should break a binding; a digest that fired on a
 * reorder would emit a warning the protocol elsewhere calls harmless. The
 * checkbox state is left out for the same reason: `doctor` already names an
 * unproven criterion on a done card, and a second warning about the same fact
 * is how doctor output stops being read.
 *
 * `v` is inside the hash so a future change to any of these rules is a visible
 * mismatch rather than a silent one.
 */
export function criteriaDigest({
    body = "",
    verify = null
}: { body?: string; verify?: unknown } = {}): string {
    const criteria = parseAcceptance(body)
        .items.map((item) => normalizeCriterion(item.text))
        .sort(byCodeUnit);
    const commands = verifyEntries(verify)
        .map((entry) => ({
            id: String(entry.id ?? ""),
            // Argument order is meaning, so this one is not sorted.
            run: (Array.isArray(entry.run) ? entry.run : [entry.run])
                .filter((part) => part != null)
                .map(String),
            criteria: [...(entry.criteria || [])].map(String).sort(byCodeUnit)
        }))
        .sort((left, right) => byCodeUnit(left.id, right.id));
    return `sha256:${createHash("sha256")
        .update(JSON.stringify({ v: 1, criteria, verify: commands }), "utf8")
        .digest("hex")}`;
}

/** What a resolved verification wants written, before the digest is taken. */
export interface VerificationIntent {
    fields: Record<string, string>;
    /** One line for `## Notes`, without its bullet, or `null`. */
    note: string | null;
}

function fail(code: string, message: string, details: unknown = null): never {
    throw new ValidationError(code, message, details);
}

/** `2026-08-05 10:12`, the stamp `## Notes` and the trail already share. */
function noteStamp(at: string): string {
    return at.slice(0, 16).replace("T", " ");
}

/**
 * The evidence line a verification leaves in the body.
 *
 * Prose stays in the body — that is ADR-0016's own decision, and the frontmatter
 * codec is one scalar per line, so anything longer than a line could not go
 * there without being mangled. `## Notes` is already where the reason for taking
 * over a claim goes.
 *
 * Collapsed to one line the same way `requireForceReason` collapses its reason,
 * because this text arrives over HTTP and MCP and a newline in it would append a
 * line the reader sees and `TRAIL_ENTRY` does not. The ` — ` separator is what
 * keeps it out of `TRAIL_ENTRY` altogether, so `doctor --fix` will not lift it
 * into `## Activity`.
 */
function evidenceNote(
    method: string,
    actor: string | null | undefined,
    evidence: string,
    at: string
): string {
    const text = String(evidence).trim().split(/\s+/).join(" ");
    return `${noteStamp(at)}Z${actor ? ` ${actor}` : ""} — ${method} verification: ${text}`;
}

/**
 * The block a close is going to write, or `null` when this write is not one.
 *
 * Every refusal here happens before any byte is written, and all of them are
 * `ValidationError` — 400 over HTTP, exit 1 on the CLI.
 *
 * The first refusal is the one this card would otherwise have shipped the
 * failure it names as its own justification: `--method ci` on a transition to
 * `review` has nowhere to go, and dropping it silently is precisely the shape an
 * agent cannot detect. It is the argument `COMMAND_FLAGS` already makes in the
 * binary, one layer down.
 */
export function resolveVerification({
    id,
    closing,
    waived = null,
    method,
    run,
    evidence,
    actor,
    commit = null,
    at
}: {
    id: string;
    closing: boolean;
    waived?: string | null;
    method?: string | null;
    run?: string | null;
    evidence?: string | null;
    actor?: string | null;
    commit?: string | null;
    at: string;
}): VerificationIntent | null {
    const requested = method == null || method === "" ? null : String(method);
    const witness = run == null || run === "" ? null : String(run).trim();
    const prose = evidence == null || evidence === "" ? null : String(evidence);

    if (!closing) {
        const supplied = [
            requested && "method",
            witness && "run",
            prose && "evidence"
        ].filter(Boolean) as string[];
        if (supplied.length) {
            fail(
                "CARD_VERIFICATION_NOT_APPLICABLE",
                `${supplied.join(", ")} ${supplied.length === 1 ? "describes" : "describe"} ` +
                    `how a card was proved, and this write does not move ${id} into done. ` +
                    `A card that is already done keeps the verification the write that closed it recorded.`,
                { id, supplied }
            );
        }
        return null;
    }

    if (requested === "forced") {
        fail(
            "CARD_VERIFICATION_METHOD_CONFLICT",
            `\`forced\` is not a method a caller asks for: it is what the record ` +
                `says when the acceptance gate was walked past. Pass force with a ` +
                `reason, and ${id} records it.`,
            { id, method: requested }
        );
    }
    if (waived && requested) {
        fail(
            "CARD_VERIFICATION_METHOD_CONFLICT",
            `${id} reaches done past ${waived}, so its method is \`forced\` and not ` +
                `\`${requested}\`. Drop the method; what was waived, and why, is already ` +
                `on the card's trail entry.`,
            { id, method: requested, waived }
        );
    }
    if (requested && !REQUESTABLE_VERIFICATION_METHODS.includes(requested as any)) {
        fail(
            "CARD_VERIFICATION_METHOD_INVALID",
            `Unknown verification method: ${requested}. Allowed: ` +
                `${REQUESTABLE_VERIFICATION_METHODS.join(", ")}.`,
            { id, value: requested, allowed: [...REQUESTABLE_VERIFICATION_METHODS] }
        );
    }

    // No method and nothing waived is `local`, which is exactly what a bare
    // `card transition ID done` asserts: a command ran somewhere, and the record
    // says who claims so rather than pretending to a witness. Demanding
    // `--method` on every close would break every existing call site and every
    // generated workflow to make an agent type the word for the assumption it
    // was already making. Requiring more than that is per-project policy, which
    // is T-0187's, not this card's.
    const resolved = waived ? "forced" : requested || "local";

    if (resolved === "ci" && !witness) {
        fail(
            "CARD_VERIFICATION_RUN_REQUIRED",
            `\`ci\` means a witness anyone can open, so ${id} needs the run's URL. ` +
                `Without it the record cannot be told apart from \`local\`.`,
            { id }
        );
    }
    if (resolved === "manual" && !prose?.trim()) {
        fail(
            "CARD_VERIFICATION_EVIDENCE_REQUIRED",
            `\`manual\` is a claim only a person can make, so ${id} needs the ` +
                `evidence in prose. It is written to the card's \`## Notes\`.`,
            { id }
        );
    }
    if (resolved === "manual" && !String(actor || "").trim()) {
        fail(
            "CARD_VERIFICATION_ACTOR_REQUIRED",
            `\`manual\` records that somebody looked, so ${id} needs to say who. ` +
                `Attribution is the whole of what this method is worth.`,
            { id }
        );
    }

    return {
        fields: {
            at,
            method: resolved,
            ...(commit && COMMIT_SHA.test(String(commit))
                ? { commit: String(commit) }
                : {}),
            ...(witness ? { run: witness } : {})
        },
        note: prose?.trim()
            ? evidenceNote(resolved, actor, prose, at)
            : null
    };
}

/**
 * What is wrong with a card's `verified` block, phrased for a reader.
 *
 * No mutation can produce any of these, so every one of them means the file was
 * edited by hand — or arrived as a file in somebody's diff, which is the case
 * that matters in a repository taking pull requests. Two of them are worse than
 * cosmetic: a block the codec reads as opaque, or one nested a level too deep,
 * makes the card unwritable, because `patchFrontmatter` refuses to rewrite an
 * opaque key *and* refuses to clear one — so reopening it fails as well.
 */
export function verifiedProblems(verified: unknown): string[] {
    if (verified == null || verified === "") return [];
    if (typeof verified !== "object" || Array.isArray(verified)) {
        return [
            "it is not a mapping — `verified` holds at, method, commit, run and " +
                "digest, one scalar each, indented one level"
        ];
    }
    const block = verified as Record<string, unknown>;
    const problems: string[] = [];
    const unknown = Object.keys(block).filter(
        (key) => !(VERIFIED_FIELDS as readonly string[]).includes(key)
    );
    if (unknown.length) {
        problems.push(
            `it carries ${unknown.join(", ")}, which the block does not define`
        );
    }
    if (!TIMESTAMP.test(String(block.at ?? ""))) {
        problems.push(`at is ${block.at ?? "missing"}, not an RFC 3339 UTC timestamp`);
    }
    if (!(VERIFICATION_METHODS as readonly string[]).includes(String(block.method))) {
        problems.push(
            `method is ${block.method ?? "missing"}, not one of ` +
                `${VERIFICATION_METHODS.join(", ")}`
        );
    }
    if (!VERIFIED_DIGEST.test(String(block.digest ?? ""))) {
        problems.push(`digest is ${block.digest ?? "missing"}, not a sha256 digest`);
    }
    if (block.commit != null && !COMMIT_SHA.test(String(block.commit))) {
        problems.push(`commit is ${block.commit}, which is not a commit sha`);
    }
    if (String(block.method) === "ci" && !String(block.run ?? "").trim()) {
        problems.push("method is ci but the block names no run to open");
    }
    return problems;
}

/** The commit a card was verified at, or `null` — never a value git will see. */
export function verifiedCommit(verified: unknown): string | null {
    if (!verified || typeof verified !== "object" || Array.isArray(verified)) {
        return null;
    }
    const commit = String((verified as Record<string, unknown>).commit ?? "");
    return COMMIT_SHA.test(commit) ? commit : null;
}
