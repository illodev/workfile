import { randomUUID } from "node:crypto";
import {
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    stat
} from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { discoverFiles, normalizeRepoPath } from "../../core/glob.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import {
    DEFAULT_LIST_KEYS,
    parseFrontmatter,
    patchFrontmatter,
    requireFrontmatter,
    serializeValue
} from "../../core/frontmatter.js";
import { withFileLock } from "../../core/locks.js";
import { revisionForContent } from "../../core/revision.js";
import { ensureWritable } from "../../core/guards.js";
import {
    isResourceExhaustion,
    mapWithConcurrency
} from "../../core/concurrency.js";

export const CHANGE_LIST_KEYS = new Set([
    ...DEFAULT_LIST_KEYS,
    "cards",
    "issues",
    "decisions",
    "related",
    "fragments"
]);

export const CHANGE_REQUIRED_KEYS = Object.freeze([
    "id",
    "title",
    "type",
    "area",
    "visibility",
    "created",
    "updated"
]);

export const RELEASE_REQUIRED_KEYS = Object.freeze([
    "id",
    "title",
    "version",
    "date",
    "fragments"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function slugify(value, fallback = "change") {
    return (
        String(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 70) || fallback
    );
}


function renderRecord(metadata, body = "") {
    const lines = Object.entries(metadata).map(
        ([key, value]) => `${key}: ${serializeValue(key, value, CHANGE_LIST_KEYS)}`
    );
    return `---\n${lines.join("\n")}\n---\n\n${String(body).trim()}\n`;
}

function normalizeFragment({ file, repoPath, content, released = false }) {
    const parsed = parseFrontmatter(content, { listKeys: CHANGE_LIST_KEYS });
    if (!parsed) {
        throw new ValidationError(
            "CHANGE_FRONTMATTER_REQUIRED",
            `Changelog fragment has no frontmatter: ${repoPath}`
        );
    }
    const metadata = parsed.metadata;
    return {
        id: metadata.id,
        // Literal, not `string`: `loadChangelog` splits one array of these into
        // fragments and releases by this field, and only a discriminated union
        // lets that filter narrow.
        kind: "change" as const,
        recordType: metadata.type,
        title: metadata.title,
        path: normalizeRepoPath(repoPath),
        file,
        body: parsed.body.trim(),
        type: metadata.type,
        area: metadata.area,
        visibility: metadata.visibility,
        released,
        ...(metadata.cards?.length ? { cards: metadata.cards } : {}),
        ...(metadata.issues?.length ? { externalIssues: metadata.issues } : {}),
        ...(metadata.decisions?.length ? { decisions: metadata.decisions } : {}),
        ...(metadata.related?.length ? { related: metadata.related } : {}),
        ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
        ...(metadata.created ? { created: metadata.created } : {}),
        ...(metadata.updated ? { updated: metadata.updated } : {}),
        revision: revisionForContent(content),
        metadata
    };
}

function normalizeRelease({ file, repoPath, content }) {
    const parsed = parseFrontmatter(content, { listKeys: CHANGE_LIST_KEYS });
    if (!parsed) {
        throw new ValidationError(
            "RELEASE_FRONTMATTER_REQUIRED",
            `Release record has no frontmatter: ${repoPath}`
        );
    }
    const metadata = parsed.metadata;
    return {
        id: metadata.id,
        kind: "release" as const,
        recordType: "release",
        title: metadata.title,
        path: normalizeRepoPath(repoPath),
        file,
        body: parsed.body.trim(),
        version: metadata.version,
        date: metadata.date,
        fragments: metadata.fragments || [],
        ...(metadata.commit ? { commit: metadata.commit } : {}),
        ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
        created: metadata.date,
        updated: metadata.date,
        revision: revisionForContent(content),
        metadata
    };
}

async function readHistoryFile(workspace, repoPath, released) {
    const absolute = resolve(workspace.root, repoPath);
    const content = await readFile(absolute, "utf8");
    const parsed = parseFrontmatter(content, { listKeys: CHANGE_LIST_KEYS });
    if (parsed?.metadata?.version && parsed.metadata.fragments) {
        return normalizeRelease({ file: basename(repoPath), repoPath, content });
    }
    return normalizeFragment({
        file: basename(repoPath),
        repoPath,
        content,
        released
    });
}

async function loadPathSet(workspace, absoluteRoot, released) {
    const repoRoot = normalizeRepoPath(relative(workspace.root, absoluteRoot));
    const paths = await discoverFiles(workspace.root, {
        include: [`${repoRoot}/**/*.md`, `${repoRoot}/*.md`],
        exclude: []
    });
    // Read in parallel, as `loadCardDirectory` does. A changelog kept per day
    // accumulates fragments fast — Fube holds 1 160 files, where awaiting one
    // read at a time costs 452 ms against 196 ms. Bounded, so a large workspace
    // cannot exhaust the process's descriptors mid-read.
    const results = await mapWithConcurrency(paths, async (repoPath) => {
        try {
            return {
                record: await readHistoryFile(workspace, repoPath, released)
            };
        } catch (error) {
            if (isResourceExhaustion(error)) throw error;
            return { file: repoPath, reason: error.message };
        }
    });
    return {
        // `paths` arrives sorted and the pool preserves order, so the
        // records keep the order the callers already sort on.
        records: results.filter((entry) => entry.record).map((entry) => entry.record),
        unreadable: results
            .filter((entry) => !entry.record)
            .map(({ file, reason }) => ({ file, reason }))
    };
}

export async function loadChangelog(workspace) {
    if (!workspace.config.changelog.enabled) {
        return { fragments: [], releases: [], unreadable: [] };
    }
    const [unreleased, released] = await Promise.all([
        loadPathSet(workspace, workspace.paths.changelogFragments, false),
        loadPathSet(workspace, workspace.paths.changelogReleases, true)
    ]);
    const records = [...unreleased.records, ...released.records];
    const releases = records.filter((record) => record.kind === "release");
    const releaseByFragment = new Map();
    for (const release of releases) {
        for (const id of release.fragments) {
            if (!releaseByFragment.has(id)) releaseByFragment.set(id, []);
            releaseByFragment.get(id).push(release.id);
        }
    }
    const fragments = records
        .filter((record) => record.kind === "change")
        .map((fragment) => ({
            ...fragment,
            ...(releaseByFragment.has(fragment.id)
                ? { releaseIds: releaseByFragment.get(fragment.id) }
                : {})
        }));
    return {
        fragments: fragments.sort((left, right) =>
            left.id.localeCompare(right.id, undefined, { numeric: true })
        ),
        releases: releases.sort(
            (left, right) =>
                String(right.date || "").localeCompare(String(left.date || "")) ||
                // Newest first also on ties: two releases cut the same day
                // rendered oldest-first, which put 0.1.1 above 0.1.2 in the
                // published CHANGELOG. A higher release id is a later release.
                right.id.localeCompare(left.id, undefined, { numeric: true })
        ),
        unreadable: [...unreleased.unreadable, ...released.unreadable]
    };
}

function validateVersion(workspace, version) {
    const value = String(version || "").trim();
    if (!value) {
        throw new ValidationError("RELEASE_VERSION_REQUIRED", "version is required.");
    }
    if (
        workspace.config.changelog.releaseStrategy === "semver" &&
        !SEMVER_RE.test(value)
    ) {
        throw new ValidationError(
            "RELEASE_VERSION_INVALID",
            `Expected a semantic version, received: ${value}`
        );
    }
    if (
        workspace.config.changelog.releaseStrategy === "calendar" &&
        !DATE_RE.test(value)
    ) {
        throw new ValidationError(
            "RELEASE_VERSION_INVALID",
            `Expected a YYYY-MM-DD calendar version, received: ${value}`
        );
    }
    return value;
}

function validateFragment(workspace, fragment, existing = [], currentId = null) {
    const missing = CHANGE_REQUIRED_KEYS.filter((key) => !fragment[key]);
    if (missing.length) {
        throw new ValidationError(
            "CHANGE_REQUIRED_FIELDS_MISSING",
            `Missing required fields: ${missing.join(", ")}`
        );
    }
    const escaped = workspace.config.changelog.idPrefix.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
    if (
        fragment.id !== "pending" &&
        !new RegExp(`^${escaped}-\\d{4,}$`).test(fragment.id)
    ) {
        throw new ValidationError(
            "CHANGE_ID_INVALID",
            `Invalid changelog fragment ID: ${fragment.id}`
        );
    }
    if (!workspace.config.changelog.types.includes(fragment.type)) {
        throw new ValidationError(
            "CHANGE_TYPE_INVALID",
            `Invalid changelog type: ${fragment.type}`
        );
    }
    if (!workspace.config.changelog.visibilities.includes(fragment.visibility)) {
        throw new ValidationError(
            "CHANGE_VISIBILITY_INVALID",
            `Invalid changelog visibility: ${fragment.visibility}`
        );
    }
    if (!workspace.config.cards.areas.includes(fragment.area)) {
        throw new ValidationError(
            "CHANGE_AREA_INVALID",
            `Invalid changelog area: ${fragment.area}`
        );
    }
    for (const key of ["created", "updated"]) {
        if (fragment[key] && !DATE_RE.test(fragment[key])) {
            throw new ValidationError("CHANGE_DATE_INVALID", `${key} must use YYYY-MM-DD`);
        }
    }
    if (fragment.created && fragment.updated && fragment.created > fragment.updated) {
        throw new ValidationError(
            "CHANGE_DATE_RANGE_INVALID",
            "updated cannot be before created"
        );
    }
    if (
        existing.some(
            (candidate) =>
                fragment.id !== "pending" &&
                candidate.id === fragment.id &&
                candidate.id !== currentId
        )
    ) {
        throw new ConflictError(
            "CHANGE_ID_DUPLICATE",
            `Changelog fragment ID already exists: ${fragment.id}`
        );
    }
}

async function maxSequence(paths, prefix) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}-(\\d+)$`);
    return paths.reduce((maximum, id) => {
        const match = String(id || "").match(pattern);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
}

async function allocateId(workspace, { prefix, ids, maxRetries = 64 }) {
    let sequence = (await maxSequence(ids, prefix)) + 1;
    for (let attempt = 0; attempt < maxRetries; attempt += 1, sequence += 1) {
        const id = `${prefix}-${String(sequence).padStart(4, "0")}`;
        const reservation = join(workspace.paths.cache, "locks", "ids", `${id}.lock`);
        try {
            await createFileExclusive(
                reservation,
                `${JSON.stringify({ id, pid: process.pid, createdAt: new Date().toISOString() })}\n`
            );
            return { id, reservation };
        } catch (error) {
            if (error?.code !== "EEXIST") throw error;
        }
    }
    throw new ConflictError(
        "RECORD_ID_ALLOCATION_FAILED",
        `Unable to allocate an ID with prefix ${prefix}.`
    );
}

export async function createChangeFragment(workspace, input, { now }: any = {}) {
    ensureWritable(workspace);
    if (!input?.title?.trim()) {
        throw new ValidationError("CHANGE_TITLE_REQUIRED", "title is required.");
    }
    const instant = now ? new Date(now) : new Date();
    const date = instant.toISOString().slice(0, 10);
    const loaded = await loadChangelog(workspace);
    const base = {
        id: "pending",
        title: input.title.trim(),
        type: input.type || workspace.config.changelog.defaultType,
        area: input.area || workspace.config.cards.areas[0],
        visibility:
            input.visibility || workspace.config.changelog.defaultVisibility,
        ...(input.cards?.length ? { cards: input.cards } : {}),
        ...(input.issues?.length ? { issues: input.issues } : {}),
        ...(input.decisions?.length ? { decisions: input.decisions } : {}),
        ...(input.related?.length ? { related: input.related } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        created: date,
        updated: date
    };
    validateFragment(workspace, base, loaded.fragments);
    const allocation = await allocateId(workspace, {
        prefix: workspace.config.changelog.idPrefix,
        ids: loaded.fragments.map((fragment) => fragment.id)
    });
    try {
        const metadata = { ...base, id: allocation.id };
        validateFragment(workspace, metadata, loaded.fragments);
        const file = `${allocation.id}-${slugify(input.title)}.md`;
        const path = join(workspace.paths.changelogFragments, file);
        const content = renderRecord(metadata, input.body);
        await createFileExclusive(path, content);
        const fragment = normalizeFragment({
            file,
            repoPath: relative(workspace.root, path),
            content,
            released: false
        });
        return { id: allocation.id, file, path, revision: fragment.revision, fragment };
    } finally {
        await rm(allocation.reservation, { force: true }).catch(() => undefined);
    }
}

function findUnreleased(fragments, id) {
    const matches = fragments.filter((fragment) => fragment.id === id && !fragment.released);
    if (!matches.length) {
        throw new NotFoundError(
            "CHANGE_FRAGMENT_NOT_FOUND",
            `Unreleased changelog fragment not found: ${id}`
        );
    }
    if (matches.length > 1) {
        throw new ConflictError(
            "CHANGE_ID_AMBIGUOUS",
            `Changelog fragment ID ${id} appears in multiple files.`
        );
    }
    return matches[0];
}

const PATCHABLE = new Set([
    "title",
    "type",
    "area",
    "visibility",
    "cards",
    "issues",
    "decisions",
    "related",
    "tags",
    "body"
]);

export async function patchChangeFragment(
    workspace,
    id,
    changes,
    { expectedRevision }: any = {}
) {
    ensureWritable(workspace);
    return withFileLock(
        join(workspace.paths.cache, "locks", "changelog", `${id}.lock`),
        async () => {
            const loaded = await loadChangelog(workspace);
            const current = findUnreleased(loaded.fragments, id);
            const path = resolve(workspace.root, current.path);
            const content = await readFile(path, "utf8");
            const actualRevision = revisionForContent(content);
            if (expectedRevision && expectedRevision !== actualRevision) {
                throw new ConflictError(
                    "CHANGE_WRITE_CONFLICT",
                    "The changelog fragment changed after it was loaded.",
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
                        "CHANGE_FIELD_NOT_PATCHABLE",
                        `Field cannot be patched: ${key}`
                    );
                }
                safe[key] = value;
            }
            const { body: nextBody, ...requested } = safe;
            const updated = new Date().toISOString().slice(0, 10);
            const candidate = {
                id,
                title: current.title,
                type: current.type,
                area: current.area,
                visibility: current.visibility,
                cards: current.cards,
                issues: current.externalIssues,
                decisions: current.decisions,
                related: current.related,
                tags: current.tags,
                created: current.created,
                updated,
                ...requested
            };
            validateFragment(workspace, candidate, loaded.fragments, id);
            let next = patchFrontmatter(
                content,
                { ...requested, updated },
                { listKeys: CHANGE_LIST_KEYS }
            );
            if (nextBody !== undefined) {
                const parsed = requireFrontmatter(next, { listKeys: CHANGE_LIST_KEYS });
                next = `${next.slice(0, parsed.prefixLength)}${String(nextBody).trim()}\n`;
            }
            await writeFileAtomic(path, next);
            const fragment = normalizeFragment({
                file: current.file,
                repoPath: current.path,
                content: next,
                released: false
            });
            return { id, path, revision: fragment.revision, fragment };
        },
        { metadata: { module: "changelog", recordId: id } }
    );
}

function groupsForFragments(workspace, fragments, { visibility }: any = {}) {
    const visible = visibility
        ? fragments.filter((fragment) => fragment.visibility === visibility)
        : fragments;
    return workspace.config.changelog.types
        .map((type) => ({
            type,
            fragments: visible
                .filter((fragment) => fragment.type === type)
                .sort(
                    (left, right) =>
                        left.area.localeCompare(right.area) ||
                        left.title.localeCompare(right.title) ||
                        left.id.localeCompare(right.id, undefined, { numeric: true })
                )
        }))
        .filter((group) => group.fragments.length);
}

const TYPE_HEADINGS = {
    added: "Added",
    changed: "Changed",
    fixed: "Fixed",
    deprecated: "Deprecated",
    removed: "Removed",
    security: "Security",
    internal: "Internal"
};

export function renderFragmentGroups(workspace, fragments, options: any = {}) {
    const groups = groupsForFragments(workspace, fragments, options);
    return groups
        .map((group) => {
            const heading = TYPE_HEADINGS[group.type] || group.type;
            const items = group.fragments.map((fragment) => {
                const links = [
                    ...(fragment.cards || []),
                    ...(fragment.decisions || [])
                ];
                const suffix = links.length ? ` (${links.join(", ")})` : "";
                return `- ${fragment.title}${suffix}`;
            });
            return `### ${heading}\n\n${items.join("\n")}`;
        })
        .join("\n\n");
}

export async function previewRelease(workspace, options: any = {}) {
    const loaded = await loadChangelog(workspace);
    const requested = options.fragmentIds?.length
        ? new Set(options.fragmentIds)
        : null;
    const fragments = loaded.fragments.filter(
        (fragment) => !fragment.released && (!requested || requested.has(fragment.id))
    );
    if (requested) {
        const found = new Set(fragments.map((fragment) => fragment.id));
        const missing = [...requested].filter((id) => !found.has(id));
        if (missing.length) {
            throw new NotFoundError(
                "CHANGE_FRAGMENT_NOT_FOUND",
                `Unreleased changelog fragments not found: ${missing.join(", ")}`
            );
        }
    }
    return {
        fragments,
        groups: groupsForFragments(workspace, fragments),
        markdown: renderFragmentGroups(workspace, fragments, options)
    };
}

export async function createRelease(workspace, input, { now }: any = {}) {
    ensureWritable(workspace);
    const version = validateVersion(workspace, input?.version);
    return withFileLock(
        join(workspace.paths.cache, "locks", "changelog", "release.lock"),
        async () => {
            const instant = now ? new Date(now) : new Date();
            const date = input.date || instant.toISOString().slice(0, 10);
            if (!DATE_RE.test(date)) {
                throw new ValidationError("RELEASE_DATE_INVALID", "date must use YYYY-MM-DD");
            }
            const loaded = await loadChangelog(workspace);
            if (loaded.releases.some((release) => release.version === version)) {
                throw new ConflictError(
                    "RELEASE_VERSION_DUPLICATE",
                    `Release version already exists: ${version}`
                );
            }
            const preview = await previewRelease(workspace, {
                fragmentIds: input.fragmentIds,
                visibility: input.visibility
            });
            if (!preview.fragments.length) {
                throw new ValidationError(
                    "RELEASE_FRAGMENTS_REQUIRED",
                    "A release must consume at least one unreleased fragment."
                );
            }
            const allocation = await allocateId(workspace, {
                prefix: workspace.config.changelog.releasePrefix,
                ids: loaded.releases.map((release) => release.id)
            });
            const releaseDirName = slugify(version, "release");
            const finalDirectory = join(workspace.paths.changelogReleases, releaseDirName);
            const stage = join(
                workspace.paths.cache,
                "release-staging",
                `${releaseDirName}-${randomUUID()}`
            );
            const stageFragments = join(stage, "fragments");
            const moved = [];
            try {
                try {
                    await stat(finalDirectory);
                    throw new ConflictError(
                        "RELEASE_DIRECTORY_EXISTS",
                        `Release directory already exists: ${releaseDirName}`
                    );
                } catch (error) {
                    if (error instanceof ConflictError) throw error;
                    if (error?.code !== "ENOENT") throw error;
                }
                await mkdir(stageFragments, { recursive: true });
                for (const fragment of preview.fragments) {
                    const source = resolve(workspace.root, fragment.path);
                    const target = join(stageFragments, fragment.file);
                    await rename(source, target);
                    moved.push({ source, target });
                }
                const metadata = {
                    id: allocation.id,
                    title: input.title || `Version ${version}`,
                    version,
                    date,
                    fragments: preview.fragments.map((fragment) => fragment.id),
                    ...(input.commit ? { commit: input.commit } : {}),
                    ...(input.tags?.length ? { tags: input.tags } : {})
                };
                const releaseFile = `${allocation.id}-${slugify(version, "release")}.md`;
                const content = renderRecord(metadata, input.body);
                await createFileExclusive(join(stage, releaseFile), content);
                await mkdir(workspace.paths.changelogReleases, { recursive: true });
                await rename(stage, finalDirectory);
                const release = normalizeRelease({
                    file: releaseFile,
                    repoPath: relative(
                        workspace.root,
                        join(finalDirectory, releaseFile)
                    ),
                    content
                });
                return {
                    id: allocation.id,
                    version,
                    directory: finalDirectory,
                    release,
                    fragments: preview.fragments
                };
            } catch (error) {
                for (const move of moved.reverse()) {
                    await mkdir(resolve(move.source, ".."), { recursive: true }).catch(
                        () => undefined
                    );
                    await rename(move.target, move.source).catch(() => undefined);
                }
                await rm(stage, { recursive: true, force: true }).catch(() => undefined);
                throw error;
            } finally {
                await rm(allocation.reservation, { force: true }).catch(() => undefined);
            }
        },
        { metadata: { module: "changelog", operation: "release", version } }
    );
}

export async function renderChangelog(workspace, options: any = {}) {
    const loaded = await loadChangelog(workspace);
    const visibility = options.visibility || "public";
    const sections = [];
    const unreleased = loaded.fragments.filter((fragment) => !fragment.released);
    const unreleasedBody = renderFragmentGroups(workspace, unreleased, { visibility });
    if (unreleasedBody) sections.push(`## Unreleased\n\n${unreleasedBody}`);
    for (const release of loaded.releases) {
        const ids = new Set(release.fragments);
        const fragments = loaded.fragments.filter((fragment) => ids.has(fragment.id));
        const body = renderFragmentGroups(workspace, fragments, { visibility });
        if (!body && !release.body) continue;
        sections.push(
            `## ${release.version} — ${release.date}\n\n${[release.body, body]
                .filter(Boolean)
                .join("\n\n")}`
        );
    }
    return `# Changelog\n\n${sections.join("\n\n")}\n`;
}

export async function writeRenderedChangelog(workspace, options: any = {}) {
    ensureWritable(workspace);
    const output = resolve(workspace.root, workspace.config.changelog.output);
    const rel = relative(workspace.root, output);
    if (rel.startsWith("..")) {
        throw new ValidationError(
            "CHANGELOG_OUTPUT_OUTSIDE_WORKSPACE",
            "changelog.output resolves outside the workspace."
        );
    }
    const content = await renderChangelog(workspace, options);
    await writeFileAtomic(output, content);
    return { path: output, content };
}
