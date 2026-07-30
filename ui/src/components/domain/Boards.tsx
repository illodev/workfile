import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties
} from "react";

import { ChipSelect } from "../../kit";
import { priorityColor, severityColor, statusColor } from "../../theme";
import type { Status, Task } from "../../types";

const NO_CARDS: Task[] = [];

/** Kept off-screen but announced: keyboard moves have no visual anchor for
 *  someone not looking at the board. */
const VISUALLY_HIDDEN: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0
};

/** Incremental render: mounts `step` cards and grows when the sentinel comes
 *  into view. Card heights vary with the title, so a windowed virtualiser like
 *  the Explorer's would need estimated heights; this needs none. */
function useIncremental<T>(
    items: T[],
    step: number
): [T[], boolean, () => void] {
    const [count, setCount] = useState(step);
    useEffect(() => {
        setCount(step);
    }, [items.length, step]);
    const showMore = useCallback(
        () => setCount((current) => Math.min(current + step, items.length)),
        [items.length, step]
    );
    return [
        count >= items.length ? items : items.slice(0, count),
        count < items.length,
        showMore
    ];
}

function Sentinel({
    onVisible,
    remaining
}: {
    onVisible: () => void;
    remaining: number;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) onVisible();
            },
            { rootMargin: "600px 0px" }
        );
        observer.observe(node);
        return () => observer.disconnect();
        // `remaining` re-observes after each batch: an observer only reports
        // crossings, so a sentinel that stays on screen would never fire again
        // and the column would stall short of filling the viewport.
    }, [onVisible, remaining]);
    return (
        <span
            ref={ref}
            className="mono faint"
            style={{ fontSize: 11, padding: "4px 2px" }}
        >
            +{remaining} more
        </span>
    );
}

// ---------------------------------------------------------------------- Flow

function TaskTile({
    task,
    epicId,
    onOpen,
    onDragStart,
    onCarry,
    carrying
}: {
    task: Task;
    epicId?: string;
    onOpen: (id: string) => void;
    onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
    onCarry?: () => void;
    carrying?: boolean;
}) {
    // The server stamps full ISO timestamps; hand-written cards may carry
    // date-only values. Parse both.
    const claimedAt = task.claimed_at
        ? Date.parse(
              task.claimed_at.includes("T")
                  ? task.claimed_at
                  : `${task.claimed_at}T00:00:00`
          )
        : Number.NaN;
    const claimAge = Number.isNaN(claimedAt)
        ? null
        : Math.max(0, Math.floor((Date.now() - claimedAt) / 86_400_000));
    // Epic, effort and claim age no longer earn tile real estate in the
    // design; the hover title keeps them one pause away.
    const hints = [
        epicId && epicId !== task.id ? `epic ${epicId}` : "",
        task.effort ? `effort ${task.effort}` : "",
        task.claimed_by
            ? `claimed by ${task.claimed_by}${claimAge != null ? ` · ${claimAge}d` : ""}`
            : ""
    ].filter(Boolean);
    return (
        <article
            className={carrying ? "tile is-selected" : "tile"}
            tabIndex={0}
            draggable={Boolean(onDragStart)}
            aria-grabbed={onCarry ? Boolean(carrying) : undefined}
            title={hints.length ? hints.join(" · ") : undefined}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    onOpen(task.id);
                } else if (event.key === " " && onCarry) {
                    // Space picks the card up; Enter still opens it. Two verbs
                    // on one element needs two keys.
                    event.preventDefault();
                    onCarry();
                } else if (event.key === " ") {
                    event.preventDefault();
                    onOpen(task.id);
                }
            }}
            onDragStart={onDragStart}
        >
            <span className="tile-row">
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {task.id}
                </span>
                <span className="spacer" />
                <span
                    className="mono"
                    style={{ fontSize: 10, color: priorityColor(task.priority) }}
                >
                    {task.priority}
                </span>
            </span>
            <span className="tile-title" role="heading" aria-level={3}>
                {task.title}
            </span>
            <span
                className="tile-row mono faint"
                style={{ fontSize: 10, gap: 6 }}
            >
                <span>{task.area}</span>
                <span>·</span>
                <span>{task.type}</span>
                {task.claimed_by ? (
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            marginLeft: "auto",
                            minWidth: 0,
                            color: statusColor("doing")
                        }}
                    >
                        <span
                            className="dot dot-round"
                            style={{ width: 5, height: 5 }}
                            aria-hidden="true"
                        />
                        <span className="truncate" style={{ maxWidth: 90 }}>
                            {task.claimed_by}
                        </span>
                    </span>
                ) : null}
            </span>
            {task.scope?.length ? (
                <span className="tile-note truncate">
                    scope {task.scope.join(" · ")}
                </span>
            ) : null}
        </article>
    );
}

function FlowColumn({
    status,
    cards,
    epicIds,
    onOpen,
    onMove,
    onCarry,
    carryingId,
    isDropTarget,
    onDragEnterColumn,
    onDragLeaveColumn
}: {
    status: Status;
    cards: Task[];
    epicIds: Map<string, string>;
    onOpen: (id: string) => void;
    onMove: (id: string, status: Status) => Promise<void>;
    onCarry?: (task: Task) => void;
    carryingId?: string | null;
    isDropTarget?: boolean;
    onDragEnterColumn?: (status: Status) => void;
    onDragLeaveColumn?: (status: Status) => void;
}) {
    const [shown, hasMore, showMore] = useIncremental(cards, 25);
    const color = statusColor(status);
    return (
        <section
            className="panel"
            aria-label={`${status}, ${cards.length} cards`}
            style={{
                width: 268,
                flex: "0 0 268px",
                borderRadius: "0 0 8px 8px",
                // The drop highlight recolours the panel's own hairline; the
                // status keeps the 2px top edge either way.
                borderColor: isDropTarget ? "var(--accent)" : undefined,
                borderTop: `2px solid ${color}`
            }}
            onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onDragEnterColumn?.(status);
            }}
            onDragLeave={(event) => {
                // dragleave also fires when the pointer crosses from the column
                // into one of its cards, so only a move that actually lands
                // outside the column clears the highlight.
                if (
                    !event.currentTarget.contains(
                        event.relatedTarget as Node | null
                    )
                ) {
                    onDragLeaveColumn?.(status);
                }
            }}
            onDrop={(event) => {
                event.preventDefault();
                onDragLeaveColumn?.(status);
                const id = event.dataTransfer.getData("text/plain");
                if (id) void onMove(id, status).catch(() => undefined);
            }}
        >
            <header className="panel-head">
                <span
                    className="mono"
                    style={{
                        flex: 1,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color
                    }}
                >
                    {status}
                </span>
                <span className="mono faint" style={{ fontSize: 11 }}>
                    {cards.length}
                </span>
            </header>
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 10,
                    overflowY: "auto",
                    background: isDropTarget ? "var(--accent-soft)" : undefined
                }}
            >
                {cards.length === 0 ? (
                    <span
                        className="mono faint"
                        style={{ fontSize: 11, padding: "8px 2px" }}
                    >
                        no cards
                    </span>
                ) : (
                    shown.map((task) => (
                        <TaskTile
                            key={task.id}
                            task={task}
                            epicId={epicIds.get(task.id)}
                            onOpen={onOpen}
                            onCarry={onCarry ? () => onCarry(task) : undefined}
                            carrying={carryingId === task.id}
                            onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(
                                    "text/plain",
                                    task.id
                                );
                            }}
                        />
                    ))
                )}
                {hasMore && (
                    <Sentinel
                        onVisible={showMore}
                        remaining={cards.length - shown.length}
                    />
                )}
            </div>
        </section>
    );
}

export function FlowBoard({
    tasks,
    epicIds,
    showClosed,
    onOpen,
    onMove
}: {
    tasks: Task[];
    epicIds: Map<string, string>;
    showClosed: boolean;
    onOpen: (id: string) => void;
    onMove: (id: string, status: Status) => Promise<void>;
}) {
    // HTML5 drag and drop has no keyboard equivalent, so the board's primary
    // operation could not be performed without a mouse. Space picks a card up,
    // the arrows choose a column, Space drops it, Escape cancels.
    const [carrying, setCarrying] = useState<{
        id: string;
        status: Status;
    } | null>(null);
    // The pointer path needs the same feedback the keyboard path gets: which
    // column is currently under the dragged card.
    const [dragOver, setDragOver] = useState<Status | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const statuses = useMemo<Status[]>(
        () => [
            "backlog",
            "next",
            "doing",
            "review",
            "blocked",
            "deferred",
            ...(showClosed ? (["done", "discarded"] as Status[]) : [])
        ],
        [showClosed]
    );
    // One pass instead of one filter per column, and each column keeps a stable
    // array so a re-render does not restart its incremental render.
    const byStatus = useMemo(() => {
        const result = new Map<Status, Task[]>();
        for (const task of tasks) {
            const column = result.get(task.status);
            if (column) column.push(task);
            else result.set(task.status, [task]);
        }
        return result;
    }, [tasks]);
    const carry = (task: Task) => {
        setCarrying({ id: task.id, status: task.status });
        setAnnouncement(
            `${task.id} picked up from ${task.status}. Use the arrow keys to choose a column, space to drop, escape to cancel.`
        );
    };

    const shift = (direction: 1 | -1) => {
        if (!carrying) return;
        const from = statuses.indexOf(carrying.status);
        const next =
            statuses[
                Math.min(statuses.length - 1, Math.max(0, from + direction))
            ];
        if (!next || next === carrying.status) return;
        setCarrying({ ...carrying, status: next });
        setAnnouncement(`${carrying.id} over ${next}.`);
    };

    const drop = async () => {
        if (!carrying) return;
        const target = carrying;
        setCarrying(null);
        const original = tasks.find((task) => task.id === target.id);
        if (original && original.status !== target.status) {
            await onMove(target.id, target.status);
            setAnnouncement(`${target.id} moved to ${target.status}.`);
        } else {
            setAnnouncement(`${target.id} put back.`);
        }
    };

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                gap: 12,
                padding: 14,
                overflowX: "auto",
                minHeight: 0
            }}
            // dragend bubbles from the card being dragged, so one handler here
            // clears the highlight however the drag ended — dropped, cancelled
            // with Escape, or released outside any column.
            onDragEnd={() => setDragOver(null)}
            onKeyDown={(event) => {
                if (!carrying) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    setCarrying(null);
                    setAnnouncement("Move cancelled.");
                } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    shift(1);
                } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    shift(-1);
                } else if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    void drop();
                }
            }}
        >
            <p style={VISUALLY_HIDDEN} role="status" aria-live="polite">
                {announcement}
            </p>
            {statuses.map((status) => (
                <FlowColumn
                    key={status}
                    status={status}
                    cards={byStatus.get(status) ?? NO_CARDS}
                    epicIds={epicIds}
                    onOpen={onOpen}
                    onMove={onMove}
                    onCarry={carry}
                    carryingId={carrying?.id ?? null}
                    isDropTarget={
                        carrying?.status === status || dragOver === status
                    }
                    onDragEnterColumn={setDragOver}
                    onDragLeaveColumn={(left) =>
                        setDragOver((current) =>
                            current === left ? null : current
                        )
                    }
                />
            ))}
        </div>
    );
}

// --------------------------------------------------------------------- Epics

export function EpicsView({
    tasks,
    allTasks,
    epicIds,
    onOpen
}: {
    tasks: Task[];
    allTasks: Task[];
    epicIds: Map<string, string>;
    onOpen: (id: string) => void;
}) {
    const taskById = useMemo(
        () => new Map(allTasks.map((task) => [task.id, task])),
        [allTasks]
    );
    const groups = useMemo(() => {
        const result = new Map<string, Task[]>();
        for (const task of tasks) {
            const epic = epicIds.get(task.id);
            const key = epic || (task.type === "epic" ? task.id : "__none");
            if (!result.has(key)) result.set(key, []);
            if (task.id !== key) result.get(key)?.push(task);
        }
        return [...result].sort(([left], [right]) => {
            if (left === "__none") return 1;
            if (right === "__none") return -1;
            return left.localeCompare(right, undefined, { numeric: true });
        });
    }, [epicIds, tasks]);

    if (!groups.length)
        return (
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24
                }}
            >
                <span className="mono faint" style={{ fontSize: 11 }}>
                    no epics — no cards match the current filters
                </span>
            </div>
        );

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
                {groups.map(([id, cards]) => {
                    const epic = taskById.get(id);
                    const total = cards.length;
                    // Same closure the old view drew in its badge: done and
                    // discarded both count as finished work.
                    const done = cards.filter(
                        (task) =>
                            task.status === "done" ||
                            task.status === "discarded"
                    ).length;
                    const doing = cards.filter(
                        (task) => task.status === "doing"
                    ).length;
                    const open = total - done - doing;
                    const pct = (part: number) =>
                        total ? `${(part / total) * 100}%` : "0%";
                    const legend = [
                        { label: `${done} done`, color: statusColor("done") },
                        {
                            label: `${doing} doing`,
                            color: statusColor("doing")
                        },
                        { label: `${open} open`, color: "var(--line)" }
                    ];
                    const content = (
                        <>
                            <span className="tile-row" style={{ gap: 10 }}>
                                <span
                                    className="mono dim"
                                    style={{ fontSize: 11 }}
                                >
                                    {id === "__none" ? "—" : id}
                                </span>
                                <span
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 14,
                                        fontWeight: 600,
                                        letterSpacing: "-0.01em",
                                        textWrap: "pretty"
                                    }}
                                >
                                    {epic?.title || "Without epic"}
                                </span>
                                {epic ? (
                                    <span
                                        className="mono"
                                        style={{
                                            fontSize: 11,
                                            color: statusColor(epic.status)
                                        }}
                                    >
                                        {epic.status}
                                    </span>
                                ) : null}
                                <span
                                    className="mono faint"
                                    style={{ fontSize: 11 }}
                                >
                                    {done}/{total}
                                </span>
                            </span>
                            <span className="stack-meter" aria-hidden="true">
                                {total > 0 ? (
                                    <>
                                        <span
                                            style={{
                                                width: pct(done),
                                                background:
                                                    statusColor("done")
                                            }}
                                        />
                                        <span
                                            style={{
                                                width: pct(doing),
                                                background:
                                                    statusColor("doing")
                                            }}
                                        />
                                        <span
                                            style={{
                                                width: pct(open),
                                                background: "var(--line)"
                                            }}
                                        />
                                    </>
                                ) : null}
                            </span>
                            <span
                                className="mono faint"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                    fontSize: 10.5,
                                    flexWrap: "wrap"
                                }}
                            >
                                {legend.map((entry) => (
                                    <span
                                        key={entry.label}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 5
                                        }}
                                    >
                                        <span
                                            className="dot"
                                            style={{ color: entry.color }}
                                            aria-hidden="true"
                                        />
                                        {entry.label}
                                    </span>
                                ))}
                                <span style={{ marginLeft: "auto" }}>
                                    {epic?.area ?? ""}
                                </span>
                            </span>
                        </>
                    );
                    // The "__none" bucket has no record to open, so it stays a
                    // plain surface without the hover affordance.
                    return epic ? (
                        <button
                            key={id}
                            type="button"
                            className="tile"
                            style={{
                                borderRadius: 8,
                                background: "var(--surface)",
                                padding: "13px 14px",
                                gap: 10,
                                width: "100%"
                            }}
                            onClick={() => onOpen(id)}
                        >
                            {content}
                        </button>
                    ) : (
                        <div
                            key={id}
                            style={{
                                border: "1px solid var(--line)",
                                borderRadius: 8,
                                background: "var(--surface)",
                                padding: "13px 14px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 10
                            }}
                        >
                            {content}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ------------------------------------------------------------------ Timeline

const DAY = 86_400_000;
const GANTT_LABEL = 300;
const SCALE_H = 30;

const parseDay = (value: string) => Date.parse(`${value}T00:00:00Z`);

function TimelineRow({
    task,
    epicId,
    pct,
    onOpen
}: {
    task: Task;
    epicId?: string;
    pct: (time: number) => number;
    onOpen: (id: string) => void;
}) {
    // No CSS class carries this hover, so the row tracks it itself.
    const [hover, setHover] = useState(false);
    const start = task.start ? parseDay(task.start) : null;
    const due = task.due ? parseDay(task.due) : null;
    const color = statusColor(task.status);
    return (
        <button
            type="button"
            onClick={() => onOpen(task.id)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            title={`${task.start || "?"} → ${task.due || "?"} · ${task.status}${
                epicId && epicId !== task.id ? ` · epic ${epicId}` : ""
            }`}
            style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: 0,
                border: 0,
                borderBottom: "1px solid var(--line-2)",
                background: hover ? "var(--panel)" : "transparent",
                cursor: "pointer",
                textAlign: "left"
            }}
        >
            <span
                style={{
                    width: GANTT_LABEL,
                    flex: `0 0 ${GANTT_LABEL}px`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 14px",
                    height: "var(--row-h)",
                    borderRight: "1px solid var(--line)",
                    minWidth: 0
                }}
            >
                <span
                    className="mono dim"
                    style={{ fontSize: 11, flex: "0 0 auto", whiteSpace: "nowrap" }}
                >
                    {task.id}
                </span>
                <span
                    className="truncate"
                    style={{ minWidth: 0, fontSize: 12.5 }}
                >
                    {task.title}
                </span>
            </span>
            <span
                style={{
                    flex: 1,
                    position: "relative",
                    height: "var(--row-h)",
                    display: "block"
                }}
            >
                {start != null && due != null ? (
                    <span
                        style={{
                            position: "absolute",
                            top: "50%",
                            transform: "translateY(-50%)",
                            height: 12,
                            minWidth: 6,
                            borderRadius: 3,
                            background: color,
                            display: "block",
                            left: `${pct(start)}%`,
                            width: `${Math.max(pct(due + DAY) - pct(start), 0.8)}%`
                        }}
                    />
                ) : (
                    // A card with only one of the two dates shows as a diamond
                    // at that date rather than a zero-width bar.
                    <span
                        style={{
                            position: "absolute",
                            top: "50%",
                            width: 9,
                            height: 9,
                            transform: "translate(-50%, -50%) rotate(45deg)",
                            borderRadius: 2,
                            background: color,
                            display: "block",
                            left: `${pct((start ?? due)!)}%`
                        }}
                    />
                )}
            </span>
        </button>
    );
}

export function TimelineView({
    tasks,
    epicIds,
    onOpen
}: {
    tasks: Task[];
    epicIds: Map<string, string>;
    onOpen: (id: string) => void;
}) {
    const [groupBy, setGroupBy] = useState<"none" | "epic" | "area">("none");
    const scheduled = useMemo(() => {
        const dated = tasks
            .filter((task) => task.start || task.due)
            .sort((left, right) =>
                String(left.start || left.due).localeCompare(
                    String(right.start || right.due)
                )
            );
        if (groupBy === "none") return dated;
        // Grouping only reorders: every scheduled card stays on the chart, so
        // switching the grouping never hides work.
        const key = (task: Task) =>
            groupBy === "epic"
                ? epicIds.get(task.id) || "ungrouped"
                : task.area || "ungrouped";
        return [...dated].sort(
            (left, right) =>
                key(left).localeCompare(key(right)) ||
                String(left.start || left.due).localeCompare(
                    String(right.start || right.due)
                )
        );
    }, [epicIds, groupBy, tasks]);

    const rowIndex = useMemo(
        () => new Map(scheduled.map((task, index) => [task.id, index])),
        [scheduled]
    );

    /** Dependency edges, drawn from the `depends` field: the one view whose
     *  whole job is showing how work relates over time. */
    const edges = useMemo(() => {
        const found: Array<{ from: string; to: string }> = [];
        for (const task of scheduled) {
            for (const dependency of task.depends || []) {
                if (rowIndex.has(dependency)) {
                    found.push({ from: dependency, to: task.id });
                }
            }
        }
        return found;
    }, [rowIndex, scheduled]);
    const range = useMemo(() => {
        const times = scheduled.flatMap((task) =>
            [task.start, task.due]
                .filter((value): value is string => Boolean(value))
                .map(parseDay)
        );
        if (!times.length) return null;
        // Pad the range to whole months so the scale starts on a gridline.
        const min = new Date(Math.min(...times));
        const max = new Date(Math.max(...times));
        const start = Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1);
        const end = Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1);
        const months: Array<{ key: number; label: string; left: number }> = [];
        const pct = (time: number) => ((time - start) / (end - start)) * 100;
        for (
            let cursor = start;
            cursor < end;
            cursor = Date.UTC(
                new Date(cursor).getUTCFullYear(),
                new Date(cursor).getUTCMonth() + 1,
                1
            )
        ) {
            const date = new Date(cursor);
            months.push({
                key: cursor,
                label: date.toLocaleDateString("en", {
                    month: "short",
                    ...(cursor === start || date.getUTCMonth() === 0
                        ? { year: "numeric" }
                        : {}),
                    timeZone: "UTC"
                }),
                left: pct(cursor)
            });
        }
        const now = Date.now();
        return {
            pct,
            months,
            today: now >= start && now <= end ? pct(now) : null
        };
    }, [scheduled]);

    if (!scheduled.length || !range)
        return (
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24
                }}
            >
                <span className="mono faint" style={{ fontSize: 11 }}>
                    nothing scheduled — add a start or due date to a card
                </span>
            </div>
        );

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0
            }}
        >
            <div
                style={{
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 14px",
                    borderBottom: "1px solid var(--line)",
                    background: "var(--surface)"
                }}
            >
                <span className="mono faint" style={{ fontSize: 11 }}>
                    {scheduled.length} scheduled · {edges.length} dependenc
                    {edges.length === 1 ? "y" : "ies"}
                </span>
                <span className="spacer" />
                <ChipSelect
                    label="group"
                    value={groupBy === "none" ? "" : groupBy}
                    allLabel="none"
                    options={[{ value: "epic" }, { value: "area" }]}
                    onChange={(value) =>
                        setGroupBy(value ? (value as "epic" | "area") : "none")
                    }
                />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <div style={{ position: "relative", minHeight: "100%" }}>
                    <div
                        aria-hidden="true"
                        style={{
                            display: "flex",
                            alignItems: "stretch",
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                            height: SCALE_H,
                            borderBottom: "1px solid var(--line)",
                            background: "var(--surface)"
                        }}
                    >
                        <span
                            className="overline"
                            style={{
                                width: GANTT_LABEL,
                                flex: `0 0 ${GANTT_LABEL}px`,
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRight: "1px solid var(--line)"
                            }}
                        >
                            card
                        </span>
                        <span style={{ flex: 1, position: "relative" }}>
                            {range.months.map((month, monthIndex) => (
                                <span
                                    key={month.key}
                                    className="overline"
                                    style={{
                                        position: "absolute",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        left: `${month.left}%`,
                                        // Clipped at the next month's boundary
                                        // so a long label ("Jan 2026") cannot
                                        // run under its neighbour.
                                        width: `${
                                            (range.months[monthIndex + 1]
                                                ?.left ?? 100) - month.left
                                        }%`,
                                        overflow: "hidden",
                                        paddingLeft: 8,
                                        whiteSpace: "nowrap"
                                    }}
                                >
                                    {month.label}
                                </span>
                            ))}
                        </span>
                    </div>
                    {/* Month gridlines and the today marker span the whole
                        scrollable area, behind the rows. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: SCALE_H,
                            bottom: 0,
                            left: GANTT_LABEL,
                            right: 0,
                            pointerEvents: "none"
                        }}
                    >
                        {range.months.map((month) => (
                            <span
                                key={month.key}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    bottom: 0,
                                    width: 1,
                                    background: "var(--line-2)",
                                    left: `${month.left}%`
                                }}
                            />
                        ))}
                        {range.today != null && (
                            <span
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    bottom: 0,
                                    width: 1,
                                    background: severityColor("error"),
                                    opacity: 0.55,
                                    left: `${range.today}%`
                                }}
                            />
                        )}
                    </div>
                    <div style={{ position: "relative" }}>
                        {edges.length > 0 && (
                            // An overlay rather than per-row elements: an edge
                            // spans rows, so it cannot live inside one. It sits
                            // inside the rows wrapper so its height is exactly
                            // the rows' height and the row-unit viewBox maps
                            // one-to-one at any density.
                            <svg
                                aria-hidden="true"
                                preserveAspectRatio="none"
                                viewBox={`0 0 100 ${scheduled.length}`}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: GANTT_LABEL,
                                    width: `calc(100% - ${GANTT_LABEL}px)`,
                                    height: "100%",
                                    pointerEvents: "none"
                                }}
                            >
                                {edges.map((edge) => {
                                    const from =
                                        scheduled[rowIndex.get(edge.from)!];
                                    const to =
                                        scheduled[rowIndex.get(edge.to)!];
                                    const fromEnd = from.due || from.start;
                                    const toStart = to.start || to.due;
                                    if (!fromEnd || !toStart) return null;
                                    const x1 = range.pct(parseDay(fromEnd));
                                    const x2 = range.pct(parseDay(toStart));
                                    const y1 = rowIndex.get(edge.from)! + 0.5;
                                    const y2 = rowIndex.get(edge.to)! + 0.5;
                                    // A dependency that points backwards in
                                    // time is a scheduling conflict; it draws
                                    // dashed in the error hue.
                                    return (
                                        <path
                                            key={`${edge.from}-${edge.to}`}
                                            d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                                            vectorEffect="non-scaling-stroke"
                                            style={
                                                x2 < x1
                                                    ? {
                                                          fill: "none",
                                                          stroke: severityColor(
                                                              "error"
                                                          ),
                                                          strokeWidth: 1.5,
                                                          strokeDasharray:
                                                              "3 2"
                                                      }
                                                    : {
                                                          fill: "none",
                                                          stroke: "var(--fg-3)",
                                                          strokeWidth: 1.5,
                                                          opacity: 0.4
                                                      }
                                            }
                                        />
                                    );
                                })}
                            </svg>
                        )}
                        {scheduled.map((task) => (
                            <TimelineRow
                                key={task.id}
                                task={task}
                                epicId={epicIds.get(task.id)}
                                pct={range.pct}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
