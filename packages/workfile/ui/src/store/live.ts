import { useEffect, useRef, useState } from "react";

export interface WorkspaceChange {
    /** Repo-relative paths, empty for a reset. */
    paths: string[];
    /** True when the change was too large to describe path by path. */
    reset: boolean;
    epoch: number;
}

type Listener = (change: WorkspaceChange) => void;

/**
 * Subscribes to the server's change stream, falling back to polling.
 *
 * The interesting writes are the ones this browser did not make: an agent
 * moving a card over MCP, a `git checkout`, an editor saving a document. The
 * previous design could only notice those by re-fetching the entire corpus
 * every thirty seconds — and only for the views that shared that one poll, so
 * Docs, History, Memory and Health never noticed them at all.
 *
 * Polling stays as the fallback because `fs.watch` is silent on network
 * filesystems and some container mounts, and a UI that quietly stops updating
 * is worse than one that updates slowly.
 */
export function createLiveConnection({
    url = "/api/v2/events",
    fallbackIntervalMs = 30_000
} = {}) {
    const listeners = new Set<Listener>();
    let source: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let serverId: string | null = null;
    let failures = 0;
    let epoch = 0;

    function emit(change: WorkspaceChange) {
        for (const listener of [...listeners]) listener(change);
    }

    function startFallback() {
        if (fallbackTimer) return;
        fallbackTimer = setInterval(() => {
            // No information about *what* changed, so everything is suspect.
            emit({ paths: [], reset: true, epoch: ++epoch });
        }, fallbackIntervalMs);
    }

    function stopFallback() {
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
    }

    /**
     * Polling stops only once the server says it is watching.
     *
     * `pending` keeps it running rather than assuming the best: the watcher is
     * started on the first subscriber and takes anywhere from milliseconds to
     * half a second to arm, and `unavailable` means it never will.
     */
    function applyWatchState(mode?: string) {
        if (mode === "watch") stopFallback();
        else startFallback();
    }

    function connect() {
        // The static demo has no server behind it: no stream, and no polling
        // either, because nothing can change underneath it.
        if (import.meta.env.VITE_DEMO === "1") return;
        if (typeof EventSource === "undefined") {
            startFallback();
            return;
        }
        source = new EventSource(url);

        source.addEventListener("hello", (event) => {
            failures = 0;
            const data = JSON.parse((event as MessageEvent).data);
            // An open stream is not a working one. The server starts its
            // watcher lazily and answers before it is up, and the watcher can
            // come up unable to deliver at all — so stopping the poll on
            // `hello` alone is how this connection used to go quiet for good on
            // a filesystem `fs.watch` says nothing about.
            applyWatchState(data.watcher?.mode);
            // A different process means its event ids restarted, so anything
            // held from before it is untrustworthy.
            if (serverId && serverId !== data.serverId) {
                emit({ paths: [], reset: true, epoch: ++epoch });
            }
            serverId = data.serverId;
        });

        // Sent once the watcher settles, again if a later attempt succeeds
        // where an earlier one failed, and again if it loses coverage while
        // running — a directory whose handle dies and cannot be re-established
        // arrives here rather than leaving this client on a stream that has
        // quietly stopped covering part of the tree.
        source.addEventListener("watch.state", (event) => {
            const data = JSON.parse((event as MessageEvent).data || "{}");
            applyWatchState(data.mode);
            // Either way: whatever happened while nothing was watching went
            // unreported, so the corpus is suspect. It also settles the
            // connection indicator, which re-reads the mode only when a change
            // arrives and would otherwise keep claiming "sse live" on a
            // connection that had already fallen back to polling.
            emit({ paths: [], reset: true, epoch: ++epoch });
        });

        source.addEventListener("records.changed", (event) => {
            const data = JSON.parse((event as MessageEvent).data);
            epoch = data.epoch ?? epoch + 1;
            emit({ paths: data.paths || [], reset: false, epoch });
        });

        source.addEventListener("sync.reset", (event) => {
            const data = JSON.parse((event as MessageEvent).data || "{}");
            epoch = data.epoch ?? epoch + 1;
            emit({ paths: [], reset: true, epoch });
        });

        source.onerror = () => {
            failures += 1;
            // `EventSource` retries on its own; polling only takes over once it
            // has clearly stopped working, so a single blip does not downgrade
            // a session that would have recovered.
            if (failures >= 2) startFallback();
        };
    }

    connect();

    return {
        subscribe(listener: Listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        get connected() {
            return source?.readyState === 1;
        },
        get mode() {
            return fallbackTimer ? "polling" : "stream";
        },
        close() {
            stopFallback();
            source?.close();
            source = null;
            listeners.clear();
        }
    };
}

let shared: ReturnType<typeof createLiveConnection> | null = null;

/** One connection per document, however many views subscribe. */
function sharedConnection() {
    if (!shared) shared = createLiveConnection();
    return shared;
}

/**
 * Calls `onChange` whenever the workspace changes on disk.
 *
 * The callback is held in a ref so a view can pass an inline function without
 * tearing the subscription down and rebuilding it on every render.
 */
export function useWorkspaceChanges(
    onChange: (change: WorkspaceChange) => void
) {
    const handler = useRef(onChange);
    handler.current = onChange;
    const [mode, setMode] = useState<"stream" | "polling">("stream");

    useEffect(() => {
        const connection = sharedConnection();
        const unsubscribe = connection.subscribe((change) => {
            setMode(connection.mode as "stream" | "polling");
            handler.current(change);
        });
        return () => {
            unsubscribe();
        };
    }, []);

    return mode;
}

/** Whether a change touches a given record kind, by its directory. */
export function changeTouches(change: WorkspaceChange, ...fragments: string[]) {
    if (change.reset) return true;
    return change.paths.some((path) =>
        fragments.some((fragment) => path.includes(fragment))
    );
}
