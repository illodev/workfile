import { access, readdir, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { parseFrontmatter } from "../../core/frontmatter.js";
import { readMarkdownTree } from "../../core/paths.js";
import { revisionForContent } from "../../core/revision.js";
import { parseAcceptance } from "./acceptance.js";
import { claimState, readAgentSessions } from "./claims.js";
import { cardFileName } from "./slug.js";
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

export const CARD_LIST_KEYS = new Set(["tags", "depends", "scope", "related"]);
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

export function cardIdPattern(prefix = "T") {
    return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}-\\d{4,}$`);
}

export function parseCard(fileName, content, archived = false): any {
    const parsed = parseFrontmatter(content, { listKeys: CARD_LIST_KEYS });
    if (!parsed) return null;
    return {
        file: fileName,
        archived,
        body: parsed.body.trim(),
        ...parsed.metadata
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

export async function diagnoseCards({
    cards,
    unreadable = [],
    workspace,
    checkPaths = true,
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
        } else if (
            card.id &&
            card.title &&
            basename(card.file || "") !== cardFileName(card.id, card.title)
        ) {
            // Creating a card derives the filename from the title; retitling it
            // never revisited that, so a file could sit for months named after a
            // title the card no longer has. The filename is the handle people
            // and agents grep by, and a stale one misdirects long after anyone
            // remembers the rename. A warning rather than an error: the record
            // is intact and only its label has drifted, and renaming on every
            // title edit would churn history and break open editor buffers —
            // so the repair is `doctor --fix`, when the reader asks for it.
            issues.push(
                issue(
                    "warning",
                    "filename-stale",
                    card,
                    `Filename no longer matches the title; \`doctor --fix\` renames it to ${cardFileName(card.id, card.title)}`
                )
            );
        }
        if ((card.title || "").length > 80) {
            issues.push(
                issue(
                    "warning",
                    "long-title",
                    card,
                    `Title has ${card.title.length} characters; maximum is 80`
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
        const pending = parseAcceptance(card.body).unchecked;
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
