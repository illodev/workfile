import {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction
} from "react";

import { ArrowDown, ArrowUp, ChevronsUpDown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle
} from "@/components/ui/empty";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from "@/components/ui/sheet";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { filterTasks } from "../../query";
import { priorityColor, statusColor } from "../../theme";
import {
    PRIORITIES,
    STATUSES,
    TYPES,
    type Filters,
    type SortKey,
    type Task,
    type TaskPatch
} from "../../types";

const SORT_COLUMNS: Array<[SortKey, string]> = [
    ["id", "id"],
    ["title", "title · claim"],
    ["status", "status"],
    ["priority", "prio"],
    ["type", "type"],
    ["area", "area"],
    ["epic", "links"],
    ["updated", "updated"]
];
const PRIORITY_ORDER = new Map(
    PRIORITIES.map((value, index) => [value, index])
);
const STATUS_ORDER = new Map(STATUSES.map((value, index) => [value, index]));
const COLUMN_COUNT = SORT_COLUMNS.length + 1; // + leading checkbox cell

interface ExplorerProps {
    tasks: Task[];
    allTasks: Task[];
    areas: readonly string[];
    filters: Filters;
    setFilters: Dispatch<SetStateAction<Filters>>;
    epicIds: Map<string, string>;
    onOpen: (id: string) => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
    onBulkPatch: (ids: string[], changes: TaskPatch) => Promise<void>;
}

function countBy(tasks: Task[], key: keyof Task) {
    const counts = new Map<string, number>();
    for (const task of tasks) {
        const value = task[key];
        if (typeof value === "string")
            counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
}

/**
 * One facet group in the left rail: overline label, then a row per value that
 * exists in the current result set — label + count + a meter scaled to the
 * group's maximum. Clicking a row toggles that dimension's filter.
 *
 * The meter is a Progress whose indicator rides `currentColor`: status and
 * priority groups set the surviving semantic token on the bar, the rest fall
 * back to the primary hue.
 */
function FacetGroup({
    title,
    values,
    counts,
    selected,
    color,
    onSelect
}: {
    title: string;
    values: readonly string[];
    counts: Map<string, number>;
    selected: string;
    color?: (value: string) => string;
    onSelect: (value: string) => void;
}) {
    const present = values.filter((value) => counts.has(value));
    if (!present.length) return null;
    const max = Math.max(...present.map((value) => counts.get(value) || 0));
    return (
        <div className="flex flex-col gap-1">
            <span className="px-1.5 font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                {title}
            </span>
            {present.map((value) => {
                const count = counts.get(value) || 0;
                const active = selected === value;
                return (
                    <button
                        type="button"
                        key={value}
                        aria-pressed={active}
                        onClick={() => onSelect(active ? "" : value)}
                        className={cn(
                            "flex w-full cursor-pointer flex-col gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/50",
                            active && "bg-accent"
                        )}
                    >
                        <span className="flex w-full items-center gap-1.5">
                            <span
                                className={cn(
                                    "min-w-0 flex-1 truncate text-xs",
                                    active
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground"
                                )}
                            >
                                {value}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                                {count}
                            </span>
                        </span>
                        <Progress
                            value={max ? Math.round((count / max) * 100) : 0}
                            className={cn(
                                "h-[5px] bg-muted [&>div]:bg-current",
                                !color && "text-primary"
                            )}
                            style={
                                color ? { color: color(value) } : undefined
                            }
                        />
                    </button>
                );
            })}
        </div>
    );
}

/**
 * The status and priority controls inside a row.
 *
 * A native `<select>` on purpose, per CONV-0003: a portalled select's content
 * can outlive its row in a virtualised table. The registry NativeSelect is
 * stripped down to the design's coloured mono text — the dot next to it
 * carries the same hue via `currentColor`, and NativeSelectOption keeps the
 * native popup readable despite the transparent, status-coloured trigger.
 */
function RowSelect({
    label,
    value,
    options,
    color,
    withDot,
    onChange
}: {
    label: string;
    value: string;
    options: readonly string[];
    color: string;
    withDot?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <span
            className="inline-flex items-center gap-1.5"
            style={{ color }}
        >
            {withDot ? (
                <span
                    className="size-1.5 shrink-0 rounded-full bg-current"
                    aria-hidden="true"
                />
            ) : null}
            <NativeSelect
                aria-label={label}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-[22px] cursor-pointer border-transparent bg-transparent px-1 py-0 pr-8 font-mono text-[11px] text-inherit shadow-none dark:bg-transparent dark:hover:bg-transparent"
            >
                {options.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                        {option}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
        </span>
    );
}

interface TaskRowProps {
    task: Task;
    epicId: string;
    checked: boolean;
    isOpen: boolean;
    onToggle: (id: string) => void;
    onOpen: (id: string) => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
}

const TaskRow = memo(function TaskRow({
    task,
    epicId,
    checked,
    isOpen,
    onToggle,
    onOpen,
    onPatch
}: TaskRowProps) {
    const links = (task.depends?.length ?? 0) + (task.parent ? 1 : 0);
    return (
        <TableRow
            className="h-[var(--row-h)] cursor-pointer"
            data-state={isOpen ? "selected" : undefined}
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(task.id);
            }}
        >
            {/* The open row carries the accent where the row starts — the
                very first cell's left edge, not the id column's. */}
            <TableCell
                className={cn(
                    "w-7 border-l-2 border-l-transparent",
                    isOpen && "border-l-primary"
                )}
                onClick={(event) => event.stopPropagation()}
            >
                <Checkbox
                    aria-label={`Select ${task.id}`}
                    checked={checked}
                    onCheckedChange={() => onToggle(task.id)}
                />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
                {task.id}
            </TableCell>
            <TableCell className="max-w-[520px]">
                <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate font-medium">
                        {task.title}
                    </span>
                    {task.claimed_by ? (
                        <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground/60">
                            · {task.claimed_by}
                        </span>
                    ) : null}
                </span>
            </TableCell>
            <TableCell onClick={(event) => event.stopPropagation()}>
                <RowSelect
                    label={`Status for ${task.id}`}
                    value={task.status}
                    options={STATUSES}
                    color={statusColor(task.status)}
                    withDot
                    onChange={(status) =>
                        void onPatch(task.id, {
                            status: status as Task["status"]
                        }).catch(() => undefined)
                    }
                />
            </TableCell>
            <TableCell onClick={(event) => event.stopPropagation()}>
                <RowSelect
                    label={`Priority for ${task.id}`}
                    value={task.priority}
                    options={PRIORITIES}
                    color={priorityColor(task.priority)}
                    onChange={(priority) =>
                        void onPatch(task.id, {
                            priority: priority as Task["priority"]
                        }).catch(() => undefined)
                    }
                />
            </TableCell>
            <TableCell className="font-mono text-[11px] text-muted-foreground">
                {task.type}
            </TableCell>
            <TableCell className="font-mono text-[11px] text-muted-foreground">
                {task.area}
            </TableCell>
            <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                {epicId ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpen(epicId);
                        }}
                        className={cn(
                            "cursor-pointer text-primary hover:underline",
                            links > 0 && "mr-1.5"
                        )}
                    >
                        {epicId}
                    </button>
                ) : null}
                {links > 0 ? `${links} ↔` : epicId ? null : "—"}
            </TableCell>
            <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                {task.updated || "—"}
            </TableCell>
        </TableRow>
    );
});

export function Explorer({
    tasks,
    allTasks,
    areas,
    filters,
    setFilters,
    epicIds,
    onOpen,
    onPatch,
    onBulkPatch
}: ExplorerProps) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [openId, setOpenId] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("id");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [bulkStatus, setBulkStatus] = useState("");
    const [bulkPriority, setBulkPriority] = useState("");
    const [bulkArea, setBulkArea] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ start: 0, end: 40 });
    const [rowHeight, setRowHeight] = useState(40);

    // Faceted counts: every dimension counts the set filtered by all the OTHER
    // filters, so the number on a value is exactly what the table will show
    // when it is clicked. Ideas stay countable even while hidden, because
    // selecting type=idea reveals them.
    const deferredFilters = useDeferredValue(filters);
    const counts = useMemo(() => {
        const base = (override: Partial<Filters>) =>
            filterTasks(allTasks, { ...deferredFilters, ...override });
        return {
            status: countBy(base({ status: "" }), "status"),
            type: countBy(base({ type: "", showIdeas: true }), "type"),
            priority: countBy(base({ priority: "" }), "priority"),
            area: countBy(base({ area: "" }), "area")
        };
    }, [allTasks, deferredFilters]);

    const sorted = useMemo(() => {
        const copy = [...tasks];
        copy.sort((left, right) => {
            let comparison = 0;
            if (sortKey === "priority")
                comparison =
                    (PRIORITY_ORDER.get(left.priority) || 0) -
                    (PRIORITY_ORDER.get(right.priority) || 0);
            else if (sortKey === "status")
                comparison =
                    (STATUS_ORDER.get(left.status) || 0) -
                    (STATUS_ORDER.get(right.status) || 0);
            else if (sortKey === "epic")
                comparison = (epicIds.get(left.id) || "").localeCompare(
                    epicIds.get(right.id) || ""
                );
            else
                comparison = String(left[sortKey] || "").localeCompare(
                    String(right[sortKey] || ""),
                    undefined,
                    { numeric: true }
                );
            return sortDirection === "asc" ? comparison : -comparison;
        });
        return copy;
    }, [epicIds, sortDirection, sortKey, tasks]);

    // Windowed rows over one scroll container. The row height is the theme's
    // `--row-h` (density-dependent), so it is measured, not assumed — the
    // rows key their height off the same token (`h-[var(--row-h)]`).
    const rowCount = useRef(0);
    const hasRows = sorted.length > 0;
    const recalculate = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        const measured =
            parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--row-h"
                )
            ) || 40;
        setRowHeight(measured);
        const overscan = 10;
        const start = Math.max(
            0,
            Math.floor(element.scrollTop / measured) - overscan
        );
        const visible = Math.ceil(element.clientHeight / measured);
        setViewport({
            start,
            end: Math.min(rowCount.current, start + visible + overscan * 2)
        });
    }, []);

    // Re-attach when the scroll container remounts after an empty result set.
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        element.addEventListener("scroll", recalculate, { passive: true });
        window.addEventListener("resize", recalculate);
        const observer = new MutationObserver(recalculate);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-density"]
        });
        return () => {
            element.removeEventListener("scroll", recalculate);
            window.removeEventListener("resize", recalculate);
            observer.disconnect();
        };
    }, [recalculate, hasRows]);

    useEffect(() => {
        rowCount.current = sorted.length;
        recalculate();
    }, [recalculate, sorted.length]);

    // Only a new query deserves a jump back to the top. Reloads and inline
    // edits rebuild the array without changing what the user is looking at,
    // and resetting there would throw away their scroll position.
    const queryKey = [
        filters.search,
        filters.status,
        filters.area,
        filters.type,
        filters.priority,
        filters.milestone,
        filters.showIdeas,
        filters.showClosed,
        sortKey,
        sortDirection
    ].join("|");
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        recalculate();
    }, [queryKey, recalculate]);

    const toggleSelection = useCallback((id: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const openRow = useCallback(
        (id: string) => {
            setOpenId(id);
            onOpen(id);
        },
        [onOpen]
    );

    const visibleIds = useMemo(() => sorted.map((task) => task.id), [sorted]);
    const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const someVisibleSelected = visibleIds.some((id) => selected.has(id));
    const rows = sorted.slice(viewport.start, viewport.end);
    const bulkReady = Boolean(bulkStatus || bulkPriority || bulkArea);

    function changeSort(nextKey: SortKey) {
        if (sortKey === nextKey)
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        else {
            setSortKey(nextKey);
            setSortDirection(nextKey === "id" ? "desc" : "asc");
        }
    }

    async function applyBulk() {
        const changes: TaskPatch = {};
        if (bulkStatus) changes.status = bulkStatus as Task["status"];
        if (bulkPriority) changes.priority = bulkPriority as Task["priority"];
        if (bulkArea) changes.area = bulkArea;
        if (!bulkReady || selected.size === 0) return;
        try {
            await onBulkPatch([...selected], changes);
            setSelected(new Set());
            setBulkStatus("");
            setBulkPriority("");
            setBulkArea("");
        } catch {
            // The app-level error banner supplies the recovery path.
        }
    }

    /*
     * The facets are written once and mounted twice: pinned beside the table
     * from `lg` up, and behind a sheet below it. The rail is 204px against a
     * table that already needs more room than a phone has, so at 390 the two
     * of them left about 180px for nine columns — the facets were not narrow,
     * they were taking the whole view.
     */
    const facets = (
        <>
            <FacetGroup
                title="status"
                values={STATUSES}
                counts={counts.status}
                selected={filters.status}
                color={statusColor}
                onSelect={(status) =>
                    setFilters((current) => ({
                        ...current,
                        status: status as Filters["status"]
                    }))
                }
            />
            <FacetGroup
                title="priority"
                values={PRIORITIES}
                counts={counts.priority}
                selected={filters.priority}
                color={priorityColor}
                onSelect={(priority) =>
                    setFilters((current) => ({
                        ...current,
                        priority: priority as Filters["priority"]
                    }))
                }
            />
            <FacetGroup
                title="area"
                values={areas}
                counts={counts.area}
                selected={filters.area}
                onSelect={(area) =>
                    setFilters((current) => ({
                        ...current,
                        area: area as Filters["area"]
                    }))
                }
            />
            <FacetGroup
                title="type"
                values={TYPES}
                counts={counts.type}
                selected={filters.type}
                onSelect={(type) =>
                    setFilters((current) => ({
                        ...current,
                        type: type as Filters["type"]
                    }))
                }
            />
        </>
    );

    const narrowed = [
        filters.status,
        filters.priority,
        filters.area,
        filters.type
    ].filter(Boolean).length;

    return (
        <div className="flex min-h-0 flex-1">
            <aside
                aria-label="Backlog facets"
                className="hidden w-[204px] flex-none flex-col gap-5 overflow-y-auto border-r px-3.5 py-4 lg:flex"
            >
                {facets}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex flex-none items-center gap-2 px-3.5 pt-2.5 lg:hidden">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                            >
                                <SlidersHorizontal className="size-3.5" />
                                Facets
                                {narrowed ? (
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                        {narrowed}
                                    </span>
                                ) : null}
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="left"
                            className="w-[280px] gap-0 sm:max-w-[280px]"
                        >
                            <SheetHeader className="pb-2">
                                <SheetTitle className="font-mono text-[11px] tracking-wide uppercase">
                                    Facets
                                </SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
                                {facets}
                            </div>
                        </SheetContent>
                    </Sheet>
                    {/* The table below scrolls sideways rather than becoming a
                        different view: sorting, selection, inline edit and the
                        virtualization all measure one grid, and a second
                        card-shaped implementation of them would be a second
                        set of bugs. */}
                    <span className="font-mono text-[10.5px] text-muted-foreground/70">
                        {sorted.length.toLocaleString()} row
                        {sorted.length === 1 ? "" : "s"} · scroll sideways for
                        every column
                    </span>
                </div>

                {selected.size > 0 && (
                    <div
                        role="region"
                        aria-label="Bulk actions"
                        // A wash and a hairline are how every other strip in
                        // the app separates itself. The accent edge this
                        // carried was the only one in the interface, and in
                        // dark mode the primary token is light enough that it
                        // read as a bare stripe rather than as emphasis.
                        className="mx-3.5 mt-2.5 mb-2.5 flex flex-none flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2"
                    >
                        <span className="font-mono text-[11px]">
                            {selected.size} selected
                        </span>
                        <NativeSelect
                            aria-label="Set status"
                            value={bulkStatus}
                            onChange={(event) =>
                                setBulkStatus(event.target.value)
                            }
                            size="sm"
                        >
                            <NativeSelectOption value="">
                                status…
                            </NativeSelectOption>
                            {STATUSES.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <NativeSelect
                            aria-label="Set priority"
                            value={bulkPriority}
                            onChange={(event) =>
                                setBulkPriority(event.target.value)
                            }
                            size="sm"
                        >
                            <NativeSelectOption value="">
                                priority…
                            </NativeSelectOption>
                            {PRIORITIES.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <NativeSelect
                            aria-label="Set area"
                            value={bulkArea}
                            onChange={(event) =>
                                setBulkArea(event.target.value)
                            }
                            size="sm"
                        >
                            <NativeSelectOption value="">
                                area…
                            </NativeSelectOption>
                            {areas.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        {/* The same rung the selects beside them declare — a
                            strip of controls that steps up in the middle
                            reads as two strips. It used to take two hand-
                            written heights to say that; now it takes the
                            word. */}
                        <ButtonGroup>
                            <Button
                                size="sm"
                                disabled={!bulkReady}
                                onClick={() => void applyBulk()}
                            >
                                Apply
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelected(new Set())}
                            >
                                Clear
                            </Button>
                        </ButtonGroup>
                    </div>
                )}

                {sorted.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>No cards match</EmptyTitle>
                            <EmptyDescription>
                                Adjust filters or clear the search
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    /*
                     * The registry Table wraps its <table> in an
                     * overflow-x-auto container; left alone, that inner box
                     * becomes the scrollport the sticky header attaches to,
                     * and it never scrolls — so the header would drift away
                     * with the rows. Opening the wrapper up restores the
                     * bespoke system's single scroll container: this div owns
                     * both axes, the header sticks to it, and the
                     * virtualization math keeps reading the element it
                     * measures.
                     */
                    <div
                        ref={scrollRef}
                        className="min-w-0 flex-1 overflow-auto [&>[data-slot=table-container]]:overflow-visible"
                    >
                        <Table className="text-[13px]">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="sticky top-0 z-10 w-7 bg-background">
                                        <Checkbox
                                            aria-label="Select all matching cards"
                                            checked={
                                                allVisibleSelected
                                                    ? true
                                                    : someVisibleSelected
                                                      ? "indeterminate"
                                                      : false
                                            }
                                            onCheckedChange={() =>
                                                setSelected((current) => {
                                                    const next = new Set(
                                                        current
                                                    );
                                                    if (allVisibleSelected)
                                                        visibleIds.forEach(
                                                            (id) =>
                                                                next.delete(id)
                                                        );
                                                    else
                                                        visibleIds.forEach(
                                                            (id) =>
                                                                next.add(id)
                                                        );
                                                    return next;
                                                })
                                            }
                                        />
                                    </TableHead>
                                    {SORT_COLUMNS.map(([key, label]) => (
                                        <TableHead
                                            key={key}
                                            aria-sort={
                                                sortKey === key
                                                    ? sortDirection === "asc"
                                                        ? "ascending"
                                                        : "descending"
                                                    : "none"
                                            }
                                            className="sticky top-0 z-10 bg-background"
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => changeSort(key)}
                                                className="-ml-2 px-2 text-muted-foreground"
                                            >
                                                {label}
                                                {sortKey === key ? (
                                                    sortDirection === "asc" ? (
                                                        <ArrowUp className="size-3" />
                                                    ) : (
                                                        <ArrowDown className="size-3" />
                                                    )
                                                ) : (
                                                    <ChevronsUpDown className="size-3 opacity-50" />
                                                )}
                                            </Button>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {viewport.start > 0 && (
                                    <tr aria-hidden="true">
                                        <td
                                            colSpan={COLUMN_COUNT}
                                            style={{
                                                height:
                                                    viewport.start * rowHeight
                                            }}
                                        />
                                    </tr>
                                )}
                                {rows.map((task) => (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        epicId={epicIds.get(task.id) || ""}
                                        checked={selected.has(task.id)}
                                        isOpen={openId === task.id}
                                        onToggle={toggleSelection}
                                        onOpen={openRow}
                                        onPatch={onPatch}
                                    />
                                ))}
                                {viewport.end < sorted.length && (
                                    <tr aria-hidden="true">
                                        <td
                                            colSpan={COLUMN_COUNT}
                                            style={{
                                                height:
                                                    (sorted.length -
                                                        viewport.end) *
                                                    rowHeight
                                            }}
                                        />
                                    </tr>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}
