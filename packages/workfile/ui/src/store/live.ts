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
            stopFallback();
            const data = JSON.parse((event as MessageEvent).data);
            // A different process means its event ids restarted, so anything
            // held from before it is untrustworthy.
            if (serverId && serverId !== data.serverId) {
                emit({ paths: [], reset: true, epoch: ++epoch });
            }
            serverId = data.serverId;
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
