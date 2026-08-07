import { createHash } from "node:crypto";
import {
    access,
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    rmdir,
    stat
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { reserveRecordId } from "../../core/record-ids.js";
import { discoverFiles, normalizeRepoPath } from "../../core/glob.js";
import { containedPath, readMarkdownTree } from "../../core/paths.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import {
    DEFAULT_LIST_KEYS,
    parseFrontmatter,
    patchFrontmatter,
    renderFrontmatterEntry,
    replaceBody
} from "../../core/frontmatter.js";
import { withFileLock } from "../../core/locks.js";
import { revisionForContent } from "../../core/revision.js";
import { exists } from "../../core/fs-utils.js";
import { ensureWritable } from "../../core/guards.js";
import {
    isResourceExhaustion,
    mapWithConcurrency
} from "../../core/concurrency.js";

export const DOC_LIST_KEYS = new Set([
    ...DEFAULT_LIST_KEYS,
    "owners",
    "related",
    "scope",
    "supersedes"
]);

export const DOC_REQUIRED_KEYS = Object.freeze([
    "id",
    "title",
    "kind",
    "status",
    "created",
    "updated"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function slugify(title) {
    return (
        String(title)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "document"
    );
}


function titleFromBody(body, file) {
    const heading = String(body).match(/^#\s+(.+)$/m);
    if (heading) return heading[1].trim();
    const stem = basename(file, extname(file)).replace(/[-_]+/g, " ").trim();
    return stem || file;
}

function derivedDocumentId(path) {
    const digest = createHash("sha256")
        .update(normalizeRepoPath(path), "utf8")
        .digest("hex")
        .slice(0, 12)
        .toUpperCase();
    return `PATH-${digest}`;
}

function normalizeDocument({
    file,
    repoPath,
    content,
    managed,
    modifiedAt,
    sizeBytes
}) {
    const parsed = parseFrontmatter(content, { listKeys: DOC_LIST_KEYS });
    const metadata = parsed?.metadata || {};
    const body = parsed ? parsed.body.trim() : content.trim();
    return {
        id: metadata.id || derivedDocumentId(repoPath),
        kind: "doc",
        title: metadata.title || titleFromBody(body, file),
        path: normalizeRepoPath(repoPath),
        file,
        body,
        managed,
        documentKind: metadata.kind || "reference",
        status: metadata.status || (managed ? "draft" : "current"),
        ...(metadata.owners?.length ? { owners: metadata.owners } : {}),
        ...(metadata.related?.length ? { related: metadata.related } : {}),
        ...(metadata.supersedes?.length
            ? { supersedes: metadata.supersedes }
            : {}),
        ...(metadata.scope?.length ? { scope: metadata.scope } : {}),
        ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
        ...(metadata.created ? { created: metadata.created } : {}),
        ...(metadata.updated ? { updated: metadata.updated } : {}),
        ...(metadata.reviewed ? { reviewed: metadata.reviewed } : {}),
        ...(metadata.review_interval_days
            ? { review_interval_days: Number(metadata.review_interval_days) }
            : {}),
        modifiedAt,
        sizeBytes,
        revision: revisionForContent(content),
        metadata
    };
}

async function readDocument(
    workspace,
    absolute,
    repoPath,
    managed,
    file = basename(repoPath)
) {
    const info = await stat(absolute);
    if (info.size > workspace.config.docs.maxFileBytes) {
        throw new ValidationError(
            "DOC_FILE_TOO_LARGE",
            `Document exceeds ${workspace.config.docs.maxFileBytes} bytes: ${repoPath}`,
            { path: repoPath, sizeBytes: info.size }
        );
    }
    const content = await readFile(absolute, "utf8");
    return normalizeDocument({
        file,
        repoPath,
        content,
        managed,
        modifiedAt: info.mtime.toISOString(),
        sizeBytes: info.size
    });
}

/**
 * Load every managed document, at any depth below `docs.managedPath`.
 *
 * `file` is the path relative to the managed root (`architecture/DOC-0014-x.md`),
 * so folders work even when they are created by hand and `join(paths.docs, file)`
 * keeps addressing the document.
 */
/**
 * Remove the folders a moved document left behind, walking up until a folder
 * still holds something or `stopAt` is reached.
 *
 * Without this, reorganising a tree slowly fills the managed root with empty
 * directories: they are invisible to `readMarkdownTree` and to the UI tree
 * (which is built from records, not from directories), so nothing ever cleans
 * them up and nothing ever complains.
 *
 * Best effort on purpose: the move already succeeded, and a folder that is not
 * empty — or that someone else is writing to — is simply left alone.
 */
async function pruneEmptyFolders(folder: string, stopAt: string) {
    let current = resolve(folder);
    const root = resolve(stopAt);
    while (current !== root && current.startsWith(`${root}/`)) {
        try {
            const entries = await readdir(current);
            if (entries.length > 0) return;
            await rmdir(current);
        } catch {
            return;
        }
        current = dirname(current);
    }
}

/** Collect `readDocument` results without letting one bad file abort the rest.
 * Order follows the input, which is already sorted. */
async function readDocuments(workspace, entries, managed) {
    const results = await mapWithConcurrency(
        entries,
        async ({ absolute, repoPath, file }) => {
            try {
                return {
                    document: await readDocument(
                        workspace,
                        absolute,
                        repoPath,
                        managed,
                        file
                    )
                };
            } catch (error) {
                if (isResourceExhaustion(error)) throw error;
                return { file: repoPath, reason: error.message };
            }
        }
    );
    return {
        documents: results
            .filter((entry) => entry.document)
            .map((entry) => entry.document),
        unreadable: results
            .filter((entry) => !entry.document)
            .map(({ file, reason }) => ({ file, reason }))
    };
}

export async function loadManagedDocuments(workspace) {
    const files = await readMarkdownTree(workspace.paths.docs);
    return await readDocuments(
        workspace,
        files.map((file) => {
            const absolute = join(workspace.paths.docs, file);
            return {
                absolute,
                repoPath: normalizeRepoPath(relative(workspace.root, absolute)),
                file
            };
        }),
        true
    );
}

export async function loadIndexedDocuments(workspace) {
    const managedPrefix = `${normalizeRepoPath(
        relative(workspace.root, workspace.paths.docs)
    )}/`;
    const exclude = [
        ...workspace.config.docs.exclude,
        `${managedPrefix}**`
    ];
    const paths = await discoverFiles(workspace.root, {
        include: workspace.config.docs.sources,
        exclude
    });
    return await readDocuments(
        workspace,
        paths.map((repoPath) => ({
            absolute: resolve(workspace.root, repoPath),
            repoPath,
            file: basename(repoPath)
        })),
        false
    );
}

export async function loadDocuments(workspace) {
    if (!workspace.config.docs.enabled) {
        return { documents: [], unreadable: [] };
    }
    const [managed, indexed] = await Promise.all([
        loadManagedDocuments(workspace),
        loadIndexedDocuments(workspace)
    ]);
    const byPath = new Map();
    for (const document of [...managed.documents, ...indexed.documents]) {
        byPath.set(document.path, document);
    }
    return {
        documents: [...byPath.values()].sort((left, right) =>
            left.path < right.path ? -1 : left.path > right.path ? 1 : 0
        ),
        unreadable: [...managed.unreadable, ...indexed.unreadable]
    };
}

function validateManagedDocument(workspace, document, existing = [], currentId) {
    const missing = DOC_REQUIRED_KEYS.filter((key) => !document[key]);
    if (missing.length) {
        throw new ValidationError(
            "DOC_REQUIRED_FIELDS_MISSING",
            `Missing required fields: ${missing.join(", ")}`
        );
    }
    const escaped = workspace.config.docs.idPrefix.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
    if (
        document.id !== "pending" &&
        !new RegExp(`^${escaped}-\\d{4,}$`).test(document.id)
    ) {
        throw new ValidationError(
            "DOC_ID_INVALID",
            `Invalid managed document ID: ${document.id}`
        );
    }

    if (String(document.title).length > 120) {
        throw new ValidationError(
            "DOC_TITLE_TOO_LONG",
            "Document title must be 120 characters or fewer."
        );
    }
    if (
        document.review_interval_days != null &&
        (!Number.isInteger(Number(document.review_interval_days)) ||
            Number(document.review_interval_days) < 0)
    ) {
        throw new ValidationError(
            "DOC_REVIEW_INTERVAL_INVALID",
            "review_interval_days must be a non-negative integer."
        );
    }
    // `allowed` travels with the error so both the JSON payload and the text
    // renderer can name the near miss. The card validator has carried it since
    // the enum check was written; these two did not, so `--kind report` failed
    // without ever mentioning that `research` was one letter of intent away.
    if (!workspace.config.docs.kinds.includes(document.kind)) {
        throw new ValidationError(
            "DOC_KIND_INVALID",
            `Invalid document kind: ${document.kind}`,
            {
                field: "kind",
                value: document.kind,
                allowed: workspace.config.docs.kinds
            }
        );
    }
    if (!workspace.config.docs.statuses.includes(document.status)) {
        throw new ValidationError(
            "DOC_STATUS_INVALID",
            `Invalid document status: ${document.status}`,
            {
                field: "status",
                value: document.status,
                allowed: workspace.config.docs.statuses
            }
        );
    }
    for (const key of ["created", "updated", "reviewed"]) {
        if (document[key] && !DATE_RE.test(document[key])) {
            throw new ValidationError(
                "DOC_DATE_INVALID",
                `${key} must use YYYY-MM-DD`
            );
        }
    }
    if (document.created && document.updated && document.created > document.updated) {
        throw new ValidationError(
            "DOC_DATE_RANGE_INVALID",
            "updated cannot be before created"
        );
    }
    if (
        existing.some(
            (candidate) =>
                document.id !== "pending" &&
                candidate.id === document.id &&
                candidate.id !== currentId
        )
    ) {
        throw new ConflictError(
            "DOC_ID_DUPLICATE",
            `Document ID already exists: ${document.id}`
        );
    }
}

function renderManagedDocument(metadata, body = "") {
    const lines = Object.entries(metadata).flatMap(([key, value]) =>
        renderFrontmatterEntry(key, value, { listKeys: DOC_LIST_KEYS })
    );
    return `---\n${lines.join("\n")}\n---\n\n${String(body).trim()}\n`;
}

async function maxSequence(directory, prefix) {
    const files = await readMarkdownTree(directory);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}-(\\d+)`);
    return files.reduce((maximum, file) => {
        const match = basename(file).match(pattern);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
}

/**
 * Normalize a managed-document folder to a path relative to `docs.managedPath`.
 * The empty string (and ".") means the managed root. Absolute paths and `../`
 * escapes are rejected with the same containment criterion the workspace
 * configuration uses for its own paths.
 */
/**
 * Trailing separators are stripped by slicing, not by `/\/+$/`.
 *
 * That pattern is unanchored at the start, so on a folder of nothing but
 * separators the engine restarted the greedy run at every position and failed
 * at `$` each time: 0.8ms at 1,000 characters and 189ms at 16,000, which is
 * quadratic on a value that arrives from `doc create --folder` and from the
 * HTTP body. The loop below is the same operation and reads as what it does.
 */
function withoutTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === "/") end -= 1;
    return value.slice(0, end);
}

export function normalizeDocumentFolder(workspace, folder) {
    const raw = withoutTrailingSlashes(
        normalizeRepoPath(String(folder ?? "").trim())
    );
    if (!raw || raw === ".") return "";
    const resolved = containedPath(workspace.paths.docs, raw);
    if (!resolved) {
        throw new ValidationError(
            "DOC_FOLDER_INVALID",
            `Document folder must stay inside ${workspace.config.docs.managedPath}: ${folder}`,
            { folder }
        );
    }
    return normalizeRepoPath(relative(workspace.paths.docs, resolved));
}

/**
 * Where a new document is written: an explicit `folder` always wins, otherwise
 * `docs.layout` decides ("kind" groups by document kind, "flat" uses the root).
 */
function targetFolder(workspace, input, kind) {
    if (input?.folder !== undefined && input?.folder !== null) {
        return normalizeDocumentFolder(workspace, input.folder);
    }
    if (workspace.config.docs.layout === "kind") {
        return normalizeDocumentFolder(workspace, kind);
    }
    return "";
}

export async function nextDocumentSequence(workspace) {
    return (await maxSequence(workspace.paths.docs, workspace.config.docs.idPrefix)) + 1;
}

export async function createManagedDocument(
    workspace,
    input,
    { maxRetries = 32, now }: any = {}
) {
    ensureWritable(workspace);
    if (!input?.title?.trim()) {
        throw new ValidationError("DOC_TITLE_REQUIRED", "title is required.");
    }
    const instant = now ? new Date(now) : new Date();
    const date = instant.toISOString().slice(0, 10);
    const loaded = await loadManagedDocuments(workspace);
    const base = {
        id: "pending",
        title: input.title.trim(),
        kind: input.kind || workspace.config.docs.defaultKind,
        status: input.status || workspace.config.docs.defaultStatus,
        ...(input.owners?.length ? { owners: input.owners } : {}),
        ...(input.related?.length ? { related: input.related } : {}),
        ...(input.supersedes?.length ? { supersedes: input.supersedes } : {}),
        ...(input.scope?.length ? { scope: input.scope } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        ...(input.reviewed ? { reviewed: input.reviewed } : {}),
        ...(input.review_interval_days != null
            ? { review_interval_days: input.review_interval_days }
            : {}),
        created: date,
        updated: date
    };
    validateManagedDocument(workspace, base, loaded.documents, null);
    const folder = targetFolder(workspace, input, base.kind);
    return reserveRecordId(
        {
            prefix: workspace.config.docs.idPrefix,
            // Managed documents nest in folders, so this listing has to be
            // recursive — a flat one is a half-fix that still mints duplicates.
            directories: [workspace.paths.docs],
            lockDirectory: join(workspace.paths.cache, "locks", "ids"),
            maxRetries,
            code: "DOC_ID_ALLOCATION_FAILED"
        },
        async (id) => {
            const name = `${id}-${slugify(input.title)}.md`;
            const file = folder ? `${folder}/${name}` : name;
            const path = join(workspace.paths.docs, file);
            const metadata = { ...base, id };
            validateManagedDocument(workspace, metadata, loaded.documents, null);
            const content = renderManagedDocument(metadata, input.body);
            await createFileExclusive(path, content);
            const info = await stat(path);
            const document = normalizeDocument({
                file,
                repoPath: relative(workspace.root, path),
                content,
                managed: true,
                modifiedAt: info.mtime.toISOString(),
                sizeBytes: info.size
            });
            return { id, file, path, revision: document.revision, document };
        }
    );
}

function findManagedDocument(documents, id) {
    const matches = documents.filter((document) => document.id === id);
    if (!matches.length) {
        throw new NotFoundError("DOC_NOT_FOUND", `Document not found: ${id}`);
    }
    if (matches.length > 1) {
        throw new ConflictError(
            "DOC_ID_AMBIGUOUS",
            `Document ID ${id} appears in multiple files.`,
            { files: matches.map((document) => document.file) }
        );
    }
    return matches[0];
}

const PATCHABLE = new Set([
    "title",
    "kind",
    "status",
    "owners",
    "related",
    "supersedes",
    "scope",
    "tags",
    "reviewed",
    "review_interval_days",
    "body"
]);

export async function patchManagedDocument(
    workspace,
    id,
    changes,
    { expectedRevision }: any = {}
) {
    ensureWritable(workspace);
    return withFileLock(
        join(workspace.paths.cache, "locks", "docs", `${id}.lock`),
        async () => {
            const loaded = await loadManagedDocuments(workspace);
            const current = findManagedDocument(loaded.documents, id);
            const path = resolve(workspace.root, current.path);
            const content = await readFile(path, "utf8");
            const actualRevision = revisionForContent(content);
            if (expectedRevision && expectedRevision !== actualRevision) {
                throw new ConflictError(
                    "DOC_WRITE_CONFLICT",
                    "The document changed after it was loaded.",
                    {
                        id,
                        expectedRevision,
                        actualRevision,
                        current: { ...current, revision: actualRevision }
                    }
                );
            }
            const safe: Record<string, any> = {};
            for (const [key, value] of Object.entries(changes || {})) {
                if (!PATCHABLE.has(key)) {
                    throw new ValidationError(
                        "DOC_FIELD_NOT_PATCHABLE",
                        `Field cannot be patched: ${key}`
                    );
                }
                safe[key] = value;
            }
            const { body: nextBody, ...requestedMetadataChanges } = safe;
            const updated = new Date().toISOString().slice(0, 10);
            const metadataChanges = {
                ...requestedMetadataChanges,
                updated
            };
            const candidate = {
                id,
                title: current.title,
                kind: current.documentKind,
                status: current.status,
                created: current.created,
                updated,
                owners: current.owners,
                related: current.related,
                supersedes: current.supersedes,
                scope: current.scope,
                tags: current.tags,
                reviewed: current.reviewed,
                review_interval_days: current.review_interval_days,
                ...metadataChanges
            };
            validateManagedDocument(workspace, candidate, loaded.documents, id);
            let next = patchFrontmatter(content, metadataChanges, {
                listKeys: DOC_LIST_KEYS
            });
            if (nextBody !== undefined) {
                next = replaceBody(next, String(nextBody));
            }
            await writeFileAtomic(path, next);
            const info = await stat(path);
            const document = normalizeDocument({
                file: current.file,
                repoPath: current.path,
                content: next,
                managed: true,
                modifiedAt: info.mtime.toISOString(),
                sizeBytes: info.size
            });
            return { id, file: current.file, path, revision: document.revision, document };
        },
        { metadata: { module: "docs", recordId: id } }
    );
}


/**
 * Move a managed document to another folder below `docs.managedPath`.
 *
 * The ID never changes: folders are organization, not identity. The file
 * content is untouched, so the revision is stable and the move is idempotent.
 */
export async function moveManagedDocument(
    workspace,
    id,
    { folder, expectedRevision }: any = {}
) {
    ensureWritable(workspace);
    if (folder === undefined || folder === null) {
        throw new ValidationError(
            "DOC_FOLDER_REQUIRED",
            "folder is required; use an empty string for the managed root."
        );
    }
    const target = normalizeDocumentFolder(workspace, folder);
    return withFileLock(
        join(workspace.paths.cache, "locks", "docs", `${id}.lock`),
        async () => {
            const loaded = await loadManagedDocuments(workspace);
            const current = findManagedDocument(loaded.documents, id);
            const from = resolve(workspace.root, current.path);
            const content = await readFile(from, "utf8");
            const actualRevision = revisionForContent(content);
            if (expectedRevision && expectedRevision !== actualRevision) {
                throw new ConflictError(
                    "DOC_WRITE_CONFLICT",
                    "The document changed after it was loaded.",
                    { id, expectedRevision, actualRevision }
                );
            }
            const name = basename(current.file);
            const file = target ? `${target}/${name}` : name;
            const to = join(workspace.paths.docs, file);
            if (to !== from) {
                if (await exists(to)) {
                    throw new ConflictError(
                        "DOC_MOVE_TARGET_EXISTS",
                        `A file already exists at the destination: ${normalizeRepoPath(
                            relative(workspace.root, to)
                        )}`,
                        { id, folder: target }
                    );
                }
                await mkdir(dirname(to), { recursive: true });
                await rename(from, to);
                await pruneEmptyFolders(dirname(from), workspace.paths.docs);
            }
            const info = await stat(to);
            const document = normalizeDocument({
                file,
                repoPath: normalizeRepoPath(relative(workspace.root, to)),
                content,
                managed: true,
                modifiedAt: info.mtime.toISOString(),
                sizeBytes: info.size
            });
            return {
                id,
                file,
                path: to,
                previousPath: current.path,
                folder: target,
                revision: document.revision,
                document
            };
        },
        { metadata: { module: "docs", recordId: id } }
    );
}

export async function pathExistsWithinWorkspace(workspace, repoPath) {
    if (!repoPath) return false;
    const absolute = resolve(workspace.root, repoPath);
    const rel = relative(workspace.root, absolute);
    if (rel.startsWith("..") || rel === "" && repoPath !== ".") return false;
    try {
        await access(absolute);
        return true;
    } catch {
        return false;
    }
}
