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
 * exists in the current result set — label + count + a 3px meter scaled to the
 * group's maximum. Clicking a row toggles that dimension's filter.
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
        <div className="facet">
            <span className="overline">{title}</span>
            {present.map((value) => {
                const count = counts.get(value) || 0;
                const active = selected === value;
                return (
                    <button
                        type="button"
                        key={value}
                        className={active ? "facet-row is-on" : "facet-row"}
                        aria-pressed={active}
                        onClick={() => onSelect(active ? "" : value)}
                    >
                        <span className="facet-line">
                            <span className="facet-label">{value}</span>
                            <span className="facet-count">{count}</span>
                        </span>
                        <span className="meter">
                            <span
                                className="meter-fill"
                                style={{
                                    width: `${max ? Math.round((count / max) * 100) : 0}%`,
                                    background: color
                                        ? color(value)
                                        : "var(--accent)"
                                }}
                            />
                        </span>
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
 * can outlive its row in a virtualised table. It is stripped down to the
 * design's coloured mono text — the `.dot` next to it carries the same hue via
 * `currentColor`.
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
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color
            }}
        >
            {withDot ? <span className="dot" aria-hidden="true" /> : null}
            <select
                className="select mono"
                aria-label={label}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                style={{
                    width: "auto",
                    height: 22,
                    padding: "0 2px",
                    background: "transparent",
                    borderColor: "transparent",
                    color: "inherit",
                    fontSize: 11
                }}
            >
                {options.map((option) => (
                    // The native popup would otherwise inherit the trigger's
                    // transparent surface and status hue.
                    <option
                        key={option}
                        value={option}
                        style={{
                            background: "var(--bg)",
                            color: "var(--fg)"
                        }}
                    >
                        {option}
                    </option>
                ))}
            </select>
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
        <tr
            className={isOpen ? "is-selected" : undefined}
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(task.id);
            }}
        >
            <td
                style={{ width: 28 }}
                onClick={(event) => event.stopPropagation()}
            >
                <input
                    type="checkbox"
                    aria-label={`Select ${task.id}`}
                    checked={checked}
                    onChange={() => onToggle(task.id)}
                    style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                />
            </td>
            <td className="row-lead mono dim" style={{ fontSize: 12 }}>
                {task.id}
            </td>
            <td style={{ maxWidth: 520 }}>
                <span
                    style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        minWidth: 0
                    }}
                >
                    <span
                        className="truncate"
                        style={{ fontWeight: 500, minWidth: 0 }}
                    >
                        {task.title}
                    </span>
                    {task.claimed_by ? (
                        <span
                            className="mono faint"
                            style={{ fontSize: 10, whiteSpace: "nowrap" }}
                        >
                            · {task.claimed_by}
                        </span>
                    ) : null}
                </span>
            </td>
            <td onClick={(event) => event.stopPropagation()}>
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
            </td>
            <td onClick={(event) => event.stopPropagation()}>
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
            </td>
            <td className="mono dim" style={{ fontSize: 11 }}>
                {task.type}
            </td>
            <td className="mono dim" style={{ fontSize: 11 }}>
                {task.area}
            </td>
            <td className="mono faint" style={{ fontSize: 11 }}>
                {epicId ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpen(epicId);
                        }}
                        style={{
                            font: "inherit",
                            color: "var(--accent)",
                            background: "none",
                            border: 0,
                            padding: 0,
                            marginRight: links > 0 ? 6 : 0,
                            cursor: "pointer"
                        }}
                    >
                        {epicId}
                    </button>
                ) : null}
                {links > 0 ? `${links} ↔` : epicId ? null : "—"}
            </td>
            <td className="mono faint" style={{ fontSize: 11 }}>
                {task.updated || "—"}
            </td>
        </tr>
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
    const [rowHeight, setRowHeight] = useState(34);

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
    // `--row-h` (density-dependent), so it is measured, not assumed.
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
            ) || 34;
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

    return (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <aside className="facet-rail" aria-label="Backlog facets">
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
            </aside>

            <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0
                }}
            >
                {selected.size > 0 && (
                    <div
                        className="callout callout-accent"
                        role="region"
                        aria-label="Bulk actions"
                        style={{
                            flex: "0 0 auto",
                            alignItems: "center",
                            flexWrap: "wrap",
                            marginBottom: 10
                        }}
                    >
                        <span className="mono" style={{ fontSize: 11 }}>
                            {selected.size} selected
                        </span>
                        <select
                            className="select"
                            aria-label="Set status"
                            value={bulkStatus}
                            onChange={(event) =>
                                setBulkStatus(event.target.value)
                            }
                            style={{ width: "auto", height: 26, fontSize: 12 }}
                        >
                            <option value="">status…</option>
                            {STATUSES.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <select
                            className="select"
                            aria-label="Set priority"
                            value={bulkPriority}
                            onChange={(event) =>
                                setBulkPriority(event.target.value)
                            }
                            style={{ width: "auto", height: 26, fontSize: 12 }}
                        >
                            <option value="">priority…</option>
                            {PRIORITIES.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <select
                            className="select"
                            aria-label="Set area"
                            value={bulkArea}
                            onChange={(event) =>
                                setBulkArea(event.target.value)
                            }
                            style={{ width: "auto", height: 26, fontSize: 12 }}
                        >
                            <option value="">area…</option>
                            {areas.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="btn"
                            disabled={!bulkReady}
                            onClick={() => void applyBulk()}
                        >
                            Apply
                        </button>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => setSelected(new Set())}
                        >
                            Clear
                        </button>
                    </div>
                )}

                {sorted.length === 0 ? (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                    >
                        <span className="mono faint" style={{ fontSize: 12 }}>
                            no cards match — adjust filters
                        </span>
                    </div>
                ) : (
                    <div
                        ref={scrollRef}
                        style={{ flex: 1, minWidth: 0, overflow: "auto" }}
                    >
                        <table className="grid-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 28 }}>
                                        <input
                                            type="checkbox"
                                            aria-label="Select all matching cards"
                                            checked={allVisibleSelected}
                                            onChange={() =>
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
                                            style={{
                                                accentColor: "var(--accent)",
                                                cursor: "pointer"
                                            }}
                                        />
                                    </th>
                                    {SORT_COLUMNS.map(([key, label]) => (
                                        <th
                                            key={key}
                                            aria-sort={
                                                sortKey === key
                                                    ? sortDirection === "asc"
                                                        ? "ascending"
                                                        : "descending"
                                                    : "none"
                                            }
                                        >
                                            <button
                                                type="button"
                                                onClick={() => changeSort(key)}
                                                style={{
                                                    font: "inherit",
                                                    letterSpacing: "inherit",
                                                    textTransform: "inherit",
                                                    color: "inherit",
                                                    background: "none",
                                                    border: 0,
                                                    padding: 0,
                                                    cursor: "pointer"
                                                }}
                                            >
                                                {label}
                                                {sortKey === key
                                                    ? sortDirection === "asc"
                                                        ? " ↑"
                                                        : " ↓"
                                                    : ""}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
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
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
