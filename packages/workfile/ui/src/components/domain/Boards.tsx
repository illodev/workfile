import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Accent } from "../Accent";
import { priorityColor, severityColor, statusColor } from "../../theme";
import type { Status, Task } from "../../types";

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
            className="px-0.5 py-1 font-mono text-[11px] text-muted-foreground"
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
            className={cn(
                "flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-background px-3 py-2.5 shadow-xs outline-none transition-[color,border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                carrying && "border-ring ring-2 ring-ring"
            )}
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
            <span className="flex items-center">
                <span className="font-mono text-[11px] text-foreground/70">
                    {task.id}
                </span>
                <span className="flex-1" />
                <span
                    className="font-mono text-[10px] font-medium"
                    style={{ color: priorityColor(task.priority) }}
                >
                    {task.priority}
                </span>
            </span>
            <span
                className="text-[12.5px] leading-snug font-medium"
                role="heading"
                aria-level={3}
            >
                {task.title}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span>{task.area}</span>
                <span>·</span>
                <span>{task.type}</span>
                {task.claimed_by ? (
                    <span
                        className="ml-auto inline-flex min-w-0 items-center gap-[5px]"
                        style={{ color: statusColor("doing") }}
                    >
                        <span
                            className="size-[5px] flex-none rounded-full bg-current"
                            aria-hidden="true"
                        />
                        <span className="max-w-[90px] truncate">
                            {task.claimed_by}
                        </span>
                    </span>
                ) : null}
            </span>
            {Array.isArray(task.scope) && task.scope.length ? (
                <span className="mt-0.5 truncate border-t border-dashed pt-1.5 font-mono text-[10.5px] text-muted-foreground">
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
        <Card
            role="region"
            aria-label={`${status}, ${cards.length} cards`}
            className={cn(
                // The column squared its top corners so the coloured `border-t-2`
                // would not bend into the radius, which left it rounded at one
                // end only. The accent is its own inset bar now, so all four
                // corners come back and the drop highlight is free to own the
                // hairline without competing with the status colour.
                "relative w-[268px] flex-none gap-0 overflow-hidden rounded-lg py-0 shadow-xs",
                isDropTarget && "border-primary"
            )}
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
            <Accent edge="top" color={color} />
            <header className="flex flex-none items-center gap-2 px-3 pb-2.5 pt-4">
                <span
                    className="flex-1 font-mono text-[11px] uppercase tracking-[0.06em]"
                    style={{ color }}
                >
                    {status}
                </span>
                <Badge
                    variant="secondary"
                    className="h-5 rounded-md px-[7px] font-mono text-[11px] font-normal"
                >
                    {cards.length}
                </Badge>
            </header>
            <div
                className={cn(
                    "scroll-fade flex flex-1 flex-col gap-2 overflow-y-auto p-2.5",
                    isDropTarget && "bg-accent/50"
                )}
            >
                {cards.length === 0 ? (
                    <Empty className="flex-1 gap-2 rounded-lg border border-dashed p-4">
                        <EmptyHeader className="gap-1">
                            <EmptyMedia
                                variant="icon"
                                className="mb-0 size-8 [&_svg:not([class*='size-'])]:size-4"
                            >
                                <Inbox aria-hidden="true" />
                            </EmptyMedia>
                            <EmptyTitle className="text-[12.5px] font-medium">
                                No cards
                            </EmptyTitle>
                            <EmptyDescription className="text-[11.5px]">
                                Nothing in this state.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
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
        </Card>
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
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3.5"
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
            {/* Kept off-screen but announced: keyboard moves have no visual
                anchor for someone not looking at the board. */}
            <p className="sr-only" role="status" aria-live="polite">
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
            <Empty className="flex-1 p-6">
                <EmptyHeader>
                    <EmptyTitle className="text-sm">No epics</EmptyTitle>
                    <EmptyDescription className="text-[11.5px]">
                        No cards match the current filters.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );

    return (
        <div className="flex-1 overflow-y-auto p-3.5">
            <div className="flex flex-col gap-2.5">
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
                        {
                            label: `${done} done`,
                            color: statusColor("done") as string | null
                        },
                        {
                            label: `${doing} doing`,
                            color: statusColor("doing") as string | null
                        },
                        // The open swatch reads as the meter's uncovered
                        // track: a muted token, not a status colour.
                        { label: `${open} open`, color: null }
                    ];
                    const content = (
                        <>
                            <span className="flex min-w-0 items-center gap-2.5">
                                <span className="font-mono text-[11.5px] text-foreground/70">
                                    {id === "__none" ? "—" : id}
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-semibold tracking-[-0.01em] text-pretty">
                                    {epic?.title || "Without epic"}
                                </span>
                                {epic ? (
                                    <span
                                        className="font-mono text-[11px]"
                                        style={{
                                            color: statusColor(epic.status)
                                        }}
                                    >
                                        {epic.status}
                                    </span>
                                ) : null}
                                <span className="font-mono text-[11.5px] text-muted-foreground">
                                    {done}/{total}
                                </span>
                            </span>
                            {/* Stacked meter, not shadcn Progress: done and
                                doing segments over a muted track — the bare
                                track is the "open" share. */}
                            <span
                                className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                            >
                                {total > 0 ? (
                                    <>
                                        <span
                                            className="h-full"
                                            style={{
                                                width: pct(done),
                                                background:
                                                    statusColor("done")
                                            }}
                                        />
                                        <span
                                            className="h-full"
                                            style={{
                                                width: pct(doing),
                                                background:
                                                    statusColor("doing")
                                            }}
                                        />
                                    </>
                                ) : null}
                            </span>
                            <span className="flex flex-wrap items-center gap-3.5 font-mono text-[10.5px] text-muted-foreground">
                                {legend.map((entry) => (
                                    <span
                                        key={entry.label}
                                        className="inline-flex items-center gap-[5px]"
                                    >
                                        <span
                                            className={cn(
                                                "size-1.5 rounded-[2px]",
                                                !entry.color &&
                                                    "bg-muted-foreground"
                                            )}
                                            style={
                                                entry.color
                                                    ? {
                                                          background:
                                                              entry.color
                                                      }
                                                    : undefined
                                            }
                                            aria-hidden="true"
                                        />
                                        {entry.label}
                                    </span>
                                ))}
                                <span className="ml-auto">
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
                            className="flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border bg-card px-4 py-3.5 text-left text-card-foreground shadow-xs outline-none transition-[color,border-color,box-shadow] hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            onClick={() => onOpen(id)}
                        >
                            {content}
                        </button>
                    ) : (
                        <Card
                            key={id}
                            className="gap-2.5 rounded-xl px-4 py-3.5 shadow-xs"
                        >
                            {content}
                        </Card>
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
    const start = task.start ? parseDay(task.start) : null;
    const due = task.due ? parseDay(task.due) : null;
    const color = statusColor(task.status);
    return (
        <button
            type="button"
            onClick={() => onOpen(task.id)}
            title={`${task.start || "?"} → ${task.due || "?"} · ${task.status}${
                epicId && epicId !== task.id ? ` · epic ${epicId}` : ""
            }`}
            className="flex w-full cursor-pointer items-center border-b bg-transparent p-0 text-left transition-colors hover:bg-muted"
        >
            <span
                className="flex min-w-0 items-center gap-2 border-r px-3.5"
                style={{
                    width: GANTT_LABEL,
                    flex: `0 0 ${GANTT_LABEL}px`,
                    height: "var(--row-h)"
                }}
            >
                <span className="flex-none whitespace-nowrap font-mono text-[11px] text-foreground/70">
                    {task.id}
                </span>
                <span className="min-w-0 truncate text-[12.5px]">
                    {task.title}
                </span>
            </span>
            <span
                className="relative block flex-1"
                style={{ height: "var(--row-h)" }}
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
                ? epicIds.get(task.id) || "ungrouped"
                : task.area || "ungrouped";
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
            <Empty className="flex-1 p-6">
                <EmptyHeader>
                    <EmptyTitle className="text-sm">
                        Nothing scheduled
                    </EmptyTitle>
                    <EmptyDescription className="text-[11.5px]">
                        Add a start or due date to a card.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-none items-center gap-2.5 border-b bg-card px-3.5 py-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                    {scheduled.length} scheduled · {edges.length} dependenc
                    {edges.length === 1 ? "y" : "ies"}
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="group"
                            className="ml-auto text-[12.5px] font-medium"
                        >
                            group
                            <span className="font-normal text-muted-foreground">
                                {groupBy}
                            </span>
                            <ChevronDown className="size-[13px] text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                            value={groupBy}
                            onValueChange={(value) =>
                                setGroupBy(value as "none" | "epic" | "area")
                            }
                        >
                            <DropdownMenuRadioItem value="none">
                                none
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="epic">
                                epic
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="area">
                                area
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                <div className="relative min-h-full">
                    <div
                        aria-hidden="true"
                        className="sticky top-0 z-[2] flex items-stretch border-b bg-card"
                        style={{ height: SCALE_H }}
                    >
                        <span
                            className="flex items-center border-r px-3.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                            style={{
                                width: GANTT_LABEL,
                                flex: `0 0 ${GANTT_LABEL}px`
                            }}
                        >
                            card
                        </span>
                        <span className="relative flex-1">
                            {range.months.map((month, monthIndex) => (
                                <span
                                    key={month.key}
                                    className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
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
                        className="pointer-events-none absolute"
                        style={{
                            top: SCALE_H,
                            bottom: 0,
                            left: GANTT_LABEL,
                            right: 0
                        }}
                    >
                        {range.months.map((month) => (
                            <span
                                key={month.key}
                                className="absolute inset-y-0 w-px bg-border"
                                style={{ left: `${month.left}%` }}
                            />
                        ))}
                        {range.today != null && (
                            <span
                                className="absolute inset-y-0 w-px"
                                style={{
                                    background: severityColor("error"),
                                    opacity: 0.55,
                                    left: `${range.today}%`
                                }}
                            />
                        )}
                    </div>
                    <div className="relative">
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
                                className="pointer-events-none absolute top-0 h-full"
                                style={{
                                    left: GANTT_LABEL,
                                    width: `calc(100% - ${GANTT_LABEL}px)`
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
                                                          stroke: "var(--muted-foreground)",
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
