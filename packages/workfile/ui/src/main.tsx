import {
    StrictMode,
    lazy,
    Suspense,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent
} from "react";
import {
    Book,
    Calendar,
    Columns3,
    FileDiff,
    Lightbulb,
    ListChecks,
    Moon,
    PanelRight,
    Plus,
    Search,
    Shield,
    SquareKanban,
    Sun,
    Table,
    X
} from "lucide-react";
import { createRoot } from "react-dom/client";

import { api } from "./api";
import { Explorer } from "./components/domain/Explorer";
import { Inspector } from "./components/Inspector";
import { NewCardModal } from "./components/NewCard";
import { CommandPalette } from "./components/CommandPalette";
import { ChipSelect, ChipToggle } from "./kit";
import { recordCollection, severityColor, since, statusColor } from "./theme";
import { filterTasks, readUrlState, writeUrlState } from "./query";
import { changeTouches, useWorkspaceChanges } from "./store/live";
import {
    PRIORITIES,
    STATUSES,
    TYPES,
    type ActivitySnapshot,
    type Filters,
    type HealthReport,
    type RuntimeSchema,
    type Task,
    type TaskPatch,
    type View
} from "./types";

import "./styles.css";

/**
 * Views load on demand; the Explorer stays eager because it is the landing
 * view. Prefetch on hover and focus keeps the lazy chunks from ever being
 * felt: by the time a click lands the module is usually already there.
 */
const loaders = {
    boards: () => import("./components/domain/Boards"),
    docs: () => import("./components/Docs"),
    health: () => import("./components/Health"),
    history: () => import("./components/History"),
    memory: () => import("./components/Memory"),
    triage: () => import("./components/Triage")
};

const FlowBoard = lazy(() =>
    loaders.boards().then((module) => ({ default: module.FlowBoard }))
);
const EpicsView = lazy(() =>
    loaders.boards().then((module) => ({ default: module.EpicsView }))
);
const TimelineView = lazy(() =>
    loaders.boards().then((module) => ({ default: module.TimelineView }))
);
const TriageView = lazy(() =>
    loaders.triage().then((module) => ({ default: module.TriageView }))
);
const DocsView = lazy(() =>
    loaders.docs().then((module) => ({ default: module.DocsView }))
);
const MemoryView = lazy(() =>
    loaders.memory().then((module) => ({ default: module.MemoryView }))
);
const HistoryView = lazy(() =>
    loaders.history().then((module) => ({ default: module.HistoryView }))
);
const HealthView = lazy(() =>
    loaders.health().then((module) => ({ default: module.HealthView }))
);

const VIEW_MODULE: Record<string, keyof typeof loaders | undefined> = {
    flow: "boards",
    epics: "boards",
    timeline: "boards",
    triage: "triage",
    docs: "docs",
    memory: "memory",
    history: "history",
    health: "health"
};

function prefetchView(view: string) {
    const key = VIEW_MODULE[view];
    if (key) void loaders[key]();
}

const INITIAL = readUrlState();

const FALLBACK_SCHEMA: RuntimeSchema = {
    schemaVersion: 2,
    modules: { cards: true, docs: true, changelog: true, memory: true },
    cards: {
        statuses: STATUSES,
        types: TYPES,
        priorities: PRIORITIES,
        efforts: ["S", "M", "L"],
        areas: ["general"]
    },
    // Mirrors src/config/defaults.ts. `test/schema-parity.test.mjs` compares
    // the two and fails when they drift.
    docs: {
        kinds: [
            "architecture",
            "product",
            "runbook",
            "guide",
            "reference",
            "research",
            "spec",
            "handoff"
        ],
        statuses: ["draft", "current", "stale", "superseded", "archived"],
        defaults: { kind: "reference", status: "draft" }
    },
    changelog: {
        releaseStrategy: "semver",
        types: [
            "added",
            "changed",
            "fixed",
            "deprecated",
            "removed",
            "security",
            "internal"
        ],
        visibilities: ["public", "internal"],
        defaults: { type: "changed", visibility: "public" }
    },
    // One entry per line: `test/schema-parity.test.mjs` parses these objects
    // out of the source text and compares them with the core definitions.
    memory: {
        collections: [
            { id: "learnings", singular: "learning", idPrefix: "LRN", statuses: ["active", "graduated", "superseded", "discarded"] },
            { id: "decisions", singular: "decision", idPrefix: "ADR", statuses: ["proposed", "accepted", "rejected", "superseded"] },
            { id: "incidents", singular: "incident", idPrefix: "INC", statuses: ["open", "mitigated", "resolved", "closed"] },
            { id: "conventions", singular: "convention", idPrefix: "CONV", statuses: ["draft", "active", "deprecated", "superseded"] },
            { id: "context", singular: "context", idPrefix: "CTX", statuses: ["active", "expired", "resolved"] }
        ]
    }
};

interface NavItem {
    value: View;
    label: string;
    icon: typeof Table;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
    {
        label: "Work",
        items: [
            { value: "explorer", label: "Explorer", icon: Table },
            { value: "triage", label: "Triage", icon: ListChecks },
            { value: "flow", label: "Flow", icon: Columns3 },
            { value: "epics", label: "Epics", icon: SquareKanban },
            { value: "timeline", label: "Timeline", icon: Calendar }
        ]
    },
    {
        label: "Knowledge",
        items: [
            { value: "docs", label: "Docs", icon: Book },
            { value: "memory", label: "Memory", icon: Lightbulb }
        ]
    },
    {
        label: "Project",
        items: [
            { value: "history", label: "History", icon: FileDiff },
            { value: "health", label: "Health", icon: Shield }
        ]
    }
];

const VIEW_TITLE: Record<View, string> = {
    explorer: "Explorer",
    triage: "Triage",
    flow: "Flow",
    epics: "Epics",
    timeline: "Timeline",
    docs: "Docs",
    memory: "Memory",
    history: "History",
    health: "Health"
};

/** `.project/<collection>` shown in the breadcrumb when nothing is selected. */
const VIEW_COLLECTION: Record<View, string> = {
    explorer: "cards",
    triage: "cards",
    flow: "cards",
    epics: "cards",
    timeline: "cards",
    docs: "docs",
    memory: "memory",
    history: "changelog",
    health: "doctor"
};

/** The backlog protocol clears the claim when a card leaves `doing`, and the
 *  server refuses any other combination — without this the claimed cards get
 *  stuck in `doing` with no way out from the UI. */
function withClaimRelease(changes: TaskPatch, affected: Task[]): TaskPatch {
    if (!changes.status || changes.status === "doing") return changes;
    if ("claimed_by" in changes || "claimed_at" in changes) return changes;
    if (!affected.some((task) => task.claimed_by || task.claimed_at))
        return changes;
    return { ...changes, claimed_by: null, claimed_at: null };
}

function applyPatch(task: Task, changes: TaskPatch): Task {
    const next = { ...task } as Task & Record<string, unknown>;
    for (const [key, value] of Object.entries(changes)) {
        if (value == null) delete next[key];
        else next[key] = value;
    }
    return next;
}

/** Rows of skeleton the shape of the table about to replace them. */
function ViewLoading({ label }: { label: string }) {
    return (
        <div
            aria-busy="true"
            aria-label={label}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 14
            }}
        >
            {Array.from({ length: 8 }, (_, index) => (
                <span
                    key={index}
                    style={{
                        height: "var(--row-h)",
                        borderRadius: 7,
                        background: "var(--line-2)"
                    }}
                />
            ))}
        </div>
    );
}

function App() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [repoRoot, setRepoRoot] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [projectName, setProjectName] = useState("Workfile");
    const [schema, setSchema] = useState<RuntimeSchema>(FALLBACK_SCHEMA);
    const [areas, setAreas] = useState<string[]>(["general"]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [view, setView] = useState<View>(INITIAL.view);
    const [filters, setFilters] = useState<Filters>(INITIAL.filters);
    const [selectedId, setSelectedId] = useState<string | null>(
        INITIAL.selectedId
    );
    const [showNewCard, setShowNewCard] = useState(false);
    const [showPalette, setShowPalette] = useState(false);
    const [health, setHealth] = useState<HealthReport | null>(null);
    const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
    const [moduleCounts, setModuleCounts] = useState<{
        docs: number | null;
        memory: number | null;
        unreleased: number | null;
    }>({ docs: null, memory: null, unreleased: null });
    const [dark, setDark] = useState(() => {
        const saved = localStorage.getItem("workfile-theme");
        return saved
            ? saved === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
    });
    const [inspectorOpen, setInspectorOpen] = useState(
        () => localStorage.getItem("workfile-inspector") !== "collapsed"
    );
    const [inspectorWidth, setInspectorWidth] = useState(() => {
        const saved = Number(
            localStorage.getItem("workfile-inspector-width")
        );
        return saved >= 320 && saved <= 760 ? saved : 440;
    });
    const deferredSearch = useDeferredValue(filters.search);

    // `patch` and `bulkPatch` must not depend on `tasks` or they change
    // identity on every poll and cancel the row-level memoisation downstream.
    const tasksRef = useRef<Task[]>([]);
    tasksRef.current = tasks;

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await api.tasks();
            setTasks(response.tasks);
            setRepoRoot(response.repoRoot);
            setRepoUrl(response.repoUrl || "");
            setProjectName(response.projectName || "Workfile");
            setSchema(response.schema);
            setAreas(
                response.schema.cards.areas.length
                    ? response.schema.cards.areas
                    : ["general"]
            );
            setError("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    const loadActivity = useCallback(async () => {
        try {
            setActivity(await api.activity());
        } catch {
            // Ambient: failing to load presence must not disturb the app.
        }
    }, []);

    // The doctor runs over the whole workspace, so any write can change its
    // verdict — but one verdict per write burst is enough.
    const healthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadHealth = useCallback(() => {
        if (healthTimer.current) return;
        healthTimer.current = setTimeout(async () => {
            healthTimer.current = null;
            try {
                setHealth(await api.health());
            } catch {
                // The chip simply stays at its last reading.
            }
        }, 800);
    }, []);

    const loadCounts = useCallback(
        async (which: { docs?: boolean; memory?: boolean; history?: boolean }) => {
            const [docs, memory, unreleased] = await Promise.allSettled([
                which.docs ? api.docs() : Promise.reject(new Error("skip")),
                which.memory ? api.memory() : Promise.reject(new Error("skip")),
                which.history
                    ? api.changelog("", { state: "unreleased" })
                    : Promise.reject(new Error("skip"))
            ]);
            setModuleCounts((current) => ({
                docs: docs.status === "fulfilled" ? docs.value.total : current.docs,
                memory:
                    memory.status === "fulfilled"
                        ? memory.value.total
                        : current.memory,
                unreleased:
                    unreleased.status === "fulfilled"
                        ? unreleased.value.total
                        : current.unreleased
            }));
        },
        []
    );

    // Set while a form in the inspector holds unsaved input: a background
    // reload would replace the record object and wipe what the user typed.
    const editingRef = useRef(false);

    useEffect(() => {
        void load();
        void loadActivity();
        loadHealth();
        void loadCounts({ docs: true, memory: true, history: true });
        const refresh = () => {
            if (!editingRef.current) void load(true);
        };
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [load, loadActivity, loadCounts, loadHealth]);

    // Reload what a change actually touches — cards for the table, activity
    // for the ledger, module counts for the nav, the doctor for its chip.
    const liveMode = useWorkspaceChanges((change) => {
        if (changeTouches(change, "/cards/")) {
            if (!editingRef.current) void load(true);
            void loadActivity();
        }
        void loadCounts({
            docs: changeTouches(change, "/docs/"),
            memory: changeTouches(change, "/memory/"),
            history: changeTouches(change, "/changelog/")
        });
        loadHealth();
    });

    useEffect(() => {
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        localStorage.setItem("workfile-theme", dark ? "dark" : "light");
    }, [dark]);

    useEffect(() => {
        localStorage.setItem(
            "workfile-inspector",
            inspectorOpen ? "open" : "collapsed"
        );
    }, [inspectorOpen]);

    useEffect(() => {
        localStorage.setItem(
            "workfile-inspector-width",
            String(inspectorWidth)
        );
    }, [inspectorWidth]);

    // Opening a record is a request to see it: it reopens a collapsed rail.
    useEffect(() => {
        if (selectedId) setInspectorOpen(true);
    }, [selectedId]);

    /** Drag the inspector's left edge; double-click resets to the default. */
    const startInspectorResize = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            const handle = event.currentTarget;
            handle.setAttribute("data-dragging", "");
            const onMove = (move: PointerEvent) => {
                const width = Math.min(
                    760,
                    Math.max(320, window.innerWidth - move.clientX)
                );
                setInspectorWidth(width);
            };
            const onUp = () => {
                handle.removeAttribute("data-dragging");
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        },
        []
    );

    useEffect(() => {
        document.title = projectName;
    }, [projectName]);

    // Changing view or opening a record is navigation and earns a history
    // entry; typing in a filter only rewrites the current one.
    const lastNavigation = useRef(`${view}|${selectedId ?? ""}`);
    useEffect(() => {
        const signature = `${view}|${selectedId ?? ""}`;
        const push = signature !== lastNavigation.current;
        lastNavigation.current = signature;
        writeUrlState(view, filters, selectedId, { push });
    }, [filters, selectedId, view]);

    useEffect(() => {
        const onPopState = () => {
            const next = readUrlState();
            lastNavigation.current = `${next.view}|${next.selectedId ?? ""}`;
            setView(next.view);
            setFilters(next.filters);
            setSelectedId(next.selectedId);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                setShowPalette((value) => !value);
                return;
            }
            if (event.key !== "Escape") return;
            if (showNewCard) setShowNewCard(false);
            else if (selectedId) setSelectedId(null);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [selectedId, showNewCard]);

    const taskById = useMemo(
        () => new Map(tasks.map((task) => [task.id, task])),
        [tasks]
    );
    const epicIds = useMemo(() => {
        const result = new Map<string, string>();
        for (const task of tasks) {
            let current: Task | undefined = task;
            const seen = new Set<string>();
            while (current && !seen.has(current.id)) {
                seen.add(current.id);
                if (current.type === "epic") {
                    result.set(task.id, current.id);
                    break;
                }
                current = current.parent
                    ? taskById.get(current.parent)
                    : undefined;
            }
        }
        return result;
    }, [taskById, tasks]);
    // Scalar dependencies: `filters` is a fresh object per keystroke, and the
    // deferred search must be the only thing that re-runs the filter pass.
    const effectiveFilters = useMemo(
        () => ({ ...filters, search: deferredSearch }),
        [
            deferredSearch,
            filters.status,
            filters.area,
            filters.type,
            filters.priority,
            filters.milestone,
            filters.showIdeas,
            filters.showClosed
        ]
    );
    const visibleTasks = useMemo(
        () => filterTasks(tasks, effectiveFilters),
        [effectiveFilters, tasks]
    );
    const scopeConflicts = useMemo(() => {
        const doing = tasks.filter(
            (task) =>
                task.status === "doing" &&
                Array.isArray(task.scope) &&
                task.scope.length
        );
        const pairs: string[] = [];
        const overlaps = (left: string, right: string) => {
            const a = left.replace(/\/+$/, "");
            const b = right.replace(/\/+$/, "");
            return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
        };
        for (let left = 0; left < doing.length; left += 1) {
            for (let right = left + 1; right < doing.length; right += 1) {
                if (
                    doing[left].scope!.some((a) =>
                        doing[right].scope!.some((b) => overlaps(a, b))
                    )
                )
                    pairs.push(`${doing[left].id} ↔ ${doing[right].id}`);
            }
        }
        return pairs;
    }, [tasks]);
    const selected = selectedId ? taskById.get(selectedId) : undefined;
    const milestones = useMemo(
        () =>
            [
                ...new Set(tasks.map((task) => task.milestone).filter(Boolean))
            ].sort() as string[],
        [tasks]
    );
    const isWorkView = !["docs", "history", "memory", "health"].includes(view);
    const openRecord = useCallback(
        (id: string) => {
            setSelectedId(id);
            if (taskById.has(id) || id.startsWith("T-")) setView("explorer");
            else if (id.startsWith("DOC-") || id.startsWith("PATH-"))
                setView("docs");
            else if (id.startsWith("CHG-") || id.startsWith("REL-"))
                setView("history");
            else setView("memory");
        },
        [taskById]
    );

    const patch = useCallback(async (id: string, requested: TaskPatch) => {
        const previous = tasksRef.current;
        const target = previous.find((task) => task.id === id);
        const changes = withClaimRelease(requested, target ? [target] : []);
        setTasks((current) =>
            current.map((task) =>
                task.id === id
                    ? {
                          ...applyPatch(task, changes),
                          updated: new Date().toISOString().slice(0, 10)
                      }
                    : task
            )
        );
        try {
            const saved = await api.patch(id, changes, target?.revision);
            setTasks((current) =>
                current.map((task) => (task.id === id ? saved.task : task))
            );
            setError("");
        } catch (reason) {
            setTasks(previous);
            const message =
                reason instanceof Error ? reason.message : String(reason);
            setError(message);
            throw reason;
        }
    }, []);

    const bulkPatch = useCallback(
        async (ids: string[], requested: TaskPatch) => {
            const idSet = new Set(ids);
            const previous = tasksRef.current;
            const changes = withClaimRelease(
                requested,
                previous.filter((task) => idSet.has(task.id))
            );
            setTasks((current) =>
                current.map((task) =>
                    idSet.has(task.id) ? applyPatch(task, changes) : task
                )
            );
            try {
                const outcome = await api.bulkPatch(
                    ids,
                    changes,
                    Object.fromEntries(
                        previous
                            .filter(
                                (task) => idSet.has(task.id) && task.revision
                            )
                            .map((task) => [task.id, task.revision!])
                    )
                );
                await load(true);
                // A bulk edit is partial by nature: report which cards did not
                // go through, or the multi-select becomes a lie.
                const failures = (outcome?.results || []).filter(
                    (entry) => !entry.ok
                );
                setError(
                    failures.length
                        ? `${failures.length} of ${ids.length} could not be updated: ${failures
                              .slice(0, 3)
                              .map(
                                  (entry) =>
                                      `${entry.id} (${entry.error?.code})`
                              )
                              .join(
                                  ", "
                              )}${failures.length > 3 ? "…" : ""}`
                        : ""
                );
            } catch (reason) {
                setTasks(previous);
                const message =
                    reason instanceof Error ? reason.message : String(reason);
                setError(message);
                throw reason;
            }
        },
        [load]
    );

    const resetFilters = () =>
        setFilters({
            search: "",
            status: "",
            area: "",
            type: "",
            priority: "",
            milestone: "",
            showIdeas: false,
            showClosed: false
        });

    const anyFilter =
        filters.search ||
        filters.status ||
        filters.area ||
        filters.type ||
        filters.priority ||
        filters.milestone ||
        filters.showIdeas ||
        filters.showClosed;

    // ------------------------------------------------------------- derived

    const openTasks = useMemo(
        () =>
            tasks.filter(
                (task) =>
                    !task.archived &&
                    !["done", "discarded"].includes(task.status)
            ),
        [tasks]
    );
    const navCounts = useMemo<Record<View, number | null>>(() => {
        const flow = openTasks.filter((task) =>
            ["next", "doing", "review", "blocked"].includes(task.status)
        ).length;
        return {
            explorer: openTasks.length,
            triage: openTasks.filter((task) => task.status === "backlog")
                .length,
            flow,
            epics: openTasks.filter((task) => task.type === "epic").length,
            timeline: openTasks.filter((task) => task.start || task.due)
                .length,
            docs: moduleCounts.docs,
            memory: moduleCounts.memory,
            history: moduleCounts.unreleased,
            health: health
                ? health.counts.error + health.counts.warning + health.counts.info
                : null
        };
    }, [health, moduleCounts, openTasks]);

    const viewMeta = useMemo(() => {
        switch (view) {
            case "explorer":
                return `${visibleTasks.length.toLocaleString()} of ${tasks.length.toLocaleString()} cards`;
            case "triage":
                return "keyboard-first · every action writes the card to disk";
            case "flow":
                return `${navCounts.flow ?? 0} cards across execution states${
                    scopeConflicts.length
                        ? ` · ${scopeConflicts.length} scope conflict${scopeConflicts.length === 1 ? "" : "s"}`
                        : ""
                }`;
            case "epics":
                return `${navCounts.epics ?? 0} epics`;
            case "timeline":
                return `${navCounts.timeline ?? 0} cards with dates`;
            case "docs":
                return moduleCounts.docs == null
                    ? ""
                    : `${moduleCounts.docs.toLocaleString()} documents`;
            case "memory":
                return moduleCounts.memory == null
                    ? ""
                    : `${moduleCounts.memory.toLocaleString()} records · ${schema.memory.collections.length} collections`;
            case "history":
                return moduleCounts.unreleased == null
                    ? ""
                    : `${moduleCounts.unreleased.toLocaleString()} unpublished fragments`;
            case "health":
                return health
                    ? `${health.counts.error} errors · ${health.counts.warning} warnings · ${health.counts.info} infos`
                    : "";
        }
    }, [
        health,
        moduleCounts,
        navCounts,
        schema.memory.collections.length,
        scopeConflicts.length,
        tasks.length,
        view,
        visibleTasks.length
    ]);

    const liveAgents =
        activity?.sessions.filter((session) => session.live).length ?? 0;
    const ledgerClaims = (activity?.claims ?? []).filter((entry) =>
        ["live", "held", "stale", "orphaned"].includes(entry.claim.state)
    );
    const indexedTotal =
        tasks.length + (moduleCounts.docs ?? 0) + (moduleCounts.memory ?? 0);

    const worstSeverity = health
        ? health.counts.error
            ? "error"
            : health.counts.warning
              ? "warning"
              : "info"
        : null;

    const crumbCollection = selectedId
        ? recordCollection(selectedId)
        : VIEW_COLLECTION[view];
    // Without a selection the view name is the tail — unless it would repeat
    // the collection (".project / docs / docs" says less than it costs).
    const crumbRecord =
        selectedId ??
        (VIEW_TITLE[view].toLowerCase() === crumbCollection
            ? null
            : VIEW_TITLE[view].toLowerCase());

    return (
        <div
            className="app"
            data-inspector={
                !inspectorOpen ? "collapsed" : selected ? "open" : undefined
            }
            style={
                { "--inspector-w": `${inspectorWidth}px` } as CSSProperties
            }
        >
            <header className="topbar">
                <div className="topbar-brand">
                    <span className="brand-mark" aria-hidden="true" />
                    <span className="brand-name">{projectName}</span>
                    {import.meta.env.VITE_APP_VERSION ? (
                        <span className="chip-version">
                            {import.meta.env.VITE_APP_VERSION}
                        </span>
                    ) : null}
                    {import.meta.env.VITE_DEMO === "1" ? (
                        <span className="chip-version">demo</span>
                    ) : null}
                </div>
                <nav className="crumb" aria-label="Breadcrumb">
                    <span>.project</span>
                    <span className="crumb-sep">/</span>
                    {crumbRecord ? (
                        <>
                            <span>{crumbCollection}</span>
                            <span className="crumb-sep">/</span>
                            <span className="crumb-current truncate">
                                {crumbRecord}
                            </span>
                        </>
                    ) : (
                        <span className="crumb-current truncate">
                            {crumbCollection}
                        </span>
                    )}
                </nav>
                <span className="spacer" />
                <button
                    type="button"
                    className="searchbtn"
                    onClick={() => setShowPalette(true)}
                >
                    <Search aria-hidden="true" />
                    <span className="searchbtn-label">
                        Search{" "}
                        {indexedTotal
                            ? `${indexedTotal.toLocaleString()} records…`
                            : "records…"}
                    </span>
                    <span className="kbd">⌘K</span>
                </button>
                {health ? (
                    <button
                        type="button"
                        className="statuschip"
                        title="workfile doctor"
                        onClick={() => setView("health")}
                    >
                        <span
                            className="dot dot-round"
                            style={{
                                color: worstSeverity
                                    ? severityColor(worstSeverity)
                                    : statusColor("done")
                            }}
                            aria-hidden="true"
                        />
                        doctor {health.counts.error}E · {health.counts.warning}W
                        · {health.counts.info}I
                    </button>
                ) : null}
                {import.meta.env.VITE_DEMO !== "1" ? (
                    <span className="statuschip" title="Change stream">
                        <span
                            className="dot dot-round"
                            style={{
                                color:
                                    liveMode === "stream"
                                        ? statusColor("done")
                                        : "var(--sev-warning)"
                            }}
                            aria-hidden="true"
                        />
                        {liveMode === "stream" ? "sse live" : "polling"}
                        {liveAgents
                            ? ` · ${liveAgents} agent${liveAgents === 1 ? "" : "s"}`
                            : ""}
                    </span>
                ) : null}
                <button
                    type="button"
                    className="iconbtn"
                    title="Toggle inspector"
                    aria-label="Toggle inspector"
                    aria-pressed={inspectorOpen}
                    style={
                        inspectorOpen
                            ? { color: "var(--accent)" }
                            : undefined
                    }
                    onClick={() => setInspectorOpen((current) => !current)}
                >
                    <PanelRight aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="iconbtn"
                    title="Toggle theme"
                    aria-label="Toggle theme"
                    onClick={() => setDark((current) => !current)}
                >
                    {dark ? (
                        <Sun aria-hidden="true" />
                    ) : (
                        <Moon aria-hidden="true" />
                    )}
                </button>
                <button
                    type="button"
                    className="btn-accent"
                    onClick={() => setShowNewCard(true)}
                >
                    <Plus aria-hidden="true" />
                    New card
                </button>
            </header>

            <div className="app-body">
                <nav className="nav" aria-label="Primary">
                    {NAV_GROUPS.map((group) => (
                        <div
                            key={group.label}
                            className="nav-group"
                            role="group"
                            aria-label={group.label}
                        >
                            <span className="overline" aria-hidden="true">
                                {group.label}
                            </span>
                            {group.items.map((option) => {
                                const Icon = option.icon;
                                const active = view === option.value;
                                const count = navCounts[option.value];
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={
                                            active
                                                ? "nav-item is-active"
                                                : "nav-item"
                                        }
                                        aria-current={
                                            active ? "page" : undefined
                                        }
                                        onMouseEnter={() =>
                                            prefetchView(option.value)
                                        }
                                        onFocus={() =>
                                            prefetchView(option.value)
                                        }
                                        onClick={() => setView(option.value)}
                                    >
                                        <span
                                            className="nav-item-bar"
                                            aria-hidden="true"
                                        />
                                        <Icon aria-hidden="true" />
                                        <span className="nav-label">
                                            {option.label}
                                        </span>
                                        {count != null ? (
                                            <span className="nav-count">
                                                {count.toLocaleString()}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    <span className="nav-spacer" />
                    <div className="nav-foot">
                        <span className="nav-foot-path" title={repoRoot}>
                            {repoRoot ? `${repoRoot}/.project` : ".project"}
                        </span>
                        <span className="nav-foot-line">
                            Markdown is the source. No database.
                        </span>
                    </div>
                </nav>

                <section className="main">
                    <div className="view-head">
                        <span className="view-title">{VIEW_TITLE[view]}</span>
                        {viewMeta ? (
                            <span className="view-meta">{viewMeta}</span>
                        ) : null}
                        <span className="spacer" />
                        {isWorkView ? (
                            <>
                                <ChipSelect
                                    label="status"
                                    value={filters.status}
                                    options={STATUSES.map((status) => ({
                                        value: status,
                                        color: statusColor(status)
                                    }))}
                                    onChange={(status) =>
                                        setFilters((current) => ({
                                            ...current,
                                            status: status as Filters["status"]
                                        }))
                                    }
                                />
                                <ChipSelect
                                    label="area"
                                    value={filters.area}
                                    options={areas.map((area) => ({
                                        value: area
                                    }))}
                                    onChange={(area) =>
                                        setFilters((current) => ({
                                            ...current,
                                            area
                                        }))
                                    }
                                />
                                <ChipSelect
                                    label="type"
                                    value={filters.type}
                                    options={TYPES.map((type) => ({
                                        value: type
                                    }))}
                                    onChange={(type) =>
                                        setFilters((current) => ({
                                            ...current,
                                            type: type as Filters["type"]
                                        }))
                                    }
                                />
                                <ChipSelect
                                    label="priority"
                                    value={filters.priority}
                                    options={PRIORITIES.map((priority) => ({
                                        value: priority
                                    }))}
                                    onChange={(priority) =>
                                        setFilters((current) => ({
                                            ...current,
                                            priority:
                                                priority as Filters["priority"]
                                        }))
                                    }
                                />
                                {milestones.length > 0 ? (
                                    <ChipSelect
                                        label="milestone"
                                        value={filters.milestone}
                                        options={milestones.map(
                                            (milestone) => ({
                                                value: milestone
                                            })
                                        )}
                                        onChange={(milestone) =>
                                            setFilters((current) => ({
                                                ...current,
                                                milestone
                                            }))
                                        }
                                    />
                                ) : null}
                                <ChipToggle
                                    label="ideas"
                                    on={filters.showIdeas}
                                    onChange={(showIdeas) =>
                                        setFilters((current) => ({
                                            ...current,
                                            showIdeas
                                        }))
                                    }
                                />
                                <ChipToggle
                                    label="closed"
                                    on={filters.showClosed}
                                    onChange={(showClosed) =>
                                        setFilters((current) => ({
                                            ...current,
                                            showClosed
                                        }))
                                    }
                                />
                                {anyFilter ? (
                                    <button
                                        type="button"
                                        className="chip"
                                        onClick={resetFilters}
                                    >
                                        reset
                                    </button>
                                ) : null}
                            </>
                        ) : null}
                    </div>

                    {error ? (
                        <div
                            className="callout callout-error"
                            aria-live="polite"
                        >
                            <span style={{ flex: 1 }}>{error}</span>
                            <button
                                type="button"
                                className="iconbtn"
                                style={{ width: 22, height: 22 }}
                                aria-label="Dismiss error"
                                onClick={() => setError("")}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    ) : null}
                    {scopeConflicts.length > 0 && isWorkView ? (
                        <div className="callout" aria-live="polite">
                            <span>
                                Scope overlap between in-progress cards:{" "}
                                <span className="mono">
                                    {scopeConflicts.join(" · ")}
                                </span>
                            </span>
                        </div>
                    ) : null}

                    <div className="view-body">
                        <Suspense
                            fallback={<ViewLoading label="Loading view…" />}
                        >
                            {loading ? (
                                <ViewLoading label="Loading backlog…" />
                            ) : view === "explorer" ? (
                                <Explorer
                                    tasks={visibleTasks}
                                    allTasks={tasks}
                                    areas={areas}
                                    filters={filters}
                                    setFilters={setFilters}
                                    epicIds={epicIds}
                                    onOpen={setSelectedId}
                                    onPatch={patch}
                                    onBulkPatch={bulkPatch}
                                />
                            ) : view === "flow" ? (
                                <FlowBoard
                                    tasks={visibleTasks}
                                    epicIds={epicIds}
                                    showClosed={filters.showClosed}
                                    onOpen={setSelectedId}
                                    onMove={(id, status) =>
                                        patch(id, { status })
                                    }
                                />
                            ) : view === "triage" ? (
                                <TriageView
                                    tasks={visibleTasks}
                                    repoRoot={repoRoot}
                                    repoUrl={repoUrl}
                                    onPatch={patch}
                                    onOpen={setSelectedId}
                                />
                            ) : view === "epics" ? (
                                <EpicsView
                                    tasks={visibleTasks}
                                    allTasks={tasks}
                                    epicIds={epicIds}
                                    onOpen={setSelectedId}
                                />
                            ) : view === "timeline" ? (
                                <TimelineView
                                    tasks={visibleTasks}
                                    epicIds={epicIds}
                                    onOpen={setSelectedId}
                                />
                            ) : view === "docs" ? (
                                <DocsView
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    onOpenCard={openRecord}
                                />
                            ) : view === "history" ? (
                                <HistoryView
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    onOpenRecord={openRecord}
                                    schema={schema.changelog}
                                    areas={areas}
                                />
                            ) : view === "memory" ? (
                                <MemoryView
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    onOpenRecord={openRecord}
                                    schema={schema.memory}
                                />
                            ) : (
                                <HealthView onOpen={openRecord} />
                            )}
                        </Suspense>
                    </div>
                </section>

                <button
                    type="button"
                    className="inspector-resizer"
                    aria-label="Resize inspector"
                    title="Drag to resize · double-click to reset"
                    onPointerDown={startInspectorResize}
                    onDoubleClick={() => setInspectorWidth(440)}
                />
                <Inspector
                    task={selected}
                    selectedId={selectedId}
                    repoRoot={repoRoot}
                    repoUrl={repoUrl}
                    tasks={tasks}
                    areas={areas}
                    schema={schema}
                    orderedIds={visibleTasks.map((task) => task.id)}
                    onOpen={setSelectedId}
                    onClose={() => setSelectedId(null)}
                    onPatch={patch}
                    onEditingChange={(editing) => {
                        editingRef.current = editing;
                    }}
                    onArchive={async (id, archived) => {
                        try {
                            await api.archive(
                                id,
                                archived,
                                tasks.find((task) => task.id === id)?.revision
                            );
                            await load(true);
                        } catch (reason) {
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : String(reason)
                            );
                        }
                    }}
                    onUpload={async (id, files) => {
                        try {
                            await Promise.all(
                                [...files].map((file) => api.upload(id, file))
                            );
                            await load(true);
                        } catch (reason) {
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : String(reason)
                            );
                        }
                    }}
                    projectName={projectName}
                />
            </div>

            <footer className="ledger" aria-label="Agent activity">
                {ledgerClaims.slice(0, 3).map((entry) => {
                    const tone =
                        entry.claim.state === "live"
                            ? statusColor("doing")
                            : entry.claim.state === "held"
                              ? statusColor("review")
                              : entry.claim.state === "stale"
                                ? "var(--sev-warning)"
                                : "var(--sev-error)";
                    return (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => openRecord(entry.id)}
                            title={`${entry.claim.by} · ${entry.claim.state}`}
                        >
                            <span
                                className="dot dot-round"
                                style={{ color: tone, background: tone }}
                                aria-hidden="true"
                            />
                            <span style={{ color: tone }}>
                                {entry.claim.by}
                            </span>
                            <span>
                                claim {entry.id}
                                {entry.scope.length
                                    ? ` · scope ${entry.scope[0]}${entry.scope.length > 1 ? "…" : ""}`
                                    : ""}
                                {entry.claim.ageHours != null
                                    ? ` · ${since(entry.claim.ageHours)}`
                                    : ""}
                            </span>
                        </button>
                    );
                })}
                {ledgerClaims.length > 3 ? (
                    <span>+{ledgerClaims.length - 3} more</span>
                ) : null}
                {activity?.conflicts.length ? (
                    <>
                        <span className="ledger-sep">|</span>
                        <span style={{ color: "var(--sev-warning)" }}>
                            {activity.conflicts.length} scope overlap
                            {activity.conflicts.length === 1 ? "" : "s"}
                        </span>
                    </>
                ) : null}
                {!ledgerClaims.length && !activity?.conflicts.length ? (
                    <span>no active claims</span>
                ) : null}
                <span className="spacer" />
                <span>
                    {indexedTotal
                        ? `index ${indexedTotal.toLocaleString()} records`
                        : ""}
                </span>
            </footer>

            <CommandPalette
                open={showPalette}
                onClose={() => setShowPalette(false)}
                onOpenRecord={openRecord}
                onNavigate={(next) => setView(next as View)}
                onCreate={() => setShowNewCard(true)}
                onToggleTheme={() => setDark((value) => !value)}
            />

            {showNewCard && (
                <NewCardModal
                    tasks={tasks}
                    areas={areas}
                    onClose={() => setShowNewCard(false)}
                    onSubmit={async (input) => {
                        try {
                            const created = await api.create(input);
                            setShowNewCard(false);
                            await load(true);
                            setSelectedId(created.id);
                        } catch (reason) {
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : String(reason)
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
