import {
    StrictMode,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import {
    BookIcon,
    CalendarIcon,
    ChecklistIcon,
    ColumnsIcon,
    MoonIcon,
    PlusIcon,
    ProjectIcon,
    SearchIcon,
    ShieldIcon,
    SunIcon,
    TableIcon
} from "@primer/octicons-react";
import { createRoot } from "react-dom/client";

import { api } from "./api";
import { EpicsView, FlowBoard, TimelineView } from "./components/Boards";
import { Drawer } from "./components/Drawer";
import { Explorer } from "./components/Explorer";
import { HealthView } from "./components/Health";
import { KnowledgeView } from "./components/Knowledge";
import { NewCardModal } from "./components/NewCard";
import { TriageView } from "./components/Triage";
import { filterTasks, readUrlState, writeUrlState } from "./query";
import {
    AREAS,
    PRIORITIES,
    STATUSES,
    TYPES,
    type Filters,
    type Task,
    type TaskPatch,
    type View
} from "./types";

import "./styles.css";

const INITIAL = readUrlState();

const VIEW_OPTIONS: Array<{
    value: View;
    label: string;
    icon: typeof TableIcon;
}> = [
    { value: "explorer", label: "Explorer", icon: TableIcon },
    { value: "triage", label: "Triage", icon: ChecklistIcon },
    { value: "flow", label: "Flow", icon: ColumnsIcon },
    { value: "epics", label: "Epics", icon: ProjectIcon },
    { value: "timeline", label: "Timeline", icon: CalendarIcon },
    { value: "knowledge", label: "Knowledge", icon: BookIcon },
    { value: "health", label: "Health", icon: ShieldIcon }
];

function FilterSelect({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}) {
    return (
        <label className="filter-control">
            <span className="sr-only">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="">{label}: all</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}

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

function App() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [repoRoot, setRepoRoot] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [view, setView] = useState<View>(INITIAL.view);
    const [filters, setFilters] = useState<Filters>(INITIAL.filters);
    const [selectedId, setSelectedId] = useState<string | null>(
        INITIAL.selectedId
    );
    const [showNewCard, setShowNewCard] = useState(false);
    const [dark, setDark] = useState(() => {
        const saved = localStorage.getItem("backlog-theme");
        return saved
            ? saved === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
    });
    const deferredSearch = useDeferredValue(filters.search);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await api.tasks();
            setTasks(response.tasks);
            setRepoRoot(response.repoRoot);
            setError("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    // Set while the drawer holds an unsaved form: a background reload would
    // replace the card object and wipe what the user is typing.
    const editingRef = useRef(false);

    useEffect(() => {
        void load();
        const refresh = () => {
            if (!editingRef.current) void load(true);
        };
        const interval = window.setInterval(refresh, 30_000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
        };
    }, [load]);

    useEffect(() => {
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        localStorage.setItem("backlog-theme", dark ? "dark" : "light");
    }, [dark]);

    useEffect(() => {
        writeUrlState(view, filters, selectedId);
    }, [filters, selectedId, view]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
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
    const effectiveFilters = useMemo(
        () => ({ ...filters, search: deferredSearch }),
        [deferredSearch, filters]
    );
    const visibleTasks = useMemo(
        () => filterTasks(tasks, effectiveFilters),
        [effectiveFilters, tasks]
    );
    const scopeConflicts = useMemo(() => {
        const doing = tasks.filter(
            (task) => task.status === "doing" && task.scope?.length
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

    const patch = useCallback(
        async (id: string, requested: TaskPatch) => {
            const previous = tasks;
            const target = tasks.find((task) => task.id === id);
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
                await api.patch(id, changes);
                setError("");
            } catch (reason) {
                setTasks(previous);
                const message =
                    reason instanceof Error ? reason.message : String(reason);
                setError(message);
                throw reason;
            }
        },
        [tasks]
    );

    const bulkPatch = useCallback(
        async (ids: string[], requested: TaskPatch) => {
            const idSet = new Set(ids);
            const previous = tasks;
            const changes = withClaimRelease(
                requested,
                tasks.filter((task) => idSet.has(task.id))
            );
            setTasks((current) =>
                current.map((task) =>
                    idSet.has(task.id) ? applyPatch(task, changes) : task
                )
            );
            try {
                await api.bulkPatch(ids, changes);
                setError("");
            } catch (reason) {
                setTasks(previous);
                const message =
                    reason instanceof Error ? reason.message : String(reason);
                setError(message);
                throw reason;
            }
        },
        [tasks]
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

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="topbar-primary">
                    <div className="brand">
                        <strong>Fube Backlog</strong>
                        <span>
                            {tasks
                                .filter(
                                    (task) =>
                                        !task.archived &&
                                        !["done", "discarded"].includes(
                                            task.status
                                        )
                                )
                                .length.toLocaleString()}{" "}
                            open · {tasks.length.toLocaleString()} total
                        </span>
                    </div>
                    <nav className="view-tabs" aria-label="Backlog views">
                        {VIEW_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    type="button"
                                    key={option.value}
                                    className={
                                        view === option.value ? "is-active" : ""
                                    }
                                    aria-current={
                                        view === option.value
                                            ? "page"
                                            : undefined
                                    }
                                    onClick={() => setView(option.value)}
                                >
                                    <Icon size={16} aria-hidden="true" />
                                    <span>{option.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Toggle theme"
                        onClick={() => setDark((current) => !current)}
                    >
                        {dark ? (
                            <SunIcon size={16} aria-hidden="true" />
                        ) : (
                            <MoonIcon size={16} aria-hidden="true" />
                        )}
                    </button>
                    <button
                        type="button"
                        className="button button-primary"
                        onClick={() => setShowNewCard(true)}
                    >
                        <PlusIcon size={16} aria-hidden="true" /> New card
                    </button>
                </div>
                {view !== "knowledge" && (
                    <div className="topbar-filters">
                        <label className="search-control">
                            <SearchIcon size={16} aria-hidden="true" />
                            <span className="sr-only">Search cards</span>
                            <input
                                type="search"
                                name="backlog-search"
                                autoComplete="off"
                                placeholder="Search or use area:billing, -type:idea…"
                                value={filters.search}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        search: event.target.value
                                    }))
                                }
                            />
                        </label>
                        <FilterSelect
                            label="Status"
                            value={filters.status}
                            options={STATUSES}
                            onChange={(status) =>
                                setFilters((current) => ({
                                    ...current,
                                    status: status as Filters["status"]
                                }))
                            }
                        />
                        <FilterSelect
                            label="Area"
                            value={filters.area}
                            options={AREAS}
                            onChange={(area) =>
                                setFilters((current) => ({
                                    ...current,
                                    area: area as Filters["area"]
                                }))
                            }
                        />
                        <FilterSelect
                            label="Type"
                            value={filters.type}
                            options={TYPES}
                            onChange={(type) =>
                                setFilters((current) => ({
                                    ...current,
                                    type: type as Filters["type"]
                                }))
                            }
                        />
                        <FilterSelect
                            label="Priority"
                            value={filters.priority}
                            options={PRIORITIES}
                            onChange={(priority) =>
                                setFilters((current) => ({
                                    ...current,
                                    priority: priority as Filters["priority"]
                                }))
                            }
                        />
                        {milestones.length > 0 && (
                            <FilterSelect
                                label="Milestone"
                                value={filters.milestone}
                                options={milestones}
                                onChange={(milestone) =>
                                    setFilters((current) => ({
                                        ...current,
                                        milestone
                                    }))
                                }
                            />
                        )}
                        <label className="check-control">
                            <input
                                type="checkbox"
                                checked={filters.showIdeas}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        showIdeas: event.target.checked
                                    }))
                                }
                            />
                            Ideas
                        </label>
                        <label className="check-control">
                            <input
                                type="checkbox"
                                checked={filters.showClosed}
                                onChange={(event) =>
                                    setFilters((current) => ({
                                        ...current,
                                        showClosed: event.target.checked
                                    }))
                                }
                            />
                            Closed
                        </label>
                        <button
                            className="button button-quiet"
                            type="button"
                            onClick={resetFilters}
                        >
                            Reset
                        </button>
                    </div>
                )}
            </header>

            {error && (
                <div className="notice notice-error" aria-live="polite">
                    {error}
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Dismiss error"
                        onClick={() => setError("")}
                    >
                        ×
                    </button>
                </div>
            )}
            {scopeConflicts.length > 0 && (
                <div className="notice notice-warning" aria-live="polite">
                    Scope overlap between in-progress cards:{" "}
                    {scopeConflicts.join(" · ")}
                </div>
            )}

            <div className="workspace">
                {loading ? (
                    <div className="loading">Loading backlog…</div>
                ) : view === "explorer" ? (
                    <Explorer
                        tasks={visibleTasks}
                        allTasks={tasks}
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
                        onMove={(id, status) => patch(id, { status })}
                    />
                ) : view === "triage" ? (
                    <TriageView
                        tasks={visibleTasks}
                        repoRoot={repoRoot}
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
                ) : view === "knowledge" ? (
                    <KnowledgeView repoRoot={repoRoot} />
                ) : (
                    <HealthView onOpen={setSelectedId} />
                )}
            </div>

            {selected && (
                <Drawer
                    task={selected}
                    repoRoot={repoRoot}
                    tasks={tasks}
                    orderedIds={visibleTasks.map((task) => task.id)}
                    onOpen={setSelectedId}
                    onClose={() => setSelectedId(null)}
                    onPatch={patch}
                    onEditingChange={(editing) => {
                        editingRef.current = editing;
                    }}
                    onArchive={async (id, archived) => {
                        try {
                            await api.archive(id, archived);
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
                />
            )}

            {showNewCard && (
                <NewCardModal
                    tasks={tasks}
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
