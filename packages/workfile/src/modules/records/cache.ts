import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";

/**
 * Bumped whenever the shape of a serialized record changes.
 *
 * The dangerous failure of a persisted cache is not a miss, it is a hit that
 * returns records built by an older normalizer — silently, and forever, because
 * the files it was derived from have not changed. Any edit to a `recordFrom*`
 * function, to the relationship decoration or to what `buildProjectIndex`
 * returns must raise this number.
 */
export const INDEX_CACHE_FORMAT = 3;

const CACHE_FILE = "index.json";

function cachePath(workspace) {
    return join(workspace.paths.cache, "index", CACHE_FILE);
}

/**
 * Configuration that changes what the index contains.
 *
 * Deliberately an explicit list rather than the whole config: a cache key that
 * covers everything invalidates on unrelated edits, and one derived implicitly
 * silently misses a field somebody adds later. `test/budgets.test.mjs` pins the
 * covered set.
 */
export function indexConfigSignature(workspace) {
    const config = workspace.config;
    return JSON.stringify({
        schemaVersion: config.schemaVersion,
        storage: config.storage,
        cards: {
            enabled: config.cards.enabled,
            path: config.cards.path,
            archivePath: config.cards.archivePath,
            areas: config.cards.areas
        },
        docs: {
            enabled: config.docs.enabled,
            managedPath: config.docs.managedPath,
            sources: config.docs.sources,
            exclude: config.docs.exclude,
            kinds: config.docs.kinds,
            statuses: config.docs.statuses
        },
        changelog: {
            enabled: config.changelog.enabled,
            fragmentsPath: config.changelog.fragmentsPath,
            releasesPath: config.changelog.releasesPath,
            types: config.changelog.types
        },
        memory: {
            enabled: config.memory.enabled,
            path: config.memory.path,
            collections: config.memory.collections
        }
    });
}

/**
 * Reads a previously persisted index, or null.
 *
 * Never authoritative. The Markdown on disk is canonical; this is a memoization
 * of the cost of reading it, and every path that consumes it revalidates the
 * fingerprint first. A corrupt or unreadable cache is a miss, not an error.
 */
export async function readIndexCache(workspace, { fingerprint, packageVersion }) {
    const path = cachePath(workspace);
    if (!(await exists(path))) return null;
    try {
        const cached = JSON.parse(await readFile(path, "utf8"));
        if (
            cached.format !== INDEX_CACHE_FORMAT ||
            cached.packageVersion !== packageVersion ||
            cached.fingerprint !== fingerprint ||
            cached.configSignature !== indexConfigSignature(workspace)
        ) {
            return null;
        }
        return cached.index;
    } catch {
        return null;
    }
}

export async function writeIndexCache(
    workspace,
    index,
    { fingerprint, packageVersion }
) {
    if (workspace.readOnly) return false;
    try {
        await writeFileAtomic(
            cachePath(workspace),
            `${JSON.stringify({
                format: INDEX_CACHE_FORMAT,
                packageVersion,
                fingerprint,
                configSignature: indexConfigSignature(workspace),
                writtenAt: new Date().toISOString(),
                index
            })}\n`
        );
        return true;
    } catch {
        // A cache that cannot be written is a slower tool, not a broken one.
        return false;
    }
}

export async function clearIndexCache(workspace) {
    await rm(join(workspace.paths.cache, "index"), {
        recursive: true,
        force: true
    }).catch(() => undefined);
}
