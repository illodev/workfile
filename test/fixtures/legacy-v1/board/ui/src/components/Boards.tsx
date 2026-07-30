import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Status, Task } from "../types";

const NO_CARDS: Task[] = [];

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
    const ref = useRef<HTMLParagraphElement>(null);
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
        <p className="sentinel" ref={ref}>
            {remaining} more…
        </p>
    );
}

function TaskCard({
    task,
    epicId,
    onOpen,
    onDragStart
}: {
    task: Task;
    epicId?: string;
    onOpen: (id: string) => void;
    onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
}) {
    const claimAge = task.claimed_at
        ? Math.max(
              0,
              Math.floor(
                  (Date.now() - Date.parse(`${task.claimed_at}T00:00:00`)) /
                      86_400_000
              )
          )
        : null;
    return (
        <article
            className={`task-card priority-border-${task.priority}`}
            draggable={Boolean(onDragStart)}
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(task.id);
                }
            }}
            onDragStart={onDragStart}
        >
            <div className="task-card-top">
                <span className="mono">{task.id}</span>
                {task.claimed_by && (
                    <span>
                        🔒 {task.claimed_by}
                        {claimAge != null ? ` · ${claimAge}d` : ""}
                    </span>
                )}
            </div>
            <h3>{task.title}</h3>
            <div className="task-card-meta">
                <span>{task.area}</span>
                <span>{task.type}</span>
                {task.effort && <span>{task.effort}</span>}
                {epicId && <span>{epicId}</span>}
            </div>
        </article>
    );
}

const ACTIVE_FLOW: Status[] = ["next", "doing", "review", "blocked"];
const EXECUTION_FLOW: Status[] = ["next", "doing", "review"];

function KanbanColumn({
    status,
    cards,
    epicIds,
    onOpen,
    onMove
}: {
    status: Status;
    cards: Task[];
    epicIds: Map<string, string>;
    onOpen: (id: string) => void;
    onMove: (id: string, status: Status) => Promise<void>;
}) {
    const [shown, hasMore, showMore] = useIncremental(cards, 25);
    return (
        <section
            className="kanban-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");
                if (id) void onMove(id, status).catch(() => undefined);
            }}
        >
            <header>
                <span className={`status-dot status-${status}`} />
                <strong>{status}</strong>
                <span>{cards.length}</span>
            </header>
            <div className="kanban-cards">
                {shown.map((task) => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        epicId={epicIds.get(task.id)}
                        onOpen={onOpen}
                        onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", task.id);
                        }}
                    />
                ))}
                {hasMore && (
                    <Sentinel
                        onVisible={showMore}
                        remaining={cards.length - shown.length}
                    />
                )}
                {cards.length === 0 && <p className="column-empty">No cards</p>}
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
    const [showInventory, setShowInventory] = useState(true);
    const statuses: Status[] = [
        ...(showInventory ? (["backlog"] as Status[]) : []),
        ...EXECUTION_FLOW,
        ...(showClosed ? (["done"] as Status[]) : []),
        "blocked",
        ...(showInventory ? (["deferred"] as Status[]) : []),
        ...(showClosed ? (["discarded"] as Status[]) : [])
    ];
    const activeCount = tasks.filter((task) =>
        ACTIVE_FLOW.includes(task.status)
    ).length;
    // One pass instead of one filter per column, and each column keeps a stable
    // array so toggling the toolbar does not restart its incremental render.
    const byStatus = useMemo(() => {
        const result = new Map<Status, Task[]>();
        for (const task of tasks) {
            const column = result.get(task.status);
            if (column) column.push(task);
            else result.set(task.status, [task]);
        }
        return result;
    }, [tasks]);
    return (
        <main className="flow-view">
            <div className="view-toolbar">
                <div>
                    <strong>Active flow</strong>
                    <span>{activeCount} cards across execution states</span>
                </div>
                <label>
                    <input
                        type="checkbox"
                        checked={showInventory}
                        onChange={(event) =>
                            setShowInventory(event.target.checked)
                        }
                    />
                    Include backlog & deferred
                </label>
            </div>
            <div className="kanban">
                {statuses.map((status) => (
                    <KanbanColumn
                        key={status}
                        status={status}
                        cards={byStatus.get(status) ?? NO_CARDS}
                        epicIds={epicIds}
                        onOpen={onOpen}
                        onMove={onMove}
                    />
                ))}
            </div>
        </main>
    );
}

function EpicCards({
    cards,
    onOpen
}: {
    cards: Task[];
    onOpen: (id: string) => void;
}) {
    const [shown, hasMore, showMore] = useIncremental(cards, 30);
    return (
        <div className="epic-card-grid">
            {shown.map((task) => (
                <TaskCard key={task.id} task={task} onOpen={onOpen} />
            ))}
            {hasMore && (
                <Sentinel
                    onVisible={showMore}
                    remaining={cards.length - shown.length}
                />
            )}
        </div>
    );
}

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
    const [open, setOpen] = useState<Set<string>>(() => new Set());
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

    return (
        <main className="epics-view">
            {groups.map(([id, cards]) => {
                const epic = taskById.get(id);
                const isOpen = open.has(id);
                const closed = cards.filter((task) =>
                    ["done", "discarded"].includes(task.status)
                ).length;
                return (
                    <section className="epic-group" key={id}>
                        <button
                            className="epic-heading"
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() =>
                                setOpen((current) => {
                                    const next = new Set(current);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                })
                            }
                        >
                            <span>{isOpen ? "▾" : "▸"}</span>
                            <span className="mono">
                                {id === "__none" ? "—" : id}
                            </span>
                            <strong>{epic?.title || "Without epic"}</strong>
                            <span>
                                {closed}/{cards.length} closed
                            </span>
                        </button>
                        {isOpen && <EpicCards cards={cards} onOpen={onOpen} />}
                    </section>
                );
            })}
        </main>
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
    const scheduled = tasks
        .filter((task) => task.start || task.due)
        .sort((left, right) =>
            String(left.start || left.due).localeCompare(
                String(right.start || right.due)
            )
        );
    if (!scheduled.length)
        return (
            <main className="empty-state">
                No cards have scheduling dates. Add a start or due date in a
                card.
            </main>
        );
    return (
        <main className="timeline-view">
            <header>
                <span>Card</span>
                <span>Epic</span>
                <span>Start</span>
                <span>Due</span>
            </header>
            {scheduled.map((task) => (
                <button
                    type="button"
                    className="timeline-row"
                    key={task.id}
                    onClick={() => onOpen(task.id)}
                >
                    <span>
                        <span className="mono">{task.id}</span> {task.title}
                    </span>
                    <span>{epicIds.get(task.id) || "—"}</span>
                    <span>{task.start || task.due}</span>
                    <span>{task.due || task.start}</span>
                </button>
            ))}
        </main>
    );
}
