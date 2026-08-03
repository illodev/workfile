import { realpath, watch } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { exists } from "./fs-utils.js";
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
        /** Called when the watcher's own verdict about itself changes. */
        onState,
        debounceMs = 120,
        maxDebounceMs = 1000,
        maxDirectories = 4096,
        // Above this many paths in one batch, the change is reported as a reset
        // rather than a list: a `git checkout` touching a thousand records is
        // not something a consumer should try to apply record by record.
        resetThreshold = 200,
        /** Re-establish attempts per directory before the watcher gives up. */
        maxRecoveries = 3,
        // The primitive, overridable only so a dead handle can be delivered on
        // purpose. Neither branch that handles one is reachable on Linux, and
        // twenty-six Windows jobs never produced one either; see T-0113.
        watch: watchImpl = watch
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
    /**
     * The two ways `fs.watch` says "something changed and I cannot tell you
     * what". One is counted and dropped; the other is answered.
     *
     * `nameless` is a callback with no filename — libuv's Windows backend
     * emits one when `ReadDirectoryChangesW` completes without being able to
     * enumerate the changes, which is the platform asking for a re-scan. It is
     * still dropped, on evidence rather than on principle: twenty-six Windows
     * jobs across thirteen CI runs reported zero, and Linux names every event
     * of this shape. The counter stays, so a first sighting is a fact rather
     * than an argument. See T-0113.
     *
     * `errors` is a directory handle failing. That one is acted on now — see
     * `recover` — because it is not a platform quirk at all: any error, from
     * any cause, used to drop a directory out of the watch set while the mode
     * went on reporting health.
     */
    const dropped = { nameless: 0, errors: 0 };
    /** Re-establish attempts spent per directory, so a flapping handle ends. */
    const recoveries = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstPendingAt = 0;
    let closed = false;
    let mode = "watch";
    // The canonical spelling of the root, resolved in `start`. Watching the
    // path as given is not safe: on Windows a root reached through an 8.3
    // short name (RUNNER~1 in a runner's TEMP) aborts the whole process when
    // an event arrives, because libuv asserts the event path is prefixed by
    // the watched path; on macOS `tmpdir()` says /var while FSEvents answer
    // for /private/var.
    let watchRoot = workspace.root;

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
        const absolute = resolve(watchRoot, relativeDirectory);
        let handle;
        try {
            handle = watchImpl(absolute, { persistent: false }, (_event, name) => {
                if (!name) {
                    dropped.nameless += 1;
                    return;
                }
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
            dropped.errors += 1;
            handle.close();
            watchers.delete(relativeDirectory);
            void recover(relativeDirectory);
        });
        watchers.set(relativeDirectory, handle);
    }

    /**
     * Stops claiming to be watching.
     *
     * The interface stops polling the moment the server says `watch`, and
     * `watch.state` is published once, at start. So a watcher that loses
     * coverage later has to say so out loud or the UI sits on a stream that
     * will not deliver — the exact failure its own fallback exists to prevent.
     * Said once: a tree falling apart is one verdict, not one per directory.
     */
    function degrade() {
        if (mode === "unavailable") return;
        mode = "unavailable";
        onState?.({ mode, watchedDirectories: watchers.size });
    }

    /**
     * Answers a dead directory handle.
     *
     * A handle that fails on a directory which no longer exists is not a
     * broken promise: there is nothing left to report and dropping it is
     * right. A handle that fails on a directory that is still there is a
     * broken promise, and there are only two honest answers — re-establish the
     * watch, or stop saying `watch`.
     *
     * A recovered directory also reports a `reset`, because whatever happened
     * while it was unwatched was never delivered and a consumer that trusts
     * the stream is now behind. Bounded, because a handle that dies as fast as
     * it is created would otherwise re-establish forever.
     */
    async function recover(relativeDirectory) {
        if (closed) return;
        if (!(await exists(resolve(watchRoot, relativeDirectory)))) return;

        const spent = (recoveries.get(relativeDirectory) ?? 0) + 1;
        recoveries.set(relativeDirectory, spent);
        if (spent > maxRecoveries) return degrade();

        watchDirectory(relativeDirectory);
        if (!watchers.has(relativeDirectory)) return degrade();
        onChange?.({ type: "reset", count: 0, paths: [] });
    }

    async function adopt(parent) {
        let entries;
        try {
            entries = await readdir(resolve(watchRoot, parent), {
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
        const probeDirectory = resolve(watchRoot, cacheRoot, "watch");
        const probePath = join(probeDirectory, "probe");
        return new Promise<boolean>((resolveProbe) => {
            let handle;
            let timeout;
            const done = (result) => {
                clearTimeout(timeout);
                handle?.close();
                resolveProbe(result);
            };
            void (async () => {
                try {
                    await mkdir(probeDirectory, { recursive: true });
                    await writeFile(probePath, "probe", { flag: "w" });
                    handle = watchImpl(probeDirectory, { persistent: false }, () =>
                        done(true)
                    );
                    handle.on("error", () => done(false));
                    // The budget starts here, not around the whole function.
                    // What is under test is whether the platform delivers a
                    // notification at all; a mkdir and two writes prove
                    // nothing, and on a loaded Windows runner — where a
                    // filter driver sits in the I/O path — they can spend the
                    // allowance before the thing being measured begins. The
                    // watcher then reports itself unavailable on a filesystem
                    // that works, and the server caches that verdict for the
                    // life of the process.
                    //
                    // Deliberately referenced: the watch handle is
                    // non-persistent, so in an otherwise idle process an
                    // unref'd timeout leaves nothing holding the event loop,
                    // and the probe's promise is abandoned rather than
                    // resolved. Held at most 500 ms and cleared on answer.
                    timeout = setTimeout(() => done(false), 500);
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
        /** Signals `fs.watch` sent that this watcher threw away. */
        get dropped() {
            return { ...dropped };
        },
        async start() {
            watchRoot = await new Promise((done) =>
                realpath.native(workspace.root, (error, canonical) =>
                    done(error ? workspace.root : canonical)
                )
            );
            if (!(await probe())) {
                mode = "unavailable";
                return { mode, watchedDirectories: 0 };
            }
            const directories = await collectDirectories(
                watchRoot,
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
