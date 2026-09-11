import { access, readdir, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { CARD_TITLE_MAX_LENGTH } from "../../config/defaults.js";
import { ValidationError } from "../../core/errors.js";
import {
    opaqueFrontmatterKeys,
    parseFrontmatter
} from "../../core/frontmatter.js";
import { readMarkdownTree } from "../../core/paths.js";
import { revisionForContent } from "../../core/revision.js";
import {
    parseAcceptance,
    staleBindings,
    unreadableCriteria,
    verifyEntries
} from "./acceptance.js";
import { byCodeUnit } from "../health/duplicates.js";
import { misplacedTrailEntries } from "./body.js";
import { claimState, readAgentSessions } from "./claims.js";
import { headCommit, isAncestorOfHead, isShallowRepository } from "./git.js";
import { cardFileName } from "./slug.js";
import {
    allowedCommands,
    argvElements,
    commandAllowed,
    commandNotAllowedMessage,
    axisDeclarations,
    formatCommand,
    verificationRefusal
} from "./validation.js";
import {
    criteriaDigest,
    verifiedCommit,
    verifiedProblems
} from "./verification.js";
import {
    isResourceExhaustion,
    mapWithConcurrency
} from "../../core/concurrency.js";
import {
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES
} from "../../config/defaults.js";
import { producerProblems } from "./producer.js";

/**
 * The first day `raised` could be answered, so the rule below can be quiet about
 * every card filed before it.
 *
 * A date rather than a config value: a project does not get to choose when this
 * field became available in the package it installed, and a knob here would only
 * be used to switch the rule off — which `doctor --severity` and the baseline
 * already do, per project, with a record of the decision.
 */
const RAISED_EXPECTED_FROM = "2026-08-08";

export const CARD_LIST_KEYS = new Set([
    "tags",
    "depends",
    "scope",
    "related",
    "origin"
]);
export const CARD_REQUIRED_KEYS = Object.freeze([
    "id",
    "title",
    "status",
    "type",
    "priority",
    "area",
    "created",
    "updated"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** Work that is over: nothing about it is worth prompting anyone to change. */
const CLOSED_STATUSES = new Set(["done", "discarded"]);

function closed(card) {
    return card.archived || CLOSED_STATUSES.has(card.status);
}

export function cardIdPattern(prefix = "T") {
    return new RegExp(`^${escapeRegExp(prefix)}-\\d{4,}$`);
}

export function parseCard(fileName, content, archived = false): any {
    const parsed = parseFrontmatter(content, { listKeys: CARD_LIST_KEYS });
    if (!parsed) return null;
    const opaque = opaqueFrontmatterKeys(parsed);
    return {
        file: fileName,
        archived,
        body: parsed.body.trim(),
        ...parsed.metadata,
        ...(opaque.length ? { frontmatterOpaque: opaque } : {})
    };
}

/**
 * Load every card below `directory`, at any depth.
 *
 * `file` is the path relative to `directory` (`epics/T-0042-slug.md`), so cards
 * can be grouped in folders created by hand and `join(directory, card.file)`
 * still addresses the file.
 *
 * `skip` excludes nested directories — the card archive lives inside the card
 * directory by default, and must not be loaded twice.
 */
export async function loadCardDirectory(
    directory,
    archived = false,
    { skip = [] }: any = {}
) {
    const files = await readMarkdownTree(directory, { skip });
    const results = await mapWithConcurrency(files, async (file) => {
        try {
            const content = await readFile(join(directory, file), "utf8");
            const card = parseCard(file, content, archived);
            // The one field a loaded card cannot be missing. Every other absent
            // field is doctor's business — the card loads and the report names
            // it — but `buildProjectIndex` sorts every record on `id`, so a
            // hand-edited card with no `id:` line threw out of the sort after
            // every file had been read, killing the whole load and with it
            // doctor, the server and every command, naming neither the file nor
            // the field. A bare `id:` parses to no key at all and `id: ""` to
            // the empty string; neither sorts. Refused here, where the same
            // `catch` already puts every other malformed card: `unreadable`,
            // with its path, and the rest of the directory still loads.
            if (card && typeof card.id !== "string") {
                throw new ValidationError(
                    "CARD_ID_REQUIRED",
                    `Card has no id: ${file}`
                );
            }
            if (card && !card.id.trim()) {
                throw new ValidationError(
                    "CARD_ID_REQUIRED",
                    `Card has an empty id: ${file}`
                );
            }
            return {
                file,
                card: card
                    ? { ...card, revision: revisionForContent(content) }
                    : null
            };
        } catch (error) {
            // Running out of descriptors is not a broken record: degrading it
            // to `unreadable` returned a short index that nothing checks.
            if (isResourceExhaustion(error)) throw error;
            return { file, error };
        }
    });
    return {
        cards: results.filter((entry) => entry.card).map((entry) => entry.card),
        unreadable: results
            .filter((entry) => !entry.card)
            .map((entry) => ({
                file: entry.file,
                reason: entry.error?.message || "frontmatter not found"
            }))
    };
}

async function loadCardAssets(directory, idPattern) {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        return new Map();
    }
    const assets = new Map();
    await Promise.all(
        entries
            .filter((entry) => entry.isDirectory() && idPattern.test(entry.name))
            .map(async (entry) => {
                try {
                    const files = (await readdir(join(directory, entry.name), {
                        withFileTypes: true
                    }))
                        .filter((file) => file.isFile())
                        .map((file) => file.name)
                        .sort();
                    assets.set(entry.name, files);
                } catch {
                    assets.set(entry.name, []);
                }
            })
    );
    return assets;
}

export async function loadCards(workspace) {
    const [live, archived, assets] = await Promise.all([
        loadCardDirectory(workspace.paths.cards, false, {
            skip: [workspace.paths.cardArchive]
        }),
        loadCardDirectory(workspace.paths.cardArchive, true),
        loadCardAssets(
            workspace.paths.assets,
            cardIdPattern(workspace.config.cards.idPrefix)
        )
    ]);
    const cards = [...live.cards, ...archived.cards];
    for (const card of cards) card.assets = assets.get(card.id) || [];
    return {
        cards,
        unreadable: [...live.unreadable, ...archived.unreadable]
    };
}

function issue(
    severity,
    code,
    card,
    message,
    details: Record<string, unknown> | null = null
) {
    return {
        severity,
        code,
        id: card?.id || null,
        file: card?.file || null,
        archived: Boolean(card?.archived),
        message,
        ...(details ? { details } : {})
    };
}

function hierarchyDepth(card, byId) {
    let current = card;
    let depth = 0;
    const seen = new Set();
    while (current?.parent) {
        if (seen.has(current.id)) return { depth, cycle: true };
        seen.add(current.id);
        depth += 1;
        current = byId.get(current.parent);
        if (!current) break;
    }
    return { depth, cycle: false };
}

/**
 * Statuses at which a card will not move again on its own. Wider than
 * `CLOSED_STATUSES` on purpose, and only for the rule below: to the card
 * *above* it, a child in `review` or `deferred` is as final as one `done` —
 * none of the three will ever trigger anything on the parent. What they are
 * not is delivered, and the finding says that separately. Measured on a
 * 2 228-card board: with `CLOSED_STATUSES` instead, a parent with 3 `done`
 * and 6 `review` descendants would not have been found.
 */
const RESTING_STATUSES = new Set(["done", "review", "discarded", "deferred"]);

/** Work that exists. `discarded` and `deferred` are not it. */
const DELIVERED_STATUSES = new Set(["done", "review"]);

/** How a child's note says its work went somewhere else. */
const DEDUP_HINT = /duplica|dedup|supersed/i;

/**
 * One `## Notes` entry: `- YYYY-MM-DD HH:MMZ actor — text`. The actor is
 * optional because `appendCardNote` omits it when none was resolved, and a
 * note without one is still a judgement somebody wrote.
 */
// The optional second token is the producer (`via:MODEL/REASONING`, T-0209).
const NOTE_ENTRY = /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}Z)(?: \S+)?(?: via:\S+)? — /;

function resting(card) {
    return card.archived || RESTING_STATUSES.has(card.status);
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every card below `id`, at any depth. `seen` is the belt against `parent-cycle`. */
function descendantsOf(id, children, seen = new Set()) {
    const found: any[] = [];
    for (const child of children.get(id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        found.push(child, ...descendantsOf(child.id, children, seen));
    }
    return found;
}

/**
 * When somebody last wrote a judgement on the card. `updated` is not that:
 * `patchFrontmatter` stamps it on every write, so a machine touching a child
 * moves it. The last entry under `## Notes` is the exact signal.
 *
 * Read from the *last* `## Notes` heading to the end, because a note can carry
 * `##` headings of its own; cut at `## Activity`, whose entries are stamped
 * the same way and are transitions, not judgements.
 */
function lastNoteStamp(body: string) {
    const lines = body.split("\n");
    const heading = lines.lastIndexOf("## Notes");
    if (heading === -1) return null;
    let stamp: string | null = null;
    for (const line of lines.slice(heading + 1)) {
        if (line === "## Activity") break;
        const match = line.match(NOTE_ENTRY);
        if (match) stamp = match[1];
    }
    return stamp;
}

/**
 * The cards a discarded child's own note names as where its work went.
 * Excludes the child (a note cites itself) and its parent (context, not a
 * destination).
 */
function twinsNamedBy(child, idRe: RegExp) {
    const ids = new Set<string>();
    for (const line of (child.body || "").split("\n")) {
        if (!DEDUP_HINT.test(line)) continue;
        for (const [id] of line.matchAll(idRe)) {
            if (id !== child.id && id !== child.parent) ids.add(id);
        }
    }
    return [...ids];
}

/**
 * Words a title can drop without changing what it claims. Spanish and English,
 * because those are the two languages the boards this was measured on are
 * written in; a word in neither list is content.
 */
const TITLE_STOPWORDS = new Set([
    "a", "al", "como", "con", "de", "del", "el", "en", "es", "la", "las", "lo",
    "los", "o", "para", "por", "que", "se", "sin", "su", "un", "una", "y",
    "an", "and", "as", "at", "be", "by", "for", "from", "in", "is", "it", "its",
    "no", "not", "of", "on", "or", "that", "the", "this", "to", "with"
]);

/**
 * The content words of a title: lower-cased, accents stripped, punctuation
 * gone, stopwords dropped. "Añadir acción de domiciliar en el menú de la
 * factura" and "Anadir accion 'Domiciliar factura' al menu de la factura" —
 * a real pair, filed a day apart under two parents — reduce to the same set.
 */
function titleTokens(title: string): Set<string> {
    const flat = title
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    return new Set(flat.split(" ").filter((word) => word && !TITLE_STOPWORDS.has(word)));
}

/** Filed later, by `created` and then by ID in code-unit order. */
function filedAfter(card, other) {
    const left = String(card.created || "");
    const right = String(other.created || "");
    if (left !== right) return left > right;
    return byCodeUnit(String(card.id), String(other.id)) > 0;
}

async function pathExists(repoRoot, repoPath) {
    if (!repoPath || isAbsolute(repoPath)) return false;
    const absolute = resolve(repoRoot, repoPath);
    const inside = relative(repoRoot, absolute);
    if (inside.startsWith("..") || isAbsolute(inside)) return false;
    try {
        await access(absolute);
        return true;
    } catch {
        return false;
    }
}

/**
 * `knownIds` is every project record ID, not every card ID.
 *
 * `origin` accepts any record kind — ADR-0005 spawned two cards, and four cards
 * cite an LRN — so the set this rule resolves against is wider than the one
 * `missing-parent` and `missing-dependency` use, and this module cannot build
 * it: it is handed cards. Absent, the rule stays quiet rather than reporting
 * every non-card origin as dangling, which is the same bargain `checkPaths`
 * makes for `missing-source`.
 */
export async function diagnoseCards({
    cards,
    unreadable = [],
    workspace,
    checkPaths = true,
    // Whether ancestry may be answered by spawning git. On by default and off
    // in the unit tests that hand this a fabricated workspace — but see the
    // short circuit below, which is what actually keeps the common case free.
    checkGit = true,
    // Annotated through the default rather than on the destructure: `null`
    // alone infers `never`, so every `knownIds.has(...)` below becomes an
    // error — but annotating the whole parameter `any` silences two unrelated
    // baseline errors this file is still carrying, which the ratchet reads as
    // progress that nobody made.
    knownIds = null as Set<string> | null,
    now = new Date()
}) {
    const issues = unreadable.map((entry) =>
        issue(
            "error",
            "unreadable-card",
            { file: entry.file },
            `Cannot read card: ${entry.reason}`
        )
    );
    const cardsById = new Map();
    for (const card of cards) {
        if (!cardsById.has(card.id)) cardsById.set(card.id, []);
        cardsById.get(card.id).push(card);
    }
    const byId = new Map(
        [...cardsById]
            .filter(([, matches]) => matches.length === 1)
            .map(([id, matches]) => [id, matches[0]])
    );
    for (const [id, matches] of cardsById) {
        if (id && matches.length > 1) {
            issues.push(
                issue(
                    "error",
                    "duplicate-id",
                    matches[0],
                    `${id} appears in ${matches.length} files`
                )
            );
        }
    }
    const enums = {
        status: CARD_STATUSES,
        type: CARD_TYPES,
        priority: CARD_PRIORITIES,
        area: workspace.config.cards.areas,
        effort: CARD_EFFORTS
    };
    const axes = axisDeclarations(workspace);
    const allowed = allowedCommands(workspace);
    const idRe = cardIdPattern(workspace.config.cards.idPrefix);
    for (const card of cards) {
        const missing = CARD_REQUIRED_KEYS.filter((key) => !card[key]);
        if (missing.length) {
            issues.push(
                issue(
                    "error",
                    "missing-required",
                    card,
                    `Missing required fields: ${missing.join(", ")}`
                )
            );
        }
        if (card.id && !idRe.test(card.id)) {
            issues.push(issue("error", "invalid-id", card, `Invalid card id: ${card.id}`));
        }
        if (card.id && !basename(card.file || "").startsWith(`${card.id}-`)) {
            issues.push(
                issue(
                    "error",
                    "filename-mismatch",
                    card,
                    `Filename must start with ${card.id}-`
                )
            );
        }
        // The stale-filename rule used to sit here, and it only ever covered
        // cards. It moved to `health/filenames.ts`, which is the layer that
        // holds every kind: memory records, managed documents and unreleased
        // changelog fragments derive their names from their titles identically
        // and had no rule at all (T-0223). The same argument
        // `duplicate-record-id` makes — a module sees one kind, and this
        // question is about all of them.
        /**
         * A card that does not say whether a person asked for it.
         *
         * `warning`, not `error`, because it is a fact about how the card was
         * filed and not a defect in the record — and because the repair is a
         * judgement only the filer can make.
         *
         * Bounded by date, and that is the part the card did not settle. Every
         * card written before the field existed carries none, and this repository
         * alone holds 223 of them; reporting all of them would drown the doctor
         * on the day the field shipped and teach everyone to ignore the rule.
         * Backfilling is not available either — guessing which of them were
         * reported would reproduce the exact error that prompted T-0210. So the
         * rule speaks about cards filed from the day it could be answered, and
         * says nothing about the ones that could not.
         */
        if (
            !card.raised &&
            String(card.created || "") >= RAISED_EXPECTED_FROM &&
            !card.archived
        ) {
            issues.push(
                issue(
                    "warning",
                    "raised-missing",
                    card,
                    "Does not say whether a person reported it or it was derived; " +
                        "set `raised: reported` or `raised: derived`"
                )
            );
        }
        if ((card.title || "").length > CARD_TITLE_MAX_LENGTH) {
            issues.push(
                issue(
                    "warning",
                    "long-title",
                    card,
                    `Title has ${card.title.length} characters; the maximum is ${CARD_TITLE_MAX_LENGTH}`
                )
            );
        }
        for (const [key, allowed] of Object.entries(enums)) {
            if (card[key] && !allowed.includes(card[key])) {
                issues.push(
                    issue("error", "invalid-enum", card, `Invalid ${key}: ${card[key]}`)
                );
            }
        }
        for (const { name: axis, values: allowed, required } of axes) {
            const value = card[axis];
            if (value && !allowed.includes(value)) {
                // An error, because it is a typo that matches nothing: the
                // whole point of declaring an axis is that `context: tresury`
                // stops being written and silently filtering to an empty set.
                issues.push(
                    issue(
                        "error",
                        "invalid-axis",
                        card,
                        `Invalid ${axis}: ${value}. Declared values: ${allowed.join(", ")}`,
                        { axis, value, allowed }
                    )
                );
            } else if (!value && required && !closed(card)) {
                // A warning, and only on work still in play. Declaring an axis
                // on an existing repository must not turn it red — but a
                // warning per record floods just as badly in yellow: this
                // repository would have emitted one for each of its hundred-odd
                // closed cards, and nobody classifies finished work
                // retroactively. Doctor output that nobody can act on is
                // output nobody reads.
                //
                // And only when the project asked for it. "Open" is this
                // module's `closed()`, and on a board where `review` is where
                // work rests that definition flooded: 1 487 of 2 018 warnings
                // for one axis (T-0231). `required: false` is how such a
                // project keeps the vocabulary and the filter without the line.
                issues.push(
                    issue(
                        "warning",
                        "missing-axis",
                        card,
                        `No ${axis}; declared values: ${allowed.join(", ")}`,
                        { axis, allowed }
                    )
                );
            }
        }
        for (const key of ["created", "updated", "start", "due"]) {
            if (card[key] && !DATE_RE.test(card[key])) {
                issues.push(
                    issue("error", "invalid-date", card, `${key} must use YYYY-MM-DD`)
                );
            }
        }
        if (card.claimed_at && DATE_RE.test(card.claimed_at)) {
            issues.push(
                issue(
                    "warning",
                    "legacy-claim-date",
                    card,
                    "claimed_at uses the v1 date format; migrate it to RFC 3339 UTC when the card is next claimed"
                )
            );
        } else if (card.claimed_at && !TIMESTAMP_RE.test(card.claimed_at)) {
            issues.push(
                issue(
                    "error",
                    "invalid-timestamp",
                    card,
                    "claimed_at must use RFC 3339 UTC"
                )
            );
        }
        if (card.start && card.due && card.start > card.due) {
            issues.push(
                issue(
                    "error",
                    "invalid-date-range",
                    card,
                    `Start ${card.start} is after due ${card.due}`
                )
            );
        }
        if (card.parent && !byId.has(card.parent)) {
            issues.push(
                issue("error", "missing-parent", card, `Parent ${card.parent} does not exist`)
            );
        }
        if (card.parent === card.id) {
            issues.push(issue("error", "self-parent", card, "Card cannot parent itself"));
        }
        for (const dependency of card.depends || []) {
            if (!byId.has(dependency)) {
                issues.push(
                    issue(
                        "error",
                        "missing-dependency",
                        card,
                        `Dependency ${dependency} does not exist`
                    )
                );
            }
            if (dependency === card.id) {
                issues.push(
                    issue("error", "self-dependency", card, "Card cannot depend on itself")
                );
            }
        }
        for (const source of card.origin || []) {
            if (source === card.id) {
                issues.push(
                    issue("error", "self-origin", card, "Card cannot originate from itself")
                );
            } else if (knownIds && !knownIds.has(source)) {
                // A warning where `missing-parent` is an error, and the
                // difference is what breaks. A dangling parent corrupts the
                // hierarchy depth every other card is measured against, and a
                // dangling dependency makes unblocked work look blocked;
                // nothing computes on `origin`, so what a dangling one costs is
                // one missing edge in a graph nobody is blocked by. It still
                // has to be reported: the value replaces prose that named IDs
                // freely, so a typo here reads exactly like a real provenance
                // and would otherwise go on looking like one forever.
                issues.push(
                    issue(
                        "warning",
                        "missing-origin",
                        card,
                        `Origin ${source} does not resolve to any project record`
                    )
                );
            }
        }
        // Written by the protocol, in the wrong place, by the protocol. A
        // warning rather than an error because nothing downstream computes on
        // the trail — but it is unreadable where it landed, and invisible to
        // the reader who would otherwise notice, so it has to be said.
        const stray = misplacedTrailEntries(card.body);
        if (stray.length) {
            issues.push(
                issue(
                    "warning",
                    "misplaced-trail",
                    card,
                    `${stray.length} trail ${
                        stray.length === 1 ? "entry is" : "entries are"
                    } outside \`## Activity\`. Run \`workfile doctor --fix\`.`
                )
            );
        }
        const hierarchy = hierarchyDepth(card, byId);
        if (hierarchy.cycle) {
            issues.push(
                issue("error", "parent-cycle", card, "Parent hierarchy has a cycle")
            );
        } else if (hierarchy.depth > workspace.config.cards.maxHierarchyDepth) {
            issues.push(
                issue(
                    "error",
                    "hierarchy-depth",
                    card,
                    `Hierarchy depth is ${hierarchy.depth}; maximum is ${workspace.config.cards.maxHierarchyDepth}`
                )
            );
        }
        // A `produced_by` block the protocol did not write. Nothing in the
        // protocol can write a malformed one, so it means a hand edit — and a
        // block that does not read as a producer defeats the one thing the
        // field exists for, which is being counted over (T-0209).
        if (card.produced_by !== undefined) {
            const problems = producerProblems(card.produced_by);
            if (problems.length) {
                issues.push(
                    issue(
                        "warning",
                        "produced-by-invalid",
                        card,
                        `The produced_by block does not read as a producer: ${problems.join("; ")}.`,
                        { problems }
                    )
                );
            }
        }
        const hasClaim = Boolean(card.claimed_by);
        const hasClaimDate = Boolean(card.claimed_at);
        if (hasClaim !== hasClaimDate) {
            issues.push(
                issue(
                    "warning",
                    "partial-claim",
                    card,
                    "claimed_by and claimed_at must be set or cleared together"
                )
            );
        }
        if (hasClaim && card.status !== "doing") {
            issues.push(
                issue(
                    "warning",
                    "claim-status",
                    card,
                    `Claimed card has status ${card.status}, expected doing`
                )
            );
        }
        if (card.archived && !["done", "discarded"].includes(card.status)) {
            issues.push(
                issue(
                    "error",
                    "open-archived",
                    card,
                    `Archived card has open status ${card.status}`
                )
            );
        }
        // Naming them is the difference between a number to dismiss and a
        // list to work through. The count alone told a reviewer that something
        // was unproven but never which thing, so the only way to act on it was
        // to open the card and read.
        const reading = parseAcceptance(card.body);
        // Reported at any status, not only at `done`. The point of the check is
        // that the card is carrying criteria nothing can see, and the moment
        // worth saying so is while there is still time to fix the heading —
        // by `done` the gate has already refused, or already let it through on
        // the version of this repository that shipped before it existed.
        const unreadable = card.archived ? [] : unreadableCriteria(reading);
        if (unreadable.length) {
            issues.push(
                issue(
                    "warning",
                    "acceptance-unreadable",
                    card,
                    `Card has ${unreadable.length} unchecked checklist ` +
                        `${unreadable.length === 1 ? "item" : "items"} under no ` +
                        `heading the acceptance reader recognises: ` +
                        unreadable.map((item) => item.text).join("; "),
                    { unreadable: unreadable.map(({ text }) => ({ text })) }
                )
            );
        }
        // `review` reached with nothing proved.
        //
        // `review` means "finished, only runtime evidence missing". A turn that
        // ends with work still inside the card is supposed to leave it in
        // `next` or `blocked` with the reason written. Both exits write the
        // same word today if nobody enforces the difference, and then the board
        // cannot answer which one happened: measured in a consuming repository,
        // 181 of 249 cards in `review` had been put there by automated agents
        // with a seven-minute median between claim and review, and telling the
        // finished ones from the abandoned ones cost an audit of the board.
        //
        // The discriminator is deliberately blunt: **not one** criterion met.
        // A card that is genuinely waiting on runtime has its work ticked and
        // one or two evidence boxes open; a card nobody worked has none. The
        // blunt version is what keeps this off the flood list that T-0231 is
        // about — measured over a real 245-card `review` column: 71% have every
        // criterion met, 19% are partial, and **2% are zero**. Warning on the
        // partials would have meant 21% of the column, most of it correct.
        //
        // A warning, not an error, and reported at `review` only. The card is
        // not malformed; what is wrong is that its state claims something its
        // own criteria contradict. Erroring would turn the pipeline red on a
        // judgement call, and the judgement belongs to whoever reads it.
        if (
            card.status === "review" &&
            !card.archived &&
            reading.items.length > 0 &&
            reading.items.every((item) => !item.checked)
        ) {
            issues.push(
                issue(
                    "warning",
                    "review-with-nothing-met",
                    card,
                    `Card is in \`review\` with none of its ` +
                        `${reading.items.length} acceptance ` +
                        `${reading.items.length === 1 ? "criterion" : "criteria"} met. ` +
                        `\`review\` means the work is finished and only runtime evidence ` +
                        `is missing; a turn that ended with work still inside the card ` +
                        `belongs in \`next\` or \`blocked\` with the reason in a note. ` +
                        `Mark what is done, or move it back and say what is left.`,
                    { criteria: reading.items.length }
                )
            );
        }
        // A binding names the text it proves, so text that no longer exists
        // means the criterion was reworded or replaced after the command was
        // bound to it. Reported rather than repaired: the two look identical
        // from here and only the author knows which happened. This is the whole
        // reason the binding is a hash and not an index.
        const stale = staleBindings(reading, card.verify);
        if (stale.length) {
            issues.push(
                issue(
                    "warning",
                    "verify-binding-stale",
                    card,
                    `Card has ${stale.length} verify ` +
                        `${stale.length === 1 ? "binding" : "bindings"} pointing at ` +
                        `text no criterion carries any more: ` +
                        stale
                            .map((binding) => `${binding.entry} → ${binding.digest}`)
                            .join("; "),
                    { bindings: stale }
                )
            );
        }
        // The same allowlist the write path enforces, checked again on read.
        //
        // This is the half that reaches a card nobody wrote through the
        // protocol. A card is a Markdown file, so in a repository that takes
        // pull requests one arrives as a *file in a diff*: it never calls
        // `createCard` or `patchCard`, and a write-time refusal never runs. The
        // gate that turns that pull request red is this one, because `doctor
        // --json` is what the generated CI workflow exists to run and `ok` is
        // false while any error stands.
        //
        // `error` rather than `warning` for exactly that reason. A warning
        // would let the case this rule was written for merge green, and there
        // is no adoption cost to weigh against it: a repository that declares
        // no commands also has no cards carrying one.
        for (const entry of verifyEntries(card.verify)) {
            const argv = argvElements(entry.run);
            if (!argv) {
                issues.push(
                    issue(
                        "error",
                        "verify-run-invalid",
                        card,
                        `Verify entry ${entry.id} does not carry an argument vector, ` +
                            `so nothing can decide what it would run.`,
                        { entry: entry.id }
                    )
                );
                continue;
            }
            if (!commandAllowed(allowed, argv)) {
                issues.push(
                    issue(
                        "error",
                        "verify-command-not-allowed",
                        card,
                        commandNotAllowedMessage(entry.id, argv, allowed),
                        {
                            entry: entry.id,
                            run: formatCommand(argv),
                            declared: allowed.map(formatCommand)
                        }
                    )
                );
            }
        }
        const pending = reading.unchecked;
        if (card.status === "done" && pending.length) {
            issues.push(
                issue(
                    "warning",
                    "done-unchecked",
                    card,
                    `Done card has ${pending.length} unproven acceptance criteria: ` +
                        pending.map((item) => `#${item.index} ${item.text}`).join("; "),
                    { unchecked: pending.map(({ index, text }) => ({ index, text })) }
                )
            );
        }
        // No mutation can produce a malformed block, so one means the file was
        // hand-edited or arrived as a file in somebody's diff. Worth a line of
        // its own because the damage is not cosmetic: a `verified` the codec
        // reads as opaque cannot be rewritten *or cleared*, so the card can no
        // longer be reopened either, and the refusal names the codec rather
        // than the edit that caused it.
        const malformed = verifiedProblems(card.verified);
        if (malformed.length) {
            issues.push(
                issue(
                    "warning",
                    "verified-block-invalid",
                    card,
                    `The verified block does not read as a verification: ` +
                        `${malformed.join("; ")}.`,
                    { problems: malformed }
                )
            );
        } else if (card.verified?.digest) {
            // Reported, never enforced retroactively. A card verified against
            // text that has since changed is information; invalidating history
            // every time somebody touches the scope again would make the field
            // noise, and nobody would read it.
            //
            // Archived cards included. Editing the criteria of work that is
            // filed away is a stranger act than editing a live card's, not a
            // more forgivable one, and the check costs nothing but a hash.
            const actual = criteriaDigest({
                body: card.body,
                verify: card.verify
            });
            if (actual !== card.verified.digest) {
                issues.push(
                    issue(
                        "warning",
                        "verified-criteria-changed",
                        card,
                        `Verified on ${card.verified.at} as ` +
                            `${card.verified.method}, against criteria text that ` +
                            `has since changed.`,
                        {
                            verifiedAt: card.verified.at,
                            method: card.verified.method,
                            recorded: card.verified.digest,
                            actual
                        }
                    )
                );
            }
        }
        // A policy can tighten after a card closes, and this is where that
        // shows up. Reported, never enforced retroactively, for the reason the
        // two rules above give: re-gating history would light up a hundred
        // records on the day a project first declares a policy, and there is
        // nothing to do about a shipped card except decide it is acceptable —
        // which is what the doctor baseline is for.
        //
        // `verificationRefusal` already returns `null` for a missing method and
        // for `forced`, so all three exemptions collapse into the one call: a
        // card closed before the block existed says nothing to check, and a
        // forced close was answered on its trail line.
        const recorded = card.verified?.method;
        const unaccepted = verificationRefusal(workspace, card.area, recorded);
        if (card.status === "done" && unaccepted) {
            issues.push(
                issue(
                    "warning",
                    "verification-method-unaccepted",
                    card,
                    `Verified by ${recorded}, and ${card.area} now accepts ` +
                        `${unaccepted.join(", ")}.`,
                    { method: recorded, area: card.area, accepted: unaccepted }
                )
            );
        }
        if (
            checkPaths &&
            card.source &&
            !(await pathExists(workspace.root, card.source))
        ) {
            issues.push(
                issue(
                    "error",
                    "missing-source",
                    card,
                    `Source does not exist or is outside the repo: ${card.source}`
                )
            );
        }
    }
    // A parent whose every descendant has come to rest, and that nobody will
    // ever move: closing the last child does not touch the card above it, and
    // the card above it never looks at itself. Every other hierarchy rule here
    // reads from the child upwards; this is the one that reads down.
    //
    // A warning that `--fix` must never act on. Two opposite situations look
    // identical from the count, measured on the board this was written for:
    // one parent had 68 children `done` and was finished; another had one
    // child `discarded` and a body naming four pieces of work of which only
    // that one was ever carded — not finished, undecomposed. Transitioning is
    // a decision, and the finding exists to put it in front of somebody.
    //
    // Three choices decide what it catches, all measured on the same board.
    // The whole subtree, not one level: six `done` cards there had thirteen
    // open children below them, so a one-level rule reports the cleanest-
    // looking parent exactly while a grandchild is still open. No filter on
    // `type: epic`: 11 of that board's 52 parents were not epics. And
    // `discarded` is not delivered: 187 of its 233 discarded cards carried a
    // duplicate note, and 125 of the twins they named were still open — the
    // work moved to another parent, it did not get done, and the finding
    // says which child and where.
    const children = new Map<string, any[]>();
    for (const card of byId.values()) {
        if (!card.parent) continue;
        if (!children.has(card.parent)) children.set(card.parent, []);
        children.get(card.parent)!.push(card);
    }
    const idsIn = new RegExp(
        `${escapeRegExp(workspace.config.cards.idPrefix)}-\\d{4,}`,
        "g"
    );
    for (const [parentId, direct] of children) {
        const parent = byId.get(parentId);
        if (!parent || resting(parent)) continue;
        const tree = descendantsOf(parentId, children);
        if (tree.length === 0 || tree.some((card) => !resting(card))) continue;

        const statuses: Record<string, number> = {};
        for (const card of tree) {
            const key = card.archived ? `${card.status} (archived)` : card.status;
            statuses[key] = (statuses[key] ?? 0) + 1;
        }
        const moved: Array<{ child: string; twins: string[] }> = [];
        let delivered = 0;
        for (const card of tree) {
            if (DELIVERED_STATUSES.has(card.status)) {
                delivered += 1;
                continue;
            }
            if (card.status !== "discarded") continue;
            const twins = twinsNamedBy(card, idsIn)
                .map((id) => byId.get(id))
                .filter(Boolean);
            const open = twins.filter((twin) => !resting(twin)).map((twin) => twin.id);
            if (open.length) moved.push({ child: card.id, twins: open });
            else if (twins.some((twin) => twin.status === "done")) delivered += 1;
        }
        const lastNote = lastNoteStamp(parent.body || "");
        const spread = Object.entries(statuses)
            .sort((left, right) => right[1] - left[1])
            .map(([status, count]) => `${count} ${status}`)
            .join(", ");
        const parts = [
            `Open ${parent.type} with ${tree.length} ` +
                `${tree.length === 1 ? "descendant" : "descendants"} and none open ` +
                `(${spread}); ${delivered} of ${tree.length} delivered.`
        ];
        if (delivered === 0) {
            parts.push(
                "Nothing reached `done` or `review`: this parent may be finished " +
                    "or may never have been decomposed, and the count cannot tell."
            );
        }
        for (const entry of moved) {
            parts.push(
                `${entry.child} was discarded as a duplicate of ${entry.twins.join(", ")}, ` +
                    `still open — that work moved, it did not get done.`
            );
        }
        parts.push(lastNote ? `Last note ${lastNote}.` : "No note has ever judged it.");
        parts.push(
            "Closing the last child does not move the parent; decide whether it is " +
                "done, still undecomposed, or waiting — `doctor --fix` will not."
        );
        issues.push(
            issue("warning", "parent-all-children-closed", parent, parts.join(" "), {
                descendants: tree.length,
                direct: direct.length,
                statuses,
                delivered,
                moved,
                lastNote
            })
        );
    }
    // Two open cards that claim the same job. `duplicate-id` sees two files
    // with one ID; nothing saw two IDs with one title, and this repository
    // carried a 202-byte frontmatter-only stub with T-0231's exact title —
    // an aborted `card create`, linked from nowhere — that only reading found.
    //
    // Measured before adopting, because a rule built on one anecdote is a rule
    // nobody trusts. On a 2 550-card board with 1 510 open (2026-09-11):
    // exact normalised titles found **0** pairs, so the matcher this
    // repository's own case suggested would have been silent on the largest
    // board available. The same content words with at most one extra — a
    // token-set overlap of 0.8 — found **5**, and every one was a real
    // duplicate: the same feature filed a day apart under two parents, once
    // with accents and once without. That is the rule, at the false-positive
    // rate it was adopted at (0 of 5), and nothing looser was measured.
    //
    // Reported once, on the card filed later, naming the earlier one; a
    // warning because which of the two survives is a judgement. Closed cards
    // are out on both sides: a new card that repeats a finished one's title
    // is a reopen, which is a different question.
    const openTitled = [...byId.values()].filter((card) => !closed(card) && card.title);
    const tokensOf = new Map<string, Set<string>>(
        openTitled.map((card) => [card.id, titleTokens(card.title)])
    );
    const postings = new Map<string, any[]>();
    for (const card of openTitled) {
        for (const token of tokensOf.get(card.id)!) {
            if (!postings.has(token)) postings.set(token, []);
            postings.get(token)!.push(card);
        }
    }
    for (const card of openTitled) {
        const mine = tokensOf.get(card.id)!;
        if (mine.size < 2) continue;
        const shared = new Map<any, number>();
        for (const token of mine) {
            for (const other of postings.get(token) ?? []) {
                if (other.id === card.id) continue;
                shared.set(other, (shared.get(other) ?? 0) + 1);
            }
        }
        for (const [other, count] of shared) {
            if (!filedAfter(card, other)) continue;
            const theirs = tokensOf.get(other.id)!;
            if (theirs.size < 2) continue;
            const overlap = count / (mine.size + theirs.size - count);
            if (overlap < 0.8) continue;
            const sameWords = count === mine.size && count === theirs.size;
            issues.push(
                issue(
                    "warning",
                    "duplicate-title",
                    card,
                    `Title says what ${other.id} says — “${other.title}” — ` +
                        `${sameWords ? "the same words" : `${count} words shared`}. ` +
                        `Two open cards for one job, or one is a stub of the other: ` +
                        `merge or discard one, or write in a note why both stand.`,
                    {
                        other: other.id,
                        otherTitle: other.title,
                        shared: count,
                        overlap: Number(overlap.toFixed(2))
                    }
                )
            );
        }
    }
    // Whether the commit a card was closed at is still reachable.
    //
    // This is the only rule here that leaves the process, so it is gated twice
    // before the first spawn. `runDoctor` is on the `/api/v2/health` path the UI
    // polls on a debounce, and `diagnoseCards` is called straight from unit
    // tests with workspaces that are objects rather than directories — neither
    // may pay for a subprocess to learn that no card carries a commit.
    //
    // Archived cards are deliberately out: a rebase that orphaned the branch
    // behind work filed away a year ago is not something anybody is going to
    // act on, and the archive is where the commit count grows without bound.
    const probes = checkGit && workspace?.root
        ? cards.filter(
              (card) =>
                  !card.archived &&
                  card.status === "done" &&
                  verifiedCommit(card.verified)
          )
        : [];
    if (probes.length) {
        const head = await headCommit(workspace.root);
        // Git absent, a directory that is not a repository, a repository with
        // no commits and a shallow clone all mean the question cannot be
        // answered — which is silence, not a finding. Shallow matters
        // concretely: a CI checkout with `fetch-depth: 1` would otherwise
        // report every historical commit as unreachable, on the one machine
        // this most needs to stay quiet on.
        if (head && !(await isShallowRepository(workspace.root))) {
            const distinct = [
                ...new Set(probes.map((card) => verifiedCommit(card.verified)))
            ];
            const verdicts = new Map(
                await mapWithConcurrency(
                    distinct,
                    async (commit) =>
                        [
                            commit,
                            await isAncestorOfHead(workspace.root, commit as string)
                        ] as const,
                    { concurrency: 8 }
                )
            );
            for (const card of probes) {
                const commit = verifiedCommit(card.verified) as string;
                if (verdicts.get(commit) !== "no") continue;
                issues.push(
                    issue(
                        "warning",
                        "verified-commit-unreachable",
                        card,
                        `Verified at commit ${commit.slice(0, 8)}, which is not an ` +
                            `ancestor of HEAD. The branch that proved it may have ` +
                            `been rebased away, or never merged.`,
                        { commit, head }
                    )
                );
            }
        }
    }

    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort(
        (left, right) =>
            severityOrder[left.severity] - severityOrder[right.severity] ||
            String(left.id || left.file).localeCompare(String(right.id || right.file)) ||
            left.code.localeCompare(right.code)
    );
    const counts = { error: 0, warning: 0, info: 0 };
    for (const item of issues) counts[item.severity] += 1;
    // A claim used to be a flag nothing ever revisited: an agent that died
    // mid-task left a card in `doing` forever, `doctor` reported no problem,
    // and the next agent discovered it only by being refused. `claimIsStale`
    // existed but was consulted solely from inside another claim attempt.
    const sessions = await readAgentSessions(workspace, { now });
    const leaseHours = workspace.config.cards.claimLeaseHours;
    for (const card of cards) {
        if (!card.claimed_by) continue;
        const claim: any = claimState(card, sessions, { leaseHours, now });
        if (claim.state === "stale") {
            issues.push(
                issue(
                    "warning",
                    "card-claim-stale",
                    card,
                    `Claimed by ${claim.by} ${claim.ageHours}h ago, past the ${leaseHours}h lease.`,
                    { claim }
                )
            );
        } else if (claim.state === "orphaned") {
            issues.push(
                issue(
                    "warning",
                    "card-claim-orphaned",
                    card,
                    `Claimed by ${claim.by}, whose session stopped signalling.`,
                    { claim }
                )
            );
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        cards: cards.length,
        counts,
        ok: counts.error === 0,
        issues
    };
}
