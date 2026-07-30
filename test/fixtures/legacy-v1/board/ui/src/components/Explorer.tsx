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

import { filterTasks } from "../query";
import {
    AREAS,
    PRIORITIES,
    STATUSES,
    TYPES,
    type Filters,
    type SortKey,
    type Task,
    type TaskPatch
} from "../types";

const ROW_HEIGHT = 46;
const PRIORITY_ORDER = new Map(
    PRIORITIES.map((value, index) => [value, index])
);
const STATUS_ORDER = new Map(STATUSES.map((value, index) => [value, index]));

interface ExplorerProps {
    tasks: Task[];
    allTasks: Task[];
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

function Facet({
    title,
    values,
    counts,
    selected,
    onSelect
}: {
    title: string;
    values: readonly string[];
    counts: Map<string, number>;
    selected: string;
    onSelect: (value: string) => void;
}) {
    return (
        <section className="facet">
            <h3>{title}</h3>
            {values
                .filter((value) => counts.has(value))
                .map((value) => (
                    <button
                        type="button"
                        key={value}
                        className={selected === value ? "is-active" : ""}
                        onClick={() =>
                            onSelect(selected === value ? "" : value)
                        }
                    >
                        <span>{value}</span>
                        <span className="count">{counts.get(value)}</span>
                    </button>
                ))}
        </section>
    );
}

interface TaskRowProps {
    task: Task;
    epicId: string;
    selected: boolean;
    onToggle: (id: string) => void;
    onOpen: (id: string) => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
}

const TaskRow = memo(function TaskRow({
    task,
    epicId,
    selected,
    onToggle,
    onOpen,
    onPatch
}: TaskRowProps) {
    return (
        <tr
            className={selected ? "task-row is-selected" : "task-row"}
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(task.id);
            }}
        >
            <td
                className="selection-cell"
                onClick={(event) => event.stopPropagation()}
            >
                <input
                    type="checkbox"
                    aria-label={`Select ${task.id}`}
                    checked={selected}
                    onChange={() => onToggle(task.id)}
                />
            </td>
            <td className="id-cell">{task.id}</td>
            <td className="title-cell">
                <span className={`priority-dot priority-${task.priority}`} />
                <span>{task.title}</span>
            </td>
            <td onClick={(event) => event.stopPropagation()}>
                <select
                    className={`inline-select status-${task.status}`}
                    aria-label={`Status for ${task.id}`}
                    value={task.status}
                    onChange={(event) =>
                        void onPatch(task.id, {
                            status: event.target.value as Task["status"]
                        }).catch(() => undefined)
                    }
                >
                    {STATUSES.map((status) => (
                        <option value={status} key={status}>
                            {status}
                        </option>
                    ))}
                </select>
            </td>
            <td onClick={(event) => event.stopPropagation()}>
                <select
                    className="inline-select"
                    aria-label={`Priority for ${task.id}`}
                    value={task.priority}
                    onChange={(event) =>
                        void onPatch(task.id, {
                            priority: event.target.value as Task["priority"]
                        }).catch(() => undefined)
                    }
                >
                    {PRIORITIES.map((priority) => (
                        <option value={priority} key={priority}>
                            {priority}
                        </option>
                    ))}
                </select>
            </td>
            <td className="muted-cell">{task.type}</td>
            <td className="muted-cell">{task.area}</td>
            <td className="muted-cell">{epicId || task.parent || "—"}</td>
            <td className="muted-cell">{task.updated || "—"}</td>
        </tr>
    );
});

export function Explorer({
    tasks,
    allTasks,
    filters,
    setFilters,
    epicIds,
    onOpen,
    onPatch,
    onBulkPatch
}: ExplorerProps) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [sortKey, setSortKey] = useState<SortKey>("id");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [bulkField, setBulkField] = useState<
        "status" | "priority" | "area" | "type"
    >("status");
    const [bulkValue, setBulkValue] = useState("next");
    const scrollRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ start: 0, end: 40 });

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

    const rowCount = useRef(0);
    const recalculate = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        const overscan = 10;
        const start = Math.max(
            0,
            Math.floor(element.scrollTop / ROW_HEIGHT) - overscan
        );
        const visible = Math.ceil(element.clientHeight / ROW_HEIGHT);
        setViewport({
            start,
            end: Math.min(rowCount.current, start + visible + overscan * 2)
        });
    }, []);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        element.addEventListener("scroll", recalculate, { passive: true });
        window.addEventListener("resize", recalculate);
        return () => {
            element.removeEventListener("scroll", recalculate);
            window.removeEventListener("resize", recalculate);
        };
    }, [recalculate]);

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

    const visibleIds = useMemo(() => sorted.map((task) => task.id), [sorted]);
    const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const bulkOptions =
        bulkField === "status"
            ? STATUSES
            : bulkField === "priority"
              ? PRIORITIES
              : bulkField === "area"
                ? AREAS
                : TYPES;
    const rows = sorted.slice(viewport.start, viewport.end);

    function changeSort(nextKey: SortKey) {
        if (sortKey === nextKey)
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        else {
            setSortKey(nextKey);
            setSortDirection(nextKey === "id" ? "desc" : "asc");
        }
    }

    return (
        <main className="explorer">
            <aside className="facets" aria-label="Backlog facets">
                <div className="facet-summary">
                    <strong>{tasks.length.toLocaleString()}</strong>
                    <span>matching cards</span>
                </div>
                <Facet
                    title="Status"
                    values={STATUSES}
                    counts={counts.status}
                    selected={filters.status}
                    onSelect={(status) =>
                        setFilters((current) => ({
                            ...current,
                            status: status as Filters["status"]
                        }))
                    }
                />
                <Facet
                    title="Priority"
                    values={PRIORITIES}
                    counts={counts.priority}
                    selected={filters.priority}
                    onSelect={(priority) =>
                        setFilters((current) => ({
                            ...current,
                            priority: priority as Filters["priority"]
                        }))
                    }
                />
                <Facet
                    title="Type"
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
                <Facet
                    title="Area"
                    values={AREAS}
                    counts={counts.area}
                    selected={filters.area}
                    onSelect={(area) =>
                        setFilters((current) => ({
                            ...current,
                            area: area as Filters["area"]
                        }))
                    }
                />
            </aside>
            <section className="explorer-results">
                {selected.size > 0 && (
                    <div
                        className="bulk-toolbar"
                        role="region"
                        aria-label="Bulk actions"
                    >
                        <strong>{selected.size} selected</strong>
                        <select
                            aria-label="Field to update"
                            value={bulkField}
                            onChange={(event) => {
                                const field = event.target
                                    .value as typeof bulkField;
                                setBulkField(field);
                                setBulkValue(
                                    field === "status"
                                        ? "next"
                                        : field === "priority"
                                          ? "medium"
                                          : field === "area"
                                            ? "api"
                                            : "task"
                                );
                            }}
                        >
                            <option value="status">Status</option>
                            <option value="priority">Priority</option>
                            <option value="area">Area</option>
                            <option value="type">Type</option>
                        </select>
                        <select
                            aria-label="New value"
                            value={bulkValue}
                            onChange={(event) =>
                                setBulkValue(event.target.value)
                            }
                        >
                            {bulkOptions.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        <button
                            className="button button-primary"
                            type="button"
                            onClick={async () => {
                                try {
                                    await onBulkPatch([...selected], {
                                        [bulkField]: bulkValue
                                    } as TaskPatch);
                                    setSelected(new Set());
                                } catch {
                                    // The app-level error banner supplies the recovery path.
                                }
                            }}
                        >
                            Apply
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={() => setSelected(new Set())}
                        >
                            Clear
                        </button>
                    </div>
                )}
                <div className="virtual-table" ref={scrollRef}>
                    <table>
                        <thead>
                            <tr>
                                <th className="selection-cell">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all matching cards"
                                        checked={allVisibleSelected}
                                        onChange={() =>
                                            setSelected((current) => {
                                                const next = new Set(current);
                                                if (allVisibleSelected)
                                                    visibleIds.forEach((id) =>
                                                        next.delete(id)
                                                    );
                                                else
                                                    visibleIds.forEach((id) =>
                                                        next.add(id)
                                                    );
                                                return next;
                                            })
                                        }
                                    />
                                </th>
                                {[
                                    ["id", "ID"],
                                    ["title", "Title"],
                                    ["status", "Status"],
                                    ["priority", "Priority"],
                                    ["type", "Type"],
                                    ["area", "Area"],
                                    ["epic", "Epic"],
                                    ["updated", "Updated"]
                                ].map(([key, label]) => (
                                    <th key={key}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                changeSort(key as SortKey)
                                            }
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
                                <tr className="spacer">
                                    <td
                                        colSpan={9}
                                        style={{
                                            height: viewport.start * ROW_HEIGHT
                                        }}
                                    />
                                </tr>
                            )}
                            {rows.map((task) => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    epicId={epicIds.get(task.id) || ""}
                                    selected={selected.has(task.id)}
                                    onToggle={toggleSelection}
                                    onOpen={onOpen}
                                    onPatch={onPatch}
                                />
                            ))}
                            {viewport.end < sorted.length && (
                                <tr className="spacer">
                                    <td
                                        colSpan={9}
                                        style={{
                                            height:
                                                (sorted.length - viewport.end) *
                                                ROW_HEIGHT
                                        }}
                                    />
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {sorted.length === 0 && (
                        <div className="empty-state">
                            No cards match the active filters.
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
