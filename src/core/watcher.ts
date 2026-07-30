import { watch } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { canDescendInto, normalizeRepoPath } from "./glob.js";

/**
 * Files the watcher must never report.
 *
 * `writeFileAtomic` creates `.{uuid}.tmp` in the destination directory and
 * renames it, so every single protocol write produces two events for a file
 * that never existed as far as callers are concerned.
 */
function isNoise(name) {
    return name.startsWith(".") || !name.endsWith(".md");
}

async function collectDirectories(root, include, exclude, limit) {
    const directories = [];
    const queue = [""];
    while (queue.length && directories.length < limit) {
        const current = queue.shift();
        directories.push(current);
        let entries;
        try {
            entries = await readdir(resolve(root, current), {
                withFileTypes: true
            });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".git")) continue;
            const child = current ? `${current}/${entry.name}` : entry.name;
            if (canDescendInto(child, include, exclude)) queue.push(child);
        }
    }
    return directories;
}

/**
 * Watches the protocol corpus and reports coalesced batches of changed paths.
 *
 * One non-recursive `fs.watch` per directory rather than a single recursive
 * one. The recursive form looks simpler and is what three separate reviews
 * proposed, but on a workspace of ~9 000 files the call itself blocks the event
 * loop for 604–804 ms doing a synchronous recursive readdir; placing ~230
 * individual watches over the same tree costs 4 ms.
 *
 * The watcher is a fast path, never the source of truth. Events can be dropped
 * — inotify has a bounded queue, network filesystems do not deliver at all —
 * so anything built on this must still reconcile. Here that is the index
 * fingerprint, which means a missed event costs latency and never correctness.
 */
export function createWorkspaceWatcher(
    workspace,
    {
        onChange,
        debounceMs = 120,
        maxDebounceMs = 1000,
        maxDirectories = 4096,
        // Above this many paths in one batch, the change is reported as a reset
        // rather than a list: a `git checkout` touching a thousand records is
        // not something a consumer should try to apply record by record.
        resetThreshold = 200
    }: any = {}
) {
    const protocolRoot = normalizeRepoPath(workspace.config.storage.root);
    const cacheRoot = normalizeRepoPath(workspace.config.storage.cache);
    const include = [
        `${protocolRoot}/**/*.md`,
        ...(workspace.config.docs.enabled
            ? workspace.config.docs.sources || []
            : [])
    ];
    const exclude = [
        `${cacheRoot}`,
        `${cacheRoot}/**`,
        "node_modules",
        "node_modules/**",
        ...(workspace.config.docs.exclude || [])
    ];

    const watchers = new Map();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstPendingAt = 0;
    let closed = false;
    let mode = "watch";

    function flush() {
        timer = null;
        firstPendingAt = 0;
        if (!pending.size) return;
        const paths = [...pending].sort();
        pending.clear();
        onChange?.(
            paths.length > resetThreshold
                ? { type: "reset", count: paths.length, paths: [] }
                : { type: "changed", count: paths.length, paths }
        );
    }

    function schedule(repoPath) {
        pending.add(repoPath);
        const now = Date.now();
        if (!firstPendingAt) firstPendingAt = now;
        if (timer) clearTimeout(timer);
        // A hard ceiling as well as a quiet period, so a sustained stream of
        // writes still reports rather than deferring forever.
        const wait = Math.min(debounceMs, Math.max(0, firstPendingAt + maxDebounceMs - now));
        timer = setTimeout(flush, wait);
        timer.unref?.();
    }

    function watchDirectory(relativeDirectory) {
        if (closed || watchers.has(relativeDirectory)) return;
        const absolute = resolve(workspace.root, relativeDirectory);
        let handle;
        try {
            handle = watch(absolute, { persistent: false }, (_event, name) => {
                if (!name) return;
                const fileName = basename(String(name));
                if (isNoise(fileName)) {
                    // A new directory still has to be picked up, and it will
                    // not look like a Markdown file.
                    if (!fileName.startsWith(".")) void adopt(relativeDirectory);
                    return;
                }
                schedule(
                    normalizeRepoPath(
                        relativeDirectory
                            ? `${relativeDirectory}/${fileName}`
                            : fileName
                    )
                );
            });
        } catch {
            return;
        }
        handle.on("error", () => {
            handle.close();
            watchers.delete(relativeDirectory);
        });
        watchers.set(relativeDirectory, handle);
    }

    async function adopt(parent) {
        let entries;
        try {
            entries = await readdir(resolve(workspace.root, parent), {
                withFileTypes: true
            });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
            const child = parent ? `${parent}/${entry.name}` : entry.name;
            if (
                !watchers.has(child) &&
                watchers.size < maxDirectories &&
                canDescendInto(child, include, exclude)
            ) {
                watchDirectory(child);
                await adopt(child);
            }
        }
    }

    /**
     * Confirms the platform actually delivers events before anything relies on
     * it. `fs.watch` is silent on network filesystems, on some container bind
     * mounts and under WSL2's `/mnt`, and a watcher that never fires is
     * indistinguishable from a workspace where nothing happens.
     */
    async function probe() {
        // Its own directory, and the file is left in place rather than removed.
        // Creating and deleting a file inside the workspace on every server
        // start is observable: a concurrent recursive copy would `readdir` the
        // probe and then `lstat` it after deletion, failing with ENOENT. The
        // file is five bytes in a gitignored cache and gets overwritten.
        const probeDirectory = join(workspace.paths.cache, "watch");
        const probePath = join(probeDirectory, "probe");
        return new Promise<boolean>((resolveProbe) => {
            let handle;
            const done = (result) => {
                clearTimeout(timeout);
                handle?.close();
                resolveProbe(result);
            };
            const timeout = setTimeout(() => done(false), 500);
            timeout.unref?.();
            void (async () => {
                try {
                    await mkdir(probeDirectory, { recursive: true });
                    await writeFile(probePath, "probe", { flag: "w" });
                    handle = watch(probeDirectory, { persistent: false }, () =>
                        done(true)
                    );
                    handle.on("error", () => done(false));
                    await writeFile(probePath, "probe again", { flag: "w" });
                } catch {
                    done(false);
                }
            })();
        });
    }

    return {
        get mode() {
            return mode;
        },
        get watchedDirectories() {
            return watchers.size;
        },
        async start() {
            if (!(await probe())) {
                mode = "unavailable";
                return { mode, watchedDirectories: 0 };
            }
            const directories = await collectDirectories(
                workspace.root,
                include,
                exclude,
                maxDirectories
            );
            for (const directory of directories) watchDirectory(directory);
            mode = "watch";
            return { mode, watchedDirectories: watchers.size };
        },
        close() {
            closed = true;
            if (timer) clearTimeout(timer);
            timer = null;
            for (const handle of watchers.values()) handle.close();
            watchers.clear();
            pending.clear();
        }
    };
}
