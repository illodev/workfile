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
    type CSSProperties
} from "react";
import {
    Book,
    Calendar,
    ChevronDown,
    Columns3,
    Database,
    FileDiff,
    Waypoints,
    Gauge,
    Lightbulb,
    ListChecks,
    Moon,
    Plus,
    Rows3,
    Rows4,
    Search,
    Shield,
    SquareKanban,
    Sun,
    Table,
    X
} from "lucide-react";
import { createRoot } from "react-dom/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { api } from "./api";
import { OverviewView } from "./components/domain/Overview";
import { Inspector } from "./components/Inspector";
import { RecordDrawer } from "./components/RecordDrawer";
import { RecordPanel } from "./components/RecordPanel";
import { NewCardModal } from "./components/NewCard";
import { CommandPalette } from "./components/CommandPalette";
import { severityColor, since, statusColor } from "./theme";
import { drawerCovers, recordCollection, viewForRecord } from "./navigation";
import { filterTasks, readUrlState, writeUrlState } from "./query";
import { changeTouches, useWorkspaceChanges } from "./store/live";
import {
    drawableCount,
    preferredMode,
    type TimelineMode
} from "./timeline";
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
 * Views load on demand; the Overview stays eager because it is the landing
 * view. Prefetch on hover and focus keeps the lazy chunks from ever being
 * felt: by the time a click lands the module is usually already there.
 *
 * The Explorer held this position until the Overview took the front door, and
 * moved into the lazy set with it — leaving both eager would have paid for the
 * old landing view on every first paint.
 */
const loaders = {
    boards: () => import("./components/domain/Boards"),
    docs: () => import("./components/Docs"),
    explorer: () => import("./components/domain/Explorer"),
    health: () => import("./components/Health"),
    history: () => import("./components/History"),
    memory: () => import("./components/Memory"),
    triage: () => import("./components/Triage"),
    workflow: () => import("./components/domain/Workflow")
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
const Explorer = lazy(() =>
    loaders.explorer().then((module) => ({ default: module.Explorer }))
);
// The drawer's per-kind panels, lazily from the same chunks their views use.
// Imported eagerly they would drag the memory lanes and the docs reader into
// the entry bundle to render a panel most sessions never open.
const MemoryPanel = lazy(() =>
    loaders.memory().then((module) => ({ default: module.MemoryPanel }))
);
const DocPanel = lazy(() =>
    loaders.docs().then((module) => ({ default: module.DocPanel }))
);
const WorkflowView = lazy(() =>
    loaders.workflow().then((module) => ({ default: module.WorkflowView }))
);

const VIEW_MODULE: Record<string, keyof typeof loaders | undefined> = {
    explorer: "explorer",
    flow: "boards",
    epics: "boards",
    timeline: "boards",
    triage: "triage",
    docs: "docs",
    memory: "memory",
    history: "history",
    workflow: "workflow",
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

/**
 * The Workfile mark: a bordered frame over three ruled lines, the same drawing
 * the favicon (`ui/index.html`) and the landing lockup (`site/index.html`)
 * carry. The app was the last surface still showing a blank square where it
 * belongs.
 *
 * It strokes `currentColor` rather than the brand hex the other two inline —
 * a colour literal anywhere in `ui/src` fails `design-system.test.ts`, and
 * riding the token means the mark follows the theme instead of fighting it.
 */
function WorkfileMark() {
    return (
        <svg
            viewBox="0 0 96 96"
            fill="none"
            aria-hidden="true"
            className="size-[18px] shrink-0 text-primary"
        >
            <rect
                x="10"
                y="10"
                width="76"
                height="76"
                rx="22"
                stroke="currentColor"
                strokeWidth="8"
            />
            <line
                x1="30"
                y1="36"
                x2="66"
                y2="36"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
            />
            <line
                x1="42"
                y1="48"
                x2="66"
                y2="48"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
            />
            <line
                x1="30"
                y1="60"
                x2="66"
                y2="60"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
            />
        </svg>
    );
}

interface NavItem {
    value: View;
    label: string;
    icon: typeof Table;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
    {
        label: "Work",
        items: [
            { value: "overview", label: "Overview", icon: Gauge },
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
            { value: "workflow", label: "Workflow", icon: Waypoints },
            { value: "history", label: "History", icon: FileDiff },
            { value: "health", label: "Health", icon: Shield }
        ]
    }
];

const VIEW_TITLE: Record<View, string> = {
    overview: "Overview",
    explorer: "Explorer",
    triage: "Triage",
    flow: "Flow",
    epics: "Epics",
    timeline: "Timeline",
    docs: "Docs",
    memory: "Memory",
    history: "History",
    workflow: "Workflow",
    health: "Health"
};

/** `.project/<collection>` shown in the breadcrumb when nothing is selected. */
const VIEW_COLLECTION: Record<View, string> = {
    // Matches its own title, so the breadcrumb reads ".project / overview"
    // rather than repeating the tail.
    overview: "overview",
    explorer: "cards",
    triage: "cards",
    flow: "cards",
    epics: "cards",
    timeline: "cards",
    docs: "docs",
    memory: "memory",
    history: "changelog",
    // Its node set is every record kind, so no single collection names it.
    workflow: "workflow",
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
            className="flex flex-col gap-2 p-3.5"
        >
            {Array.from({ length: 8 }, (_, index) => (
                <Skeleton
                    key={index}
                    className="h-[var(--row-h)] w-full shrink-0"
                />
            ))}
        </div>
    );
}

interface FilterOption {
    value: string;
    label?: string;
    /** Optional swatch colour, e.g. `statusColor("doing")`. */
    color?: string;
}

/**
 * A filter chip that opens a menu: `status: all` in the toolbar. The empty
 * value means "all" and renders the chip in its resting muted state.
 */
function FilterChip({
    label,
    value,
    options,
    allLabel = "all",
    onChange
}: {
    label: string;
    value: string;
    options: FilterOption[];
    allLabel?: string;
    onChange: (value: string) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={label}
                    className={cn(
                        "h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs",
                        value && "border-ring bg-accent"
                    )}
                >
                    {label}
                    <span className="font-normal text-muted-foreground">
                        {value || allLabel}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-3 text-muted-foreground"
                    />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                    <DropdownMenuRadioItem value="">
                        {allLabel}
                    </DropdownMenuRadioItem>
                    {options.map((option) => (
                        <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                        >
                            {option.color ? (
                                <span
                                    className="size-1.5 rounded-full bg-current"
                                    style={{ color: option.color }}
                                    aria-hidden="true"
                                />
                            ) : null}
                            {option.label ?? option.value}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** An on/off chip: `closed: yes` in the toolbar. */
function FilterToggle({
    label,
    on,
    onLabel = "yes",
    offLabel = "no",
    onChange
}: {
    label: string;
    on: boolean;
    onLabel?: string;
    offLabel?: string;
    onChange: (on: boolean) => void;
}) {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={on}
            className={cn(
                "h-7 gap-1 rounded-full px-2.5 text-xs",
                on && "border-ring bg-accent"
            )}
            onClick={() => onChange(!on)}
        >
            {label}
            <span className="font-normal text-muted-foreground">
                {on ? onLabel : offLabel}
            </span>
        </Button>
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
    /**
     * Which dates the Timeline draws, when somebody has said. Null until then,
     * so the view can open on whichever reading this workspace has data for
     * instead of on a default that is empty half the time.
     *
     * Kept beside the collapsed columns and the timeline grouping, in storage
     * rather than the URL: it is a reading somebody set up, not part of what
     * a link points at.
     */
    const [datesChoice, setDatesChoice] = useState<TimelineMode | null>(() => {
        try {
            const stored = localStorage.getItem("workfile-timeline-dates");
            return stored === "plan" || stored === "actual" ? stored : null;
        } catch {
            return null;
        }
    });
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
    /**
     * `--row-h` has carried two densities since the shadcn migration — 40px
     * compact, 48px comfortable under `:root[data-density="comfortable"]` —
     * but nothing ever wrote the attribute, so the comfortable half was
     * unreachable CSS. Compact stays the default it always was.
     */
    const [comfortable, setComfortable] = useState(
        () => localStorage.getItem("workfile-density") === "comfortable"
    );
    const [inspectorOpen, setInspectorOpen] = useState(
        () => localStorage.getItem("workfile-inspector") !== "collapsed"
    );
    const [inspectorExpanded, setInspectorExpanded] = useState(
        () =>
            localStorage.getItem("workfile-inspector-expanded") === "expanded"
    );
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
        const density = comfortable ? "comfortable" : "compact";
        // Only the comfortable selector exists in the stylesheet; compact is
        // the bare `:root`, so the attribute is removed rather than set to a
        // value nothing matches.
        if (comfortable)
            document.documentElement.dataset.density = "comfortable";
        else delete document.documentElement.dataset.density;
        localStorage.setItem("workfile-density", density);
    }, [comfortable]);

    useEffect(() => {
        localStorage.setItem(
            "workfile-inspector",
            inspectorOpen ? "open" : "collapsed"
        );
    }, [inspectorOpen]);

    useEffect(() => {
        localStorage.setItem(
            "workfile-inspector-expanded",
            inspectorExpanded ? "expanded" : "normal"
        );
    }, [inspectorExpanded]);

    // Opening a CARD is a request to see it in the drawer. Other collections
    // open inside their own views — the drawer showing "opens in its view"
    // for a changelog entry was noise, so non-card selections never raise it.
    useEffect(() => {
        if (selectedId && recordCollection(selectedId) === "cards")
            setInspectorOpen(true);
    }, [selectedId]);

    /** Radix defers its pointer-down-outside dispatch until after the click
     *  handlers have run, so a record-opening click would open the drawer
     *  and then be dismissed by its own, late-arriving outside event. Every
     *  record-open stamps this ref; the dismiss handlers ignore anything
     *  arriving in its shadow. */
    const lastSelectRef = useRef(0);
    const selectRecord = useCallback((id: string | null) => {
        lastSelectRef.current = performance.now();
        setSelectedId(id);
        // Any kind. This read `=== "cards"` while the drawer only held cards,
        // and left behind the state where selecting a doc moved the selection
        // and opened nothing.
        if (id) setInspectorOpen(true);
    }, []);

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
            /**
             * Escape belongs to the topmost overlay, and this handler is the
             * floor under all of them.
             *
             * Radix's dismissable layers listen in the capture phase and mark
             * a key they consumed by calling `preventDefault`, so by the time
             * this bubble-phase listener runs the flag is the honest record of
             * whether anything above already answered. Asking the DOM instead
             * does not work: the dismissed layer has already unmounted, and
             * the query comes back empty exactly when a layer did handle it.
             *
             * Without this, one Escape reached two levels at once — the memory
             * record's edit dialog closed *and* the selection behind it was
             * cleared, taking the record the form belonged to off the screen.
             * A second Escape, with nothing left to consume it, still clears
             * the selection.
             */
            if (event.defaultPrevented) return;
            if (showNewCard) setShowNewCard(false);
            // While a form in the inspector holds unsaved input, Escape must
            // not tear the record down (the drawer refuses to close too).
            else if (editingRef.current) return;
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
    /**
     * The five card axes, for the one view that filters records rather than
     * rows.
     *
     * Field by field rather than the whole object: `search`, `showIdeas` and
     * `showClosed` are list hygiene for a board, and a provenance graph that
     * hid closed cards would drop most of what explains the rest. Memoised on
     * the scalars so the canvas does not re-run its layout per keystroke in a
     * search box it does not read.
     */
    const graphFilters = useMemo(
        () => ({
            status: filters.status,
            area: filters.area,
            type: filters.type,
            priority: filters.priority,
            milestone: filters.milestone
        }),
        [
            filters.status,
            filters.area,
            filters.type,
            filters.priority,
            filters.milestone
        ]
    );
    const timelineMode = useMemo(
        () => datesChoice ?? preferredMode(tasks),
        [datesChoice, tasks]
    );
    const chooseDates = useCallback((mode: TimelineMode) => {
        setDatesChoice(mode);
        try {
            localStorage.setItem("workfile-timeline-dates", mode);
        } catch {
            // Blocked or full: the choice still applies for this session.
        }
    }, []);
    /**
     * The rows each Timeline mode gets, which are not the same set.
     *
     * "Show closed" hides finished work because finished work is not what a
     * backlog is for. A chart of what actually happened is the one place that
     * reverses: every card on it is finished by construction, so applying the
     * filter there empties the view by definition rather than by choice. Every
     * other filter — area, type, priority, the search — still applies.
     */
    const timelineRows = useMemo(
        () => ({
            plan: visibleTasks,
            actual: filterTasks(tasks, {
                ...effectiveFilters,
                showClosed: true
            })
        }),
        [effectiveFilters, tasks, visibleTasks]
    );
    const timelineTasks = timelineRows[timelineMode];
    /**
     * Both modes measured over the set each would actually draw.
     *
     * Counting the other mode against the current mode's rows is how the empty
     * state came to offer "3 cards" and then show 128: switching the mode
     * switches the set under it, so a count taken before the switch is a count
     * of the wrong thing.
     */
    const timelineCounts = useMemo(
        () => ({
            plan: drawableCount(timelineRows.plan, "plan"),
            actual: drawableCount(timelineRows.actual, "actual")
        }),
        [timelineRows]
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
    const isWorkView = !["overview", "docs", "history", "memory", "health"].includes(
        view
    );
    /** Which collection the drawer is showing, or null when it is closed. */
    const drawerCollection = selectedId ? recordCollection(selectedId) : null;

    const openRecord = useCallback(
        // `leave` is the reader saying so outright, which is not the same as
        // clicking a link: a link should keep them where they are when it can.
        (id: string, leave = false) => {
            selectRecord(id);
            // A card opens where you already are, if where you are shows
            // cards. Sending every card click to Explorer meant stepping
            // through `depends` inside Flow ejected you from the board on the
            // first hop, and the panel you were reading in is not the panel
            // you end up in.
            const target = viewForRecord(
                id,
                leave ? null : view,
                taskById.has(id)
            );
            if (target) setView(target);
        },
        [taskById, view]
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
            // A dashboard wears no badge: a count beside it would restate what
            // the page itself says, and a badge stuck at 0 says less than none.
            overview: null,
            // Nor does the graph. Its node count is a filter away from
            // anything the sidebar could claim, and the canvas states it.
            workflow: null,
            explorer: openTasks.length,
            triage: openTasks.filter((task) => task.status === "backlog")
                .length,
            flow,
            epics: openTasks.filter((task) => task.type === "epic").length,
            // The one badge measured over the filtered set rather than the
            // whole corpus, because it is the one whose view states its own
            // count two inches away: a sidebar reading 130 beside a chart
            // reading 128 is a defect to anyone who looks at both, and nobody
            // can see that Triage ignores the search box.
            timeline: timelineCounts[timelineMode],
            docs: moduleCounts.docs,
            memory: moduleCounts.memory,
            history: moduleCounts.unreleased,
            health: health
                ? health.counts.error + health.counts.warning + health.counts.info
                : null
        };
    }, [health, moduleCounts, openTasks, timelineCounts, timelineMode]);

    const viewMeta = useMemo(() => {
        switch (view) {
            case "overview":
                return `${(navCounts.explorer ?? 0).toLocaleString()} open of ${tasks.length.toLocaleString()}${
                    health
                        ? ` · ${health.counts.error} errors · ${health.counts.warning} warnings`
                        : ""
                }`;
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
                return timelineMode === "actual"
                    ? `${navCounts.timeline ?? 0} cards with a recorded trail`
                    : `${navCounts.timeline ?? 0} cards with dates`;
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
        timelineMode,
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
        <SidebarProvider
            className="h-svh overflow-hidden"
            style={{ "--sidebar-width": "15rem" } as CSSProperties}
        >
            <Sidebar collapsible="icon" className="border-r">
                <SidebarHeader className="gap-1 px-3 pt-3 group-data-[collapsible=icon]:px-2">
                    <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                        <WorkfileMark />
                        <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
                            {projectName}
                        </span>
                        {import.meta.env.VITE_APP_VERSION ? (
                            <Badge
                                variant="secondary"
                                className="px-1.5 font-mono text-[10px] group-data-[collapsible=icon]:hidden"
                            >
                                {import.meta.env.VITE_APP_VERSION}
                            </Badge>
                        ) : null}
                        {import.meta.env.VITE_DEMO === "1" ? (
                            <Badge
                                variant="secondary"
                                className="px-1.5 font-mono text-[10px] group-data-[collapsible=icon]:hidden"
                            >
                                demo
                            </Badge>
                        ) : null}
                    </div>
                </SidebarHeader>
                <nav
                    aria-label="Primary"
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <SidebarContent>
                        {NAV_GROUPS.map((group) => (
                            <SidebarGroup
                                key={group.label}
                                role="group"
                                aria-label={group.label}
                            >
                                <SidebarGroupLabel aria-hidden="true">
                                    {group.label}
                                </SidebarGroupLabel>
                                <SidebarGroupContent>
                                    <SidebarMenu>
                                        {group.items.map((option) => {
                                            const Icon = option.icon;
                                            const active =
                                                view === option.value;
                                            const count =
                                                navCounts[option.value];
                                            return (
                                                <SidebarMenuItem
                                                    key={option.value}
                                                >
                                                    <SidebarMenuButton
                                                        type="button"
                                                        isActive={active}
                                                        aria-current={
                                                            active
                                                                ? "page"
                                                                : undefined
                                                        }
                                                        onMouseEnter={() =>
                                                            prefetchView(
                                                                option.value
                                                            )
                                                        }
                                                        onFocus={() =>
                                                            prefetchView(
                                                                option.value
                                                            )
                                                        }
                                                        onClick={() =>
                                                            setView(
                                                                option.value
                                                            )
                                                        }
                                                    >
                                                        <Icon
                                                            aria-hidden="true"
                                                            className={
                                                                active
                                                                    ? undefined
                                                                    : "text-muted-foreground"
                                                            }
                                                        />
                                                        <span>
                                                            {option.label}
                                                        </span>
                                                    </SidebarMenuButton>
                                                    {count != null ? (
                                                        <SidebarMenuBadge className="font-mono text-[11px] font-normal text-muted-foreground">
                                                            {count.toLocaleString()}
                                                        </SidebarMenuBadge>
                                                    ) : null}
                                                </SidebarMenuItem>
                                            );
                                        })}
                                    </SidebarMenu>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        ))}
                    </SidebarContent>
                </nav>
                {/* Same height as the app's activity footer (h-8) so the two
                    strips read as one continuous baseline. */}
                <SidebarFooter className="h-8 shrink-0 justify-center border-t px-3 py-0 group-data-[collapsible=icon]:px-0">
                    <span
                        className="truncate font-mono text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden"
                        title={repoRoot}
                    >
                        {repoRoot ? `${repoRoot}/.project` : ".project"}
                    </span>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset className="h-svh min-w-0 overflow-hidden">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                    <SidebarTrigger className="shrink-0" />
                    {/* The breadcrumb is the first thing to go when the bar
                        runs out of room: it repeats what the view header says
                        one line below, while the search field and New card are
                        the reason the bar exists. Left in place it simply
                        overlapped them. */}
                    <Breadcrumb
                        aria-label="Breadcrumb"
                        className="hidden min-w-0 lg:block"
                    >
                        <BreadcrumbList className="flex-nowrap gap-1.5 font-mono text-xs sm:gap-1.5">
                            <BreadcrumbItem>.project</BreadcrumbItem>
                            <BreadcrumbSeparator>/</BreadcrumbSeparator>
                            {crumbRecord ? (
                                <>
                                    <BreadcrumbItem>
                                        {crumbCollection}
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator>/</BreadcrumbSeparator>
                                    <BreadcrumbItem className="min-w-0">
                                        <BreadcrumbPage className="max-w-[32ch] truncate">
                                            {crumbRecord}
                                        </BreadcrumbPage>
                                    </BreadcrumbItem>
                                </>
                            ) : (
                                <BreadcrumbItem className="min-w-0">
                                    <BreadcrumbPage className="max-w-[32ch] truncate">
                                        {crumbCollection}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            )}
                        </BreadcrumbList>
                    </Breadcrumb>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto w-full min-w-0 max-w-80 shrink justify-start px-2.5 font-normal text-muted-foreground"
                        onClick={() => setShowPalette(true)}
                    >
                        <Search aria-hidden="true" className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate text-left text-[13px]">
                            Search{" "}
                            {indexedTotal
                                ? `${indexedTotal.toLocaleString()} records…`
                                : "records…"}
                        </span>
                        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title={
                            comfortable
                                ? "Compact rows"
                                : "Comfortable rows"
                        }
                        aria-label="Toggle row density"
                        aria-pressed={comfortable}
                        className="shrink-0"
                        onClick={() => setComfortable((current) => !current)}
                    >
                        {comfortable ? (
                            <Rows3 aria-hidden="true" />
                        ) : (
                            <Rows4 aria-hidden="true" />
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Toggle theme"
                        aria-label="Toggle theme"
                        className="shrink-0"
                        onClick={() => setDark((current) => !current)}
                    >
                        {dark ? (
                            <Sun aria-hidden="true" />
                        ) : (
                            <Moon aria-hidden="true" />
                        )}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        title="New card"
                        aria-label="New card"
                        className="shrink-0 max-sm:size-8 max-sm:px-0"
                        onClick={() => setShowNewCard(true)}
                    >
                        <Plus aria-hidden="true" />
                        <span className="max-sm:hidden">New card</span>
                    </Button>
                </header>

                <div className="flex min-h-0 flex-1">
                    <section className="flex min-w-0 flex-1 flex-col">
                        {/* Below `sm` the title sits on its own line and the
                            filters become a single horizontally-scrollable
                            strip that bleeds to the screen edges — chips used
                            to wrap into two and three stacked rows that ate the
                            view's height. From `sm` up the title and the strip
                            share one line again, the strip pushed right. */}
                        <div className="flex min-h-10 shrink-0 flex-col gap-2 border-b px-3 py-1.5 sm:flex-row sm:flex-wrap sm:items-center">
                            <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
                                <span className="text-sm font-medium">
                                    {VIEW_TITLE[view]}
                                </span>
                                {viewMeta ? (
                                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                                        {viewMeta}
                                    </span>
                                ) : null}
                            </div>
                            {isWorkView ? (
                                <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:ml-auto sm:overflow-visible sm:px-0">
                                    <FilterChip
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
                                    <FilterChip
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
                                    <FilterChip
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
                                    <FilterChip
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
                                        <FilterChip
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
                                    <FilterToggle
                                        label="ideas"
                                        on={filters.showIdeas}
                                        onChange={(showIdeas) =>
                                            setFilters((current) => ({
                                                ...current,
                                                showIdeas
                                            }))
                                        }
                                    />
                                    <FilterToggle
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
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground"
                                            onClick={resetFilters}
                                        >
                                            reset
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        {error ? (
                            <Alert
                                variant="destructive"
                                role="status"
                                aria-live="polite"
                                className="shrink-0 rounded-none border-x-0 border-t-0 px-3 py-2"
                            >
                                <AlertDescription className="pr-8">
                                    {error}
                                </AlertDescription>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Dismiss error"
                                    className="absolute top-1.5 right-2"
                                    onClick={() => setError("")}
                                >
                                    <X aria-hidden="true" />
                                </Button>
                            </Alert>
                        ) : null}
                        {scopeConflicts.length > 0 && isWorkView ? (
                            <Alert
                                role="status"
                                aria-live="polite"
                                className="shrink-0 rounded-none border-x-0 border-t-0 px-3 py-2"
                            >
                                <AlertDescription>
                                    <span>
                                        Scope overlap between in-progress
                                        cards:{" "}
                                        <span className="font-mono">
                                            {scopeConflicts.join(" · ")}
                                        </span>
                                    </span>
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                            <Suspense
                                fallback={<ViewLoading label="Loading view…" />}
                            >
                                {loading ? (
                                    <ViewLoading label="Loading backlog…" />
                                ) : view === "overview" ? (
                                    <OverviewView
                                        tasks={tasks}
                                        openTasks={openTasks}
                                        health={health}
                                        activity={activity}
                                        moduleCounts={moduleCounts}
                                        onOpen={openRecord}
                                        onNavigate={setView}
                                    />
                                ) : view === "explorer" ? (
                                    <Explorer
                                        tasks={visibleTasks}
                                        allTasks={tasks}
                                        areas={areas}
                                        filters={filters}
                                        setFilters={setFilters}
                                        epicIds={epicIds}
                                        onOpen={selectRecord}
                                        onPatch={patch}
                                        onBulkPatch={bulkPatch}
                                    />
                                ) : view === "flow" ? (
                                    <FlowBoard
                                        tasks={visibleTasks}
                                        epicIds={epicIds}
                                        showClosed={filters.showClosed}
                                        onOpen={selectRecord}
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
                                        onOpen={selectRecord}
                                    />
                                ) : view === "epics" ? (
                                    <EpicsView
                                        tasks={visibleTasks}
                                        allTasks={tasks}
                                        epicIds={epicIds}
                                        onOpen={selectRecord}
                                    />
                                ) : view === "timeline" ? (
                                    <TimelineView
                                        tasks={timelineTasks}
                                        epicIds={epicIds}
                                        axes={schema.cards.axes}
                                        mode={timelineMode}
                                        counts={timelineCounts}
                                        onModeChange={chooseDates}
                                        onOpen={selectRecord}
                                    />
                                ) : view === "docs" ? (
                                    <DocsView
                                        selectedId={selectedId}
                                        onSelect={selectRecord}
                                        onOpenCard={openRecord}
                                    />
                                ) : view === "workflow" ? (
                                    <WorkflowView
                                        selectedId={selectedId}
                                        onSelect={selectRecord}
                                        // The strip is rendered over this view
                                        // because `isWorkView` is defined by
                                        // exclusion. It used to stop there.
                                        filters={graphFilters}
                                    />
                                ) : view === "history" ? (
                                    <HistoryView
                                        selectedId={selectedId}
                                        onSelect={selectRecord}
                                        onOpenRecord={openRecord}
                                        schema={schema.changelog}
                                        areas={areas}
                                    />
                                ) : view === "memory" ? (
                                    <MemoryView
                                        selectedId={selectedId}
                                        onSelect={selectRecord}
                                        onOpenRecord={openRecord}
                                        schema={schema.memory}
                                    />
                                ) : (
                                    <HealthView onOpen={openRecord} />
                                )}
                            </Suspense>
                        </div>
                    </section>
                </div>

                <footer
                    aria-label="Agent activity"
                    className="flex h-8 shrink-0 items-center gap-3 overflow-hidden border-t px-3 font-mono text-[10.5px] text-muted-foreground"
                >
                    {/* The claim ledger and the status badges used to be
                        siblings in one row, and neither would yield: below
                        ~900px they drew straight over each other. The ledger is
                        the part that can wait — it is a detail of who is working
                        where, and the badges are the app's health readout. */}
                    <div className="hidden min-w-0 flex-1 items-center gap-3 overflow-hidden lg:flex">
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
                                className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
                                onClick={() => openRecord(entry.id)}
                                title={`${entry.claim.by} · ${entry.claim.state}`}
                            >
                                <span
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ background: tone }}
                                    aria-hidden="true"
                                />
                                <span style={{ color: tone }}>
                                    {entry.claim.by}
                                </span>
                                <span className="truncate">
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
                            <span className="opacity-40" aria-hidden="true">
                                |
                            </span>
                            <span style={{ color: "var(--sev-warning)" }}>
                                {activity.conflicts.length} scope overlap
                                {activity.conflicts.length === 1 ? "" : "s"}
                            </span>
                        </>
                    ) : null}
                    {!ledgerClaims.length && !activity?.conflicts.length ? (
                        <span>no active claims</span>
                    ) : null}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-3">
                    {health ? (
                        <Badge
                            asChild
                            variant="outline"
                            className="shrink-0 cursor-pointer font-mono text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                            <button
                                type="button"
                                title="workfile doctor"
                                onClick={() => setView("health")}
                            >
                                <span
                                    className="size-1.5 rounded-full bg-current"
                                    style={{
                                        color: worstSeverity
                                            ? severityColor(worstSeverity)
                                            : statusColor("done")
                                    }}
                                    aria-hidden="true"
                                />
                                doctor {health.counts.error}E ·{" "}
                                {health.counts.warning}W · {health.counts.info}
                                I
                            </button>
                        </Badge>
                    ) : null}
                    {import.meta.env.VITE_DEMO !== "1" ? (
                        <Badge
                            variant="outline"
                            title="Change stream"
                            className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground"
                        >
                            <span
                                className="size-1.5 rounded-full bg-current"
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
                        </Badge>
                    ) : null}
                    {/* A count, not a task. This carried a Spinner, which has
                        no completion to reach because `indexedTotal` is a sum
                        of numbers already in hand — so it span for the life of
                        the tab and made the one control that means "busy" mean
                        nothing anywhere else in the app. */}
                    {indexedTotal ? (
                        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                            <Database className="size-3" aria-hidden="true" />
                            index {indexedTotal.toLocaleString()} records
                        </span>
                    ) : null}
                    </div>
                </footer>
            </SidebarInset>

            {/* Open needs BOTH the user preference and a selection: the old
                in-flow rail could sit empty ("select a record"), but an empty
                overlay is dead glass over the board — a fresh load must not
                cover the toolbar with a drawer that has nothing to say. */}
            <RecordDrawer
                open={
                    inspectorOpen &&
                    selectedId !== null &&
                    // Any kind, not cards only. A drawer that opened for one
                    // of the five meant every other kind had to be read in the
                    // view that lists it, so a `[[DOC-0002]]` in a card body
                    // led nowhere — and the graph grew a second drawer to say
                    // what the first would not, which then stacked over it.
                    //
                    // Any kind there *is*: an id that names no collection is a
                    // selection of nothing, and the drawer stays shut.
                    drawerCovers(view, drawerCollection)
                }
                expanded={inspectorExpanded}
                label="inspector"
                description="Details and editing for the selected record."
                onOpenChange={(next) => {
                    setInspectorOpen(next);
                    // And drop the selection, which is what the memory and doc
                    // sheets already do. Closing only the panel left
                    // `?record=` in the URL naming something no longer on
                    // screen, so a reload — or a shared link — reopened a
                    // record the reader had deliberately dismissed.
                    if (!next) setSelectedId(null);
                }}
                onExpandedChange={setInspectorExpanded}
                holdOpen={() =>
                    editingRef.current ||
                    performance.now() - lastSelectRef.current < 200
                }
            >
                {selectedId && !selected ? (
                    // Not a card, or a card the board is not holding — an
                    // archived one reached by ID, say. Either way the
                    // inspector has nothing to render, and rendering nothing
                    // is what used to close the sheet without a word.
                    //
                    // A panel per kind rather than one generic reader: a
                    // decision has a lifecycle to act on and a document has a
                    // status, a path and a freshness warning, and none of that
                    // survives being rendered as "a record with a body".
                    // `RecordPanel` stays as the fallback, which is what
                    // changelog fragments and releases get.
                    drawerCollection === "memory" ? (
                        <MemoryPanel
                            key={selectedId}
                            id={selectedId}
                            schema={schema.memory}
                            onSelect={selectRecord}
                            onOpenRecord={(id) => openRecord(id, true)}
                            onDialogOpenChange={(open) => {
                                editingRef.current = open;
                            }}
                        />
                    ) : drawerCollection === "docs" ? (
                        <DocPanel
                            key={selectedId}
                            id={selectedId}
                            onSelect={selectRecord}
                            onOpen={(id) => openRecord(id, true)}
                        />
                    ) : (
                        <RecordPanel
                            key={selectedId}
                            id={selectedId}
                            onSelect={selectRecord}
                            onOpen={(id) => openRecord(id, true)}
                        />
                    )
                ) : (
                <Inspector
                    task={selected}
                    selectedId={selectedId}
                    repoRoot={repoRoot}
                    repoUrl={repoUrl}
                    tasks={tasks}
                    areas={areas}
                    schema={schema}
                    orderedIds={visibleTasks.map(
                        (task) => task.id
                    )}
                    // `openRecord`, not `selectRecord`. This prop reaches the
                    // body's `[[DOC-0002]]` links and the `origin` and
                    // `related` rows, all of which carry records of any kind.
                    // `selectRecord` only opens a panel for cards, so a doc
                    // set the selection to something the inspector could not
                    // render: the sheet closed, the view never changed, and
                    // nothing errored.
                    onOpen={openRecord}
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
                                tasks.find(
                                    (task) => task.id === id
                                )?.revision
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
                                [...files].map((file) =>
                                    api.upload(id, file)
                                )
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
                )}
            </RecordDrawer>

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
        </SidebarProvider>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
