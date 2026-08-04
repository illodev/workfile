import {
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES
} from "../../config/defaults.js";
import { ValidationError } from "../../core/errors.js";

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
    "origin"
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
