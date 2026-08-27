import { readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { MEMORY_DEFINITIONS } from "../../config/defaults.js";
import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { reserveRecordId } from "../../core/record-ids.js";
import { readMarkdownTree } from "../../core/paths.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import {
    DEFAULT_LIST_KEYS,
    opaqueFrontmatterKeys,
    parseFrontmatter,
    patchFrontmatter,
    renderFrontmatterEntry,
    replaceBody
} from "../../core/frontmatter.js";
import { withFileLock } from "../../core/locks.js";
import { revisionForContent } from "../../core/revision.js";
import { ensureWritable } from "../../core/guards.js";
import {
    isResourceExhaustion,
    mapWithConcurrency
} from "../../core/concurrency.js";

export const MEMORY_LIST_KEYS = new Set([
    ...DEFAULT_LIST_KEYS,
    "related",
    "supersedes",
    "superseded_by",
    "graduated_to",
    "deciders",
    "scope",
    "corrective_actions",
    "owners",
    "tags"
]);

export const MEMORY_REQUIRED_KEYS = Object.freeze([
    "id",
    "title",
    "status",
    "created",
    "updated"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCE = new Set(["low", "medium", "high"]);
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);

/**
 * The filename a memory record with this id and title would be created with
 * today. Exported so the stale-filename rule can be written once, in the layer
 * that holds every kind — see `health/filenames.ts`.
 *
 * The 70-character cap is not shared with the other kinds and must not be: cards
 * cap at 50 and documents at 60, and unifying them would rename every existing
 * record whose title is long enough to cross the new bound.
 */
export function memoryFileName(id, title) {
    return `${id}-${slugify(title)}.md`;
}

function slugify(value) {
    return (
        String(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 70) || "memory"
    );
}


function definitionFor(workspace, collection) {
    if (!workspace.config.memory.collections.includes(collection)) {
        throw new ValidationError(
            "MEMORY_COLLECTION_DISABLED",
            `Memory collection is not enabled: ${collection}`
        );
    }
    const definition = MEMORY_DEFINITIONS[collection];
    if (!definition) {
        throw new ValidationError(
            "MEMORY_COLLECTION_INVALID",
            `Unknown memory collection: ${collection}`
        );
    }
    return definition;
}

function renderRecord(metadata, body = "") {
    const lines = Object.entries(metadata).flatMap(([key, value]) =>
        renderFrontmatterEntry(key, value, { listKeys: MEMORY_LIST_KEYS })
    );
    return `---\n${lines.join("\n")}\n---\n\n${String(body).trim()}\n`;
}

function optional(metadata, key, transform = (value) => value) {
    const value = metadata[key];
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
        return {};
    }
    return { [key]: transform(value) };
}

/**
 * The one field a loaded record cannot be missing.
 *
 * Every other absent field is `doctor`'s business: the record still loads and
 * the report names it. `id` is different because `loadMemory` sorts on it, so
 * a hand-edited file with no `id:` line threw `TypeError: Cannot read
 * properties of undefined (reading 'localeCompare')` out of the sort — after
 * every file had been read, killing the whole load and with it `doctor`, the
 * server and every command, naming neither the file nor the field. Refusing
 * the record here puts it where every other malformed record already goes:
 * `unreadable`, with its path, and the rest of the collection still loads.
 */
function requireRecordId(metadata, repoPath) {
    const id = typeof metadata.id === "string" ? metadata.id.trim() : metadata.id;
    // A bare `id:` parses to no key at all and `id: ""` to the empty string;
    // anything non-scalar arrives as an object. None of them sort.
    if (typeof id !== "string" || !id) {
        throw new ValidationError(
            "MEMORY_ID_REQUIRED",
            `Memory record has no id: ${repoPath}`
        );
    }
    return id;
}

function normalizeMemory({ collection, file, repoPath, content }) {
    const parsed = parseFrontmatter(content, { listKeys: MEMORY_LIST_KEYS });
    if (!parsed) {
        throw new ValidationError(
            "MEMORY_FRONTMATTER_REQUIRED",
            `Memory record has no frontmatter: ${repoPath}`
        );
    }
    const metadata = parsed.metadata;
    const opaque = opaqueFrontmatterKeys(parsed);
    return {
        id: requireRecordId(metadata, repoPath),
        kind: "memory",
        recordType: collection,
        collection,
        title: metadata.title,
        path: repoPath.replaceAll("\\", "/"),
        file,
        body: parsed.body.trim(),
        status: metadata.status,
        ...optional(metadata, "category"),
        ...optional(metadata, "confidence"),
        ...optional(metadata, "occurrences", Number),
        ...optional(metadata, "severity"),
        ...optional(metadata, "started_at"),
        ...optional(metadata, "resolved_at"),
        ...optional(metadata, "expires"),
        ...optional(metadata, "review_after"),
        ...optional(metadata, "deciders"),
        ...optional(metadata, "related"),
        ...optional(metadata, "supersedes"),
        ...optional(metadata, "superseded_by"),
        ...optional(metadata, "graduated_to"),
        ...optional(metadata, "corrective_actions"),
        ...optional(metadata, "scope"),
        ...optional(metadata, "owners"),
        ...optional(metadata, "tags"),
        ...optional(metadata, "created"),
        ...optional(metadata, "updated"),
        ...(opaque.length ? { frontmatterOpaque: opaque } : {}),
        revision: revisionForContent(content),
        metadata
    };
}

export async function loadMemory(workspace) {
    if (!workspace.config.memory.enabled) {
        return { records: [], unreadable: [] };
    }
    const records = [];
    const unreadable = [];
    // Files were read one at a time here, unlike every other module. Pooled
    // reads keep the disk busy without the unbounded fan-out that risks EMFILE.
    const targets = [];
    for (const collection of workspace.config.memory.collections) {
        const directory = join(workspace.paths.memory, collection);
        for (const file of await readMarkdownTree(directory)) {
            const absolute = join(directory, file);
            targets.push({
                collection,
                file,
                absolute,
                repoPath: relative(workspace.root, absolute)
            });
        }
    }
    const results = await mapWithConcurrency(
        targets,
        async ({ collection, file, absolute, repoPath }) => {
            try {
                const content = await readFile(absolute, "utf8");
                return {
                    record: normalizeMemory({
                        collection,
                        file,
                        repoPath,
                        content
                    })
                };
            } catch (error) {
                if (isResourceExhaustion(error)) throw error;
                return { file: repoPath, reason: error.message };
            }
        }
    );
    for (const entry of results) {
        if (entry.record) records.push(entry.record);
        else unreadable.push({ file: entry.file, reason: entry.reason });
    }
    return {
        records: records.sort((left, right) =>
            left.id.localeCompare(right.id, undefined, { numeric: true })
        ),
        unreadable
    };
}

function validateMemoryRecord(
    workspace,
    collection,
    record,
    existing = [],
    currentId = null
) {
    const definition = definitionFor(workspace, collection);
    const missing = MEMORY_REQUIRED_KEYS.filter((key) => !record[key]);
    if (missing.length) {
        throw new ValidationError(
            "MEMORY_REQUIRED_FIELDS_MISSING",
            `Missing required fields: ${missing.join(", ")}`
        );
    }
    const escaped = definition.idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
        record.id !== "pending" &&
        !new RegExp(`^${escaped}-\\d{4,}$`).test(record.id)
    ) {
        throw new ValidationError(
            "MEMORY_ID_INVALID",
            `Invalid ${collection} ID: ${record.id}`
        );
    }
    if (!definition.statuses.includes(record.status)) {
        throw new ValidationError(
            "MEMORY_STATUS_INVALID",
            `Invalid ${collection} status: ${record.status}`
        );
    }
    for (const key of ["created", "updated", "expires", "review_after"]) {
        if (record[key] && !DATE_RE.test(record[key])) {
            throw new ValidationError(
                "MEMORY_DATE_INVALID",
                `${key} must use YYYY-MM-DD`
            );
        }
    }
    if (record.created && record.updated && record.created > record.updated) {
        throw new ValidationError(
            "MEMORY_DATE_RANGE_INVALID",
            "updated cannot be before created"
        );
    }
    if (collection === "learnings") {
        if (record.confidence && !CONFIDENCE.has(record.confidence)) {
            throw new ValidationError(
                "LEARNING_CONFIDENCE_INVALID",
                "confidence must be low, medium or high"
            );
        }
        if (
            record.occurrences != null &&
            (!Number.isInteger(Number(record.occurrences)) || Number(record.occurrences) < 1)
        ) {
            throw new ValidationError(
                "LEARNING_OCCURRENCES_INVALID",
                "occurrences must be a positive integer"
            );
        }
    }
    if (collection === "incidents") {
        if (record.severity && !SEVERITIES.has(record.severity)) {
            throw new ValidationError(
                "INCIDENT_SEVERITY_INVALID",
                "severity must be critical, high, medium or low"
            );
        }
        for (const key of ["started_at", "resolved_at"]) {
            if (record[key] && !Number.isFinite(Date.parse(record[key]))) {
                throw new ValidationError(
                    "INCIDENT_TIMESTAMP_INVALID",
                    `${key} must be an ISO-8601 timestamp`
                );
            }
        }
        if (
            record.started_at &&
            record.resolved_at &&
            Date.parse(record.resolved_at) < Date.parse(record.started_at)
        ) {
            throw new ValidationError(
                "INCIDENT_TIMESTAMP_RANGE_INVALID",
                "resolved_at cannot be before started_at"
            );
        }
    }
    if (
        existing.some(
            (candidate) =>
                record.id !== "pending" &&
                candidate.id === record.id &&
                candidate.id !== currentId
        )
    ) {
        throw new ConflictError(
            "MEMORY_ID_DUPLICATE",
            `Memory record ID already exists: ${record.id}`
        );
    }
}

async function maxSequence(records, prefix) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}-(\\d+)$`);
    return records.reduce((maximum, record) => {
        const match = String(record.id || "").match(pattern);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
}

export async function createMemoryRecord(workspace, collection, input, { now }: any = {}) {
    ensureWritable(workspace);
    const definition = definitionFor(workspace, collection);
    if (!input?.title?.trim()) {
        throw new ValidationError("MEMORY_TITLE_REQUIRED", "title is required.");
    }
    const instant = now ? new Date(now) : new Date();
    const date = instant.toISOString().slice(0, 10);
    const loaded = await loadMemory(workspace);
    const collectionRecords = loaded.records.filter(
        (record) => record.collection === collection
    );
    const defaultStatus = definition.statuses[0];
    const base = {
        id: "pending",
        title: input.title.trim(),
        status: input.status || defaultStatus,
        ...(input.category ? { category: input.category } : {}),
        ...(input.confidence ? { confidence: input.confidence } : {}),
        ...(input.occurrences != null ? { occurrences: input.occurrences } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.started_at ? { started_at: input.started_at } : {}),
        ...(input.resolved_at ? { resolved_at: input.resolved_at } : {}),
        ...(input.expires ? { expires: input.expires } : {}),
        ...(input.review_after ? { review_after: input.review_after } : {}),
        ...(input.deciders?.length ? { deciders: input.deciders } : {}),
        ...(input.related?.length ? { related: input.related } : {}),
        ...(input.supersedes?.length ? { supersedes: input.supersedes } : {}),
        ...(input.superseded_by?.length ? { superseded_by: input.superseded_by } : {}),
        ...(input.graduated_to?.length ? { graduated_to: input.graduated_to } : {}),
        ...(input.corrective_actions?.length
            ? { corrective_actions: input.corrective_actions }
            : {}),
        ...(input.scope?.length ? { scope: input.scope } : {}),
        ...(input.owners?.length ? { owners: input.owners } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        created: date,
        updated: date
    };
    validateMemoryRecord(workspace, collection, base, collectionRecords);
    return reserveRecordId(
        {
            prefix: definition.idPrefix,
            // One collection owns one prefix, so its own directory is the
            // complete domain for this id.
            directories: [join(workspace.paths.memory, collection)],
            lockDirectory: join(workspace.paths.cache, "locks", "ids"),
            code: "MEMORY_ID_ALLOCATION_FAILED"
        },
        async (id) => {
            const metadata = { ...base, id };
            validateMemoryRecord(
                workspace,
                collection,
                metadata,
                collectionRecords
            );
            const file = `${id}-${slugify(input.title)}.md`;
            const directory = join(workspace.paths.memory, collection);
            const path = join(directory, file);
            const content = renderRecord(metadata, input.body);
            await createFileExclusive(path, content);
            const record = normalizeMemory({
                collection,
                file,
                repoPath: relative(workspace.root, path),
                content
            });
            return { id, file, path, revision: record.revision, record };
        }
    );
}

function findRecord(records, id) {
    const matches = records.filter((record) => record.id === id);
    if (!matches.length) {
        throw new NotFoundError("MEMORY_NOT_FOUND", `Memory record not found: ${id}`);
    }
    if (matches.length > 1) {
        throw new ConflictError(
            "MEMORY_ID_AMBIGUOUS",
            `Memory ID ${id} appears in multiple files.`
        );
    }
    return matches[0];
}

const PATCHABLE = new Set([
    "title",
    "status",
    "category",
    "confidence",
    "occurrences",
    "severity",
    "started_at",
    "resolved_at",
    "expires",
    "review_after",
    "deciders",
    "related",
    "supersedes",
    "superseded_by",
    "graduated_to",
    "corrective_actions",
    "scope",
    "owners",
    "tags",
    "body"
]);

function sanitizeMemoryPatch(changes) {
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(changes || {})) {
        if (!PATCHABLE.has(key)) {
            throw new ValidationError(
                "MEMORY_FIELD_NOT_PATCHABLE",
                `Field cannot be patched: ${key}`
            );
        }
        safe[key] = value;
    }
    return safe;
}

function prepareMemoryPatch(
    workspace,
    loaded,
    current,
    content,
    changes,
    { expectedRevision }: any = {}
) {
    const actualRevision = revisionForContent(content);
    if (expectedRevision && expectedRevision !== actualRevision) {
        throw new ConflictError(
            "MEMORY_WRITE_CONFLICT",
            "The memory record changed after it was loaded.",
            {
                id: current.id,
                expectedRevision,
                actualRevision,
                current: { ...current, revision: actualRevision }
            }
        );
    }
    const safe = sanitizeMemoryPatch(changes);
    const { body: nextBody, ...requested } = safe;
    const updated = new Date().toISOString().slice(0, 10);
    const candidate = {
        ...current.metadata,
        id: current.id,
        title: current.title,
        status: current.status,
        created: current.created,
        updated,
        ...requested
    };
    validateMemoryRecord(
        workspace,
        current.collection,
        candidate,
        loaded.records.filter(
            (record) => record.collection === current.collection
        ),
        current.id
    );
    let next = patchFrontmatter(
        content,
        { ...requested, updated },
        { listKeys: MEMORY_LIST_KEYS }
    );
    if (nextBody !== undefined) {
        next = replaceBody(next, String(nextBody));
    }
    const path = resolve(workspace.root, current.path);
    const record = normalizeMemory({
        collection: current.collection,
        file: current.file,
        repoPath: current.path,
        content: next
    });
    return {
        id: current.id,
        path,
        original: content,
        next,
        revision: record.revision,
        record
    };
}

async function withMemoryLocks(workspace, ids, operation) {
    const ordered = [...new Set(ids)].sort();
    const acquire = (index) => {
        if (index >= ordered.length) return operation();
        const id = ordered[index];
        return withFileLock(
            join(workspace.paths.cache, "locks", "memory", `${id}.lock`),
            () => acquire(index + 1),
            { metadata: { module: "memory", recordId: id } }
        );
    };
    return acquire(0);
}

export async function patchMemoryRecord(
    workspace,
    id,
    changes,
    { expectedRevision }: any = {}
) {
    ensureWritable(workspace);
    return withMemoryLocks(workspace, [id], async () => {
        const loaded = await loadMemory(workspace);
        const current = findRecord(loaded.records, id);
        const content = await readFile(resolve(workspace.root, current.path), "utf8");
        const prepared = prepareMemoryPatch(
            workspace,
            loaded,
            current,
            content,
            changes,
            { expectedRevision }
        );
        await writeFileAtomic(prepared.path, prepared.next);
        return {
            id,
            path: prepared.path,
            revision: prepared.revision,
            record: prepared.record
        };
    });
}

export async function graduateLearning(
    workspace,
    id,
    targets,
    { expectedRevision }: any = {}
) {
    const loaded = await loadMemory(workspace);
    const record = findRecord(loaded.records, id);
    if (record.collection !== "learnings") {
        throw new ValidationError(
            "MEMORY_GRADUATION_INVALID",
            "Only learning records can be graduated."
        );
    }
    if (!targets?.length) {
        throw new ValidationError(
            "MEMORY_GRADUATION_TARGET_REQUIRED",
            "Graduation requires at least one target record."
        );
    }
    return patchMemoryRecord(
        workspace,
        id,
        { status: "graduated", graduated_to: targets },
        { expectedRevision }
    );
}

export async function supersedeMemoryRecord(
    workspace,
    id,
    replacementId,
    { expectedRevision }: any = {}
) {
    ensureWritable(workspace);
    if (id === replacementId) {
        throw new ValidationError(
            "MEMORY_SUPERSESSION_SELF",
            "A memory record cannot supersede itself."
        );
    }
    return withMemoryLocks(workspace, [id, replacementId], async () => {
        const loaded = await loadMemory(workspace);
        const current = findRecord(loaded.records, id);
        const replacement = findRecord(loaded.records, replacementId);
        const definition = definitionFor(workspace, current.collection);
        if (!definition.statuses.includes("superseded")) {
            throw new ValidationError(
                "MEMORY_SUPERSESSION_UNSUPPORTED",
                `${current.collection} records do not support superseded status.`
            );
        }
        const [currentContent, replacementContent] = await Promise.all([
            readFile(resolve(workspace.root, current.path), "utf8"),
            readFile(resolve(workspace.root, replacement.path), "utf8")
        ]);
        const preparedCurrent = prepareMemoryPatch(
            workspace,
            loaded,
            current,
            currentContent,
            { status: "superseded", superseded_by: [replacementId] },
            { expectedRevision }
        );
        const preparedReplacement = prepareMemoryPatch(
            workspace,
            loaded,
            replacement,
            replacementContent,
            { supersedes: [...new Set([...(replacement.supersedes || []), id])] }
        );
        await writeFileAtomic(preparedCurrent.path, preparedCurrent.next);
        try {
            await writeFileAtomic(
                preparedReplacement.path,
                preparedReplacement.next
            );
        } catch (error) {
            await writeFileAtomic(
                preparedCurrent.path,
                preparedCurrent.original
            ).catch(() => undefined);
            throw error;
        }
        return {
            id,
            path: preparedCurrent.path,
            revision: preparedCurrent.revision,
            record: preparedCurrent.record,
            replacement: preparedReplacement.record
        };
    });
}
