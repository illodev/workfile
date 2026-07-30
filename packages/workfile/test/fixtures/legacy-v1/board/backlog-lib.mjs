import { access, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const STATUSES = [
    "backlog",
    "next",
    "doing",
    "review",
    "blocked",
    "deferred",
    "done",
    "discarded"
];
export const TYPES = [
    "epic",
    "idea",
    "feature",
    "bug",
    "task",
    "audit",
    "docs",
    "chore"
];
export const PRIORITIES = ["critical", "high", "medium", "low"];
export const AREAS = [
    "api",
    "client",
    "web",
    "billing",
    "time",
    "projects",
    "services",
    "mcp",
    "sdk",
    "ui",
    "fiscal",
    "docs",
    "infra",
    "marketing",
    "hr",
    "crm",
    "ia"
];
export const EFFORTS = ["S", "M", "L"];
export const LIST_KEYS = new Set(["tags", "depends", "scope"]);
export const REQUIRED_KEYS = [
    "id",
    "title",
    "status",
    "type",
    "priority",
    "area",
    "created",
    "updated"
];

const ID_RE = /^T-\d{4,6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENUMS = {
    status: STATUSES,
    type: TYPES,
    priority: PRIORITIES,
    area: AREAS,
    effort: EFFORTS
};

/** A scalar needs quoting when dropping the quotes would change what the parser
 *  reads back: leading quote (the parser would unquote it), leading/trailing
 *  whitespace (trimmed away), empty value, or YAML-significant punctuation. */
const SCALAR_NEEDS_QUOTE = /^$|^["'\s]|\s$|[:#[\]{}]/;
/** List items live inside `[a, b]`, so a comma must be quoted as well. */
const ITEM_NEEDS_QUOTE = /^$|^["'\s]|\s$|[,:#[\]{}]/;

function quote(value, needsQuote) {
    return needsQuote.test(value) ? JSON.stringify(value) : value;
}

/** Exact inverse of `quote`: only unquotes what the serializer could have
 *  written, so a bare value containing quotes survives untouched. */
function unquote(value) {
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
        try {
            return JSON.parse(value);
        } catch {
            /* stray quotes: the value was not written by us, keep it verbatim */
        }
    } else if (
        value.length > 1 &&
        value.startsWith("'") &&
        value.endsWith("'") &&
        !value.slice(1, -1).includes("'")
    ) {
        return value.slice(1, -1);
    }
    return value;
}

/** Splits `a, "b, c", d` honouring quoted items (which may contain commas). */
function splitListItems(value) {
    const items = [];
    let current = "";
    let quoteChar = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quoteChar) {
            if (char === "\\" && index + 1 < value.length) {
                current += char + value[index + 1];
                index += 1;
            } else {
                current += char;
                if (char === quoteChar) quoteChar = null;
            }
        } else if (char === '"' || char === "'") {
            quoteChar = char;
            current += char;
        } else if (char === ",") {
            items.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    items.push(current);
    return items;
}

export function parseValue(key, raw) {
    let value = raw.trim();
    if (LIST_KEYS.has(key)) {
        if (value.startsWith("[") && value.endsWith("]"))
            value = value.slice(1, -1);
        return splitListItems(value)
            .map((item) => unquote(item.trim()))
            .filter(Boolean);
    }
    return unquote(value);
}

/** Writes a frontmatter value; `parseValue` reads back exactly what went in. */
export function serializeValue(key, value) {
    if (LIST_KEYS.has(key)) {
        const items = Array.isArray(value)
            ? value
            : value == null || value === ""
              ? []
              : [value];
        return `[${items.map((item) => quote(String(item), ITEM_NEEDS_QUOTE)).join(", ")}]`;
    }
    return quote(String(value ?? ""), SCALAR_NEEDS_QUOTE);
}

export function parseTask(fileName, content, archived = false) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return null;
    const task = {
        file: fileName,
        archived,
        body: content.slice(match[0].length).trim()
    };
    for (const line of match[1].split(/\r?\n/)) {
        const keyValue = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (!keyValue) continue;
        if (keyValue[2].trim() !== "" || LIST_KEYS.has(keyValue[1]))
            task[keyValue[1]] = parseValue(keyValue[1], keyValue[2]);
    }
    return task;
}

export async function loadCardDirectory(directory, archived = false) {
    let files;
    try {
        files = await readdir(directory);
    } catch {
        return { cards: [], unreadable: [] };
    }
    const markdownFiles = files.filter((file) => file.endsWith(".md")).sort();
    const results = await Promise.all(
        markdownFiles.map(async (file) => {
            try {
                const content = await readFile(join(directory, file), "utf8");
                return { file, task: parseTask(file, content, archived) };
            } catch (error) {
                return { file, error };
            }
        })
    );
    return {
        cards: results
            .filter((result) => result.task)
            .map((result) => result.task),
        unreadable: results
            .filter((result) => !result.task)
            .map((result) => ({
                file: result.file,
                reason: result.error?.message || "frontmatter not found"
            }))
    };
}

function issue(severity, code, card, message) {
    return {
        severity,
        code,
        id: card?.id || null,
        file: card?.file || null,
        archived: Boolean(card?.archived),
        message
    };
}

function uncheckedAcceptanceCount(body = "") {
    const acceptance = body.match(
        /##\s+Acceptance criteria\b([\s\S]*?)(?=\n##\s+|$)/i
    );
    if (!acceptance) return 0;
    return (acceptance[1].match(/^\s*[-*]\s+\[\s\]/gm) || []).length;
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

export async function diagnoseBacklog({
    cards,
    unreadable = [],
    repoRoot,
    checkPaths = true
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
        if (id && matches.length > 1)
            issues.push(
                issue(
                    "error",
                    "duplicate-id",
                    matches[0],
                    `${id} appears in ${matches.length} files`
                )
            );
    }

    for (const card of cards) {
        const missing = REQUIRED_KEYS.filter((key) => !card[key]);
        if (missing.length)
            issues.push(
                issue(
                    "error",
                    "missing-required",
                    card,
                    `Missing required fields: ${missing.join(", ")}`
                )
            );
        if (card.id && !ID_RE.test(card.id))
            issues.push(
                issue(
                    "error",
                    "invalid-id",
                    card,
                    `Invalid card id: ${card.id}`
                )
            );
        if (card.id && !card.file?.startsWith(`${card.id}-`))
            issues.push(
                issue(
                    "error",
                    "filename-mismatch",
                    card,
                    `Filename must start with ${card.id}-`
                )
            );
        if ((card.title || "").length > 80)
            issues.push(
                issue(
                    "warning",
                    "long-title",
                    card,
                    `Title has ${card.title.length} characters; maximum is 80`
                )
            );
        for (const [key, allowed] of Object.entries(ENUMS)) {
            if (card[key] && !allowed.includes(card[key]))
                issues.push(
                    issue(
                        "error",
                        "invalid-enum",
                        card,
                        `Invalid ${key}: ${card[key]}`
                    )
                );
        }
        for (const key of [
            "created",
            "updated",
            "claimed_at",
            "start",
            "due"
        ]) {
            if (card[key] && !DATE_RE.test(card[key]))
                issues.push(
                    issue(
                        "error",
                        "invalid-date",
                        card,
                        `${key} must use YYYY-MM-DD`
                    )
                );
        }
        if (card.start && card.due && card.start > card.due)
            issues.push(
                issue(
                    "error",
                    "invalid-date-range",
                    card,
                    `Start ${card.start} is after due ${card.due}`
                )
            );
        if (card.parent && !byId.has(card.parent))
            issues.push(
                issue(
                    "error",
                    "missing-parent",
                    card,
                    `Parent ${card.parent} does not exist`
                )
            );
        if (card.parent === card.id)
            issues.push(
                issue("error", "self-parent", card, "Card cannot parent itself")
            );
        for (const dependency of card.depends || []) {
            if (!byId.has(dependency))
                issues.push(
                    issue(
                        "error",
                        "missing-dependency",
                        card,
                        `Dependency ${dependency} does not exist`
                    )
                );
            if (dependency === card.id)
                issues.push(
                    issue(
                        "error",
                        "self-dependency",
                        card,
                        "Card cannot depend on itself"
                    )
                );
        }
        const hierarchy = hierarchyDepth(card, byId);
        if (hierarchy.cycle)
            issues.push(
                issue(
                    "error",
                    "parent-cycle",
                    card,
                    "Parent hierarchy has a cycle"
                )
            );
        else if (hierarchy.depth > 2)
            issues.push(
                issue(
                    "error",
                    "hierarchy-depth",
                    card,
                    `Hierarchy depth is ${hierarchy.depth}; maximum is 2`
                )
            );
        const hasClaim = Boolean(card.claimed_by);
        const hasClaimDate = Boolean(card.claimed_at);
        if (hasClaim !== hasClaimDate)
            issues.push(
                issue(
                    "warning",
                    "partial-claim",
                    card,
                    "claimed_by and claimed_at must be set or cleared together"
                )
            );
        if (hasClaim && card.status !== "doing")
            issues.push(
                issue(
                    "warning",
                    "claim-status",
                    card,
                    `Claimed card has status ${card.status}, expected doing`
                )
            );
        if (card.archived && !["done", "discarded"].includes(card.status))
            issues.push(
                issue(
                    "error",
                    "open-archived",
                    card,
                    `Archived card has open status ${card.status}`
                )
            );
        const unchecked = uncheckedAcceptanceCount(card.body);
        if (card.status === "done" && unchecked)
            issues.push(
                issue(
                    "warning",
                    "done-unchecked",
                    card,
                    `Done card has ${unchecked} unchecked acceptance criteria`
                )
            );
        if (
            checkPaths &&
            card.source &&
            !(await pathExists(repoRoot, card.source))
        )
            issues.push(
                issue(
                    "error",
                    "missing-source",
                    card,
                    `Source does not exist or is outside the repo: ${card.source}`
                )
            );
    }

    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort(
        (left, right) =>
            severityOrder[left.severity] - severityOrder[right.severity] ||
            String(left.id || left.file).localeCompare(
                String(right.id || right.file)
            ) ||
            left.code.localeCompare(right.code)
    );
    const counts = { error: 0, warning: 0, info: 0 };
    for (const item of issues) counts[item.severity] += 1;
    return {
        generatedAt: new Date().toISOString(),
        cards: cards.length,
        counts,
        ok: counts.error === 0,
        issues
    };
}

export async function loadBacklog({ tasksDir, archiveDir }) {
    const [live, archived] = await Promise.all([
        loadCardDirectory(tasksDir, false),
        loadCardDirectory(archiveDir, true)
    ]);
    return {
        cards: [...live.cards, ...archived.cards],
        unreadable: [...live.unreadable, ...archived.unreadable]
    };
}
