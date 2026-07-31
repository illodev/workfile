import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { api } from "../../api";
import { changeTouches, useWorkspaceChanges } from "../../store/live";
import { priorityColor, severityColor, since, statusColor } from "../../theme";
import type {
    ActivitySnapshot,
    HealthReport,
    HistoryRecord,
    Task,
    View
} from "../../types";

/**
 * The Overview states the workspace instead of describing it.
 *
 * Nine views answer "what is in here"; this one answers "how are we doing",
 * and it is built around the quiet board rather than the busy one. Every
 * number reads an api method the app already calls — no endpoint, no client
 * method and no charting dependency was added for it. Three blocks that would
 * stand permanently empty on a finished project (a claims panel, a status
 * composition meter, a fourteen-day close strip) were cut and fold back in as
 * clauses of the verdict sentence, which is the only block allowed to grow
 * when something is wrong.
 */

/**
 * One machine-written line of a card's `## Activity` section.
 *
 * The section scope and the " · " are both load-bearing: `## Notes` lines
 * carry the same date-and-actor prefix but separate with an em dash, and
 * matching those would pull multi-line prose into the feed.
 */
const ACTIVITY_LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})Z (.+?) · (.+)$/;

interface TrailEvent {
    date: string;
    time: string;
    actor: string;
    text: string;
    card: string;
}

interface TrailRow {
    key: string;
    date: string;
    time: string;
    actor: string;
    text: string;
    cards: string[];
}

function parseTrail(tasks: Task[]): TrailEvent[] {
    const events: TrailEvent[] = [];
    for (const task of tasks) {
        if (!task.body) continue;
        let inActivity = false;
        for (const line of task.body.split("\n")) {
            if (line.startsWith("## ")) {
                inActivity = line.trim() === "## Activity";
                continue;
            }
            if (!inActivity) continue;
            const match = ACTIVITY_LINE.exec(line);
            if (match)
                events.push({
                    date: match[1],
                    time: match[2],
                    actor: match[3],
                    text: match[4],
                    card: task.id
                });
        }
    }
    return events;
}

/**
 * 153 raw events read as noise; the same events grouped by actor and minute
 * read as work. Within a minute a bare `released` is dropped when the same
 * card also transitioned — `transition … done` followed by `release` is one
 * human act — and cards sharing a sentence collapse onto one row, so a burst
 * that closed three cards at 14:53Z is a line rather than six.
 */
function collapseTrail(events: TrailEvent[]): TrailRow[] {
    const minutes = new Map<string, TrailEvent[]>();
    for (const event of events) {
        const key = `${event.actor}|${event.date}|${event.time}`;
        const bucket = minutes.get(key);
        if (bucket) bucket.push(event);
        else minutes.set(key, [event]);
    }
    const rows: TrailRow[] = [];
    for (const bucket of minutes.values()) {
        const kept = bucket.filter(
            (event) =>
                event.text !== "released" ||
                !bucket.some(
                    (other) =>
                        other.card === event.card && other.text !== "released"
                )
        );
        const bySentence = new Map<string, string[]>();
        for (const event of kept) {
            const cards = bySentence.get(event.text);
            if (!cards) bySentence.set(event.text, [event.card]);
            else if (!cards.includes(event.card)) cards.push(event.card);
        }
        for (const [text, cards] of bySentence) {
            const first = kept[0];
            rows.push({
                key: `${first.actor}|${first.date}|${first.time}|${text}`,
                date: first.date,
                time: first.time,
                actor: first.actor,
                text,
                // The server orders cards by its own reading, which put a
                // three-card burst on screen backwards.
                cards: [...cards].sort((left, right) =>
                    left.localeCompare(right)
                )
            });
        }
    }
    // Newest first: the question is what happened while you were away.
    rows.sort((left, right) =>
        `${right.date}${right.time}`.localeCompare(`${left.date}${left.time}`)
    );
    return rows;
}

const STATUS_RANK: Record<string, number> = {
    blocked: 0,
    doing: 1,
    review: 2,
    next: 3,
    backlog: 4,
    deferred: 5
};

const PRIORITY_RANK: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
};

/** The whole backlog fits on screen at this size; past it, Triage owns the list. */
const BACKLOG_SHOWN = 6;
const TRAIL_SHOWN = 6;
const TRAIL_EXPANDED = 24;

function hoursSince(value: string): number | null {
    const stamp = new Date(value).getTime();
    if (Number.isNaN(stamp)) return null;
    return (Date.now() - stamp) / 3_600_000;
}

function formatDay(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        timeZone: "UTC"
    }).format(parsed);
}

interface Verdict {
    /** The sentence, split so the one actionable noun can be a link. */
    lead: string;
    action?: { label: string; go: () => void };
    tail?: string;
    tone: string;
}

export function OverviewView({
    tasks,
    openTasks,
    health,
    activity,
    moduleCounts,
    onOpen,
    onNavigate
}: {
    tasks: Task[];
    openTasks: Task[];
    health: HealthReport | null;
    activity: ActivitySnapshot | null;
    moduleCounts: {
        docs: number | null;
        memory: number | null;
        unreleased: number | null;
    };
    onOpen: (id: string) => void;
    onNavigate: (view: View) => void;
}) {
    const [history, setHistory] = useState<HistoryRecord[] | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // Cards, health and activity arrive as props from the shell, which already
    // reloads them on a change; only the changelog is this view's own read.
    useWorkspaceChanges((change) => {
        if (changeTouches(change, "/changelog/"))
            setReloadKey((key) => key + 1);
    });

    useEffect(() => {
        let active = true;
        void api
            .changelog("")
            .then((result) => {
                if (active) setHistory(result.records);
            })
            .catch(() => {
                // Ambient: the release tile falls back to "no release yet"
                // rather than taking the whole view down with it.
                if (active) setHistory([]);
            });
        return () => {
            active = false;
        };
    }, [reloadKey]);

    const events = useMemo(() => parseTrail(tasks), [tasks]);
    const trail = useMemo(() => collapseTrail(events), [events]);
    const [trailOpen, setTrailOpen] = useState(false);

    const actors = useMemo(
        () => new Set(events.map((event) => event.actor)).size,
        [events]
    );

    /**
     * Newest release, tie-broken by id descending.
     *
     * Sorting on the date alone is not enough and this repository has already
     * paid for learning it (T-0024): 0.1.5, 0.1.6 and 0.1.7 all carry
     * 2026-07-31, so a date-only sort left 0.1.5 on top and the tile announced
     * a version two releases stale.
     */
    const release = useMemo(() => {
        if (!history) return null;
        const releases = history.filter((record) => record.kind === "release");
        if (!releases.length) return null;
        return [...releases].sort((left, right) => {
            const byDate = String(right.date).localeCompare(String(left.date));
            return byDate !== 0 ? byDate : right.id.localeCompare(left.id);
        })[0];
    }, [history]);

    const publicWaiting = useMemo(
        () =>
            (history ?? []).filter(
                (record) =>
                    record.kind === "change" &&
                    !record.released &&
                    record.visibility === "public"
            ).length,
        [history]
    );

    const backlog = useMemo(
        () =>
            [...openTasks].sort((left, right) => {
                const byPriority =
                    (PRIORITY_RANK[left.priority] ?? 9) -
                    (PRIORITY_RANK[right.priority] ?? 9);
                if (byPriority !== 0) return byPriority;
                const byStatus =
                    (STATUS_RANK[left.status] ?? 9) -
                    (STATUS_RANK[right.status] ?? 9);
                return byStatus !== 0
                    ? byStatus
                    : left.id.localeCompare(right.id);
            }),
        [openTasks]
    );

    /**
     * Cards that never appear in the trail and carry no claim have never been
     * picked up by anybody — a fact nothing else in the app shows. Suppressed
     * wholesale when the corpus yields no events at all, or a workspace with
     * the activity trail switched off would libel every card on the board.
     */
    const touched = useMemo(() => {
        const seen = new Set<string>();
        for (const row of trail) for (const card of row.cards) seen.add(card);
        return seen;
    }, [trail]);

    const held = (activity?.claims ?? []).filter((entry) =>
        ["stale", "orphaned"].includes(entry.claim.state)
    );
    const conflicts = activity?.conflicts ?? [];
    const blocked = openTasks.filter((task) => task.status === "blocked");
    const inFlight = openTasks.filter((task) =>
        ["doing", "review"].includes(task.status)
    );

    const newest = trail[0];
    const quiet = newest
        ? hoursSince(`${newest.date}T${newest.time}:00Z`)
        : null;

    /**
     * A strict ladder, worst first, so bad news can never sit below a number.
     * The three panels this view refuses to draw come back here as clauses:
     * a stale hold or a scope collision preempts the headline instead of
     * occupying a box that reads zero on a healthy board.
     */
    const verdict: Verdict = useMemo(() => {
        const errors = health?.counts.error ?? 0;
        if (errors)
            return {
                tone: severityColor("error"),
                lead: "The doctor is failing: ",
                action: {
                    label: `${errors} error${errors === 1 ? "" : "s"}`,
                    go: () => onNavigate("health")
                },
                tail: " must clear before a release can be cut."
            };
        if (held.length) {
            const entry = held[0];
            return {
                tone: statusColor("blocked"),
                lead: "A claim is hanging: ",
                action: { label: entry.id, go: () => onOpen(entry.id) },
                tail: ` has been ${entry.claim.state} for ${since(
                    entry.claim.ageHours
                )} under ${entry.claim.by}.`
            };
        }
        if (conflicts.length) {
            const first = conflicts[0];
            return {
                tone: statusColor("blocked"),
                lead: `${first.cards.length} cards collide on ${first.paths[0]}: `,
                action: {
                    label: first.cards.join(" ↔ "),
                    go: () => onOpen(first.cards[0])
                },
                tail: " share a claimed path."
            };
        }
        if (blocked.length)
            return {
                tone: statusColor("blocked"),
                lead: `${blocked.length} card${
                    blocked.length === 1 ? " is" : "s are"
                } blocked: `,
                action: { label: blocked[0].id, go: () => onOpen(blocked[0].id) },
                tail: blocked.length === 1 ? " is waiting on the outside." : " leads them."
            };
        if (inFlight.length)
            return {
                tone: statusColor("doing"),
                lead: `${inFlight.length} card${
                    inFlight.length === 1 ? " is" : "s are"
                } in flight: `,
                action: {
                    label: inFlight[0].id,
                    go: () => onOpen(inFlight[0].id)
                },
                tail: ` is ${inFlight[0].status}.`
            };
        if (publicWaiting)
            return {
                tone: statusColor("doing"),
                lead: "The board is clean, but ",
                action: {
                    label: `${publicWaiting} public fragment${
                        publicWaiting === 1 ? "" : "s"
                    }`,
                    go: () => onNavigate("history")
                },
                tail: " have not shipped."
            };
        return {
            tone: statusColor("done"),
            lead: `Nothing is in flight. The board is clean${
                release ? ` and ${release.version} is published` : ""
            }.`
        };
    }, [
        blocked,
        conflicts,
        health,
        held,
        inFlight,
        onNavigate,
        onOpen,
        publicWaiting,
        release
    ]);

    const closed = tasks.filter(
        (task) => task.archived || ["done", "discarded"].includes(task.status)
    ).length;
    const issues = health
        ? health.counts.error + health.counts.warning
        : null;

    const tiles = [
        {
            key: "open",
            value: openTasks.length.toLocaleString(),
            unit: "open",
            hint: tasks.length
                ? `${closed} of ${tasks.length} filed are closed`
                : "no cards filed yet",
            color: openTasks.length
                ? statusColor("doing")
                : statusColor("done"),
            go: () => onNavigate("triage")
        },
        {
            key: "issues",
            value: issues == null ? "—" : issues.toLocaleString(),
            unit: "issues",
            hint:
                issues == null
                    ? "the doctor has not reported yet"
                    : issues === 0
                      ? "the doctor does not block a cut"
                      : `${health?.counts.error ?? 0} error${
                            (health?.counts.error ?? 0) === 1 ? "" : "s"
                        } · ${health?.counts.warning ?? 0} warning${
                            (health?.counts.warning ?? 0) === 1 ? "" : "s"
                        }`,
            color:
                issues == null
                    ? statusColor("backlog")
                    : health?.counts.error
                      ? severityColor("error")
                      : health?.counts.warning
                        ? severityColor("warning")
                        : statusColor("done"),
            go: () => onNavigate("health")
        },
        {
            key: "release",
            value: release ? release.version : "—",
            unit: "latest",
            hint: release
                ? `released ${formatDay(String(release.date))}${
                      publicWaiting ? ` · ${publicWaiting} waiting` : " · nothing waiting"
                  }`
                : history
                  ? "no release yet"
                  : "reading the changelog…",
            color: publicWaiting ? statusColor("doing") : statusColor("done"),
            go: () => onNavigate("history")
        }
    ];

    const shownTrail = trail.slice(0, trailOpen ? TRAIL_EXPANDED : TRAIL_SHOWN);
    // How far the hidden tail actually reaches — the oldest row, not the next
    // one, which claimed "back to 31 Jul" over a tail running to 30 Jul.
    const olderDay = trail.length ? trail[trail.length - 1].date : undefined;
    const olderCount = trail.length - shownTrail.length;
    const shownBacklog = backlog.slice(0, BACKLOG_SHOWN);

    return (
        <div className="flex-1 overflow-y-auto p-3.5">
            <div className="flex flex-col gap-1 px-0.5 pt-1 pb-4">
                <p className="text-[17px] font-medium tracking-tight">
                    <span style={{ color: verdict.tone }}>{verdict.lead}</span>
                    {verdict.action ? (
                        <button
                            type="button"
                            className="underline underline-offset-4 hover:no-underline"
                            style={{ color: verdict.tone }}
                            onClick={verdict.action.go}
                        >
                            {verdict.action.label}
                        </button>
                    ) : null}
                    {verdict.tail ? (
                        <span className="text-muted-foreground">
                            {verdict.tail}
                        </span>
                    ) : null}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                    {newest ? (
                        <>
                            quiet {since(quiet)} · last move{" "}
                            <button
                                type="button"
                                className="underline underline-offset-4 hover:no-underline"
                                onClick={() => onOpen(newest.cards[0])}
                            >
                                {newest.cards[0]}
                            </button>{" "}
                            {newest.text} · {formatDay(newest.date)}{" "}
                            {newest.time}Z
                        </>
                    ) : (
                        "no card has moved yet"
                    )}
                </p>
            </div>

            <div className="flex gap-2.5">
                {tiles.map((tile) => (
                    <Card
                        key={tile.key}
                        className="flex-1 gap-0 border-l-2 p-0"
                        style={{ borderLeftColor: tile.color }}
                    >
                        <button
                            type="button"
                            onClick={tile.go}
                            className="flex w-full flex-col items-start gap-1 rounded-[inherit] px-3.5 py-3 text-left hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                            <span className="flex items-baseline gap-2">
                                <span
                                    className="text-[26px] font-semibold tracking-tight"
                                    style={{ color: tile.color }}
                                >
                                    {tile.value}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {tile.unit}
                                </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {tile.hint}
                            </span>
                        </button>
                    </Card>
                ))}
            </div>

            <Rule
                label="what is left"
                note={
                    backlog.length
                        ? `${backlog.length} open${
                              backlog.every((task) => task.priority === "low")
                                  ? ", all low priority"
                                  : ""
                          }`
                        : "nothing open"
                }
            />

            {backlog.length ? (
                <div className="flex flex-col">
                    {shownBacklog.map((task) => (
                        <button
                            key={task.id}
                            type="button"
                            onClick={() => onOpen(task.id)}
                            className="flex min-h-[var(--row-h)] items-center gap-2.5 rounded-sm px-1.5 text-left hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                            <span
                                aria-hidden="true"
                                className="size-[7px] shrink-0 rounded-full bg-current"
                                style={{ color: priorityColor(task.priority) }}
                            />
                            <span className="w-[62px] shrink-0 font-mono text-[11px]">
                                {task.id}
                            </span>
                            <span className="flex-1 truncate text-[12.5px]">
                                {task.title}
                            </span>
                            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
                                {task.priority} · {task.area} · {task.type} ·{" "}
                                {task.status}
                                {trail.length && !touched.has(task.id)
                                    ? " · never claimed"
                                    : ""}
                            </span>
                        </button>
                    ))}
                    {backlog.length > shownBacklog.length ? (
                        <button
                            type="button"
                            onClick={() => onNavigate("triage")}
                            className="px-1.5 py-2 text-left font-mono text-[10.5px] text-muted-foreground hover:underline"
                        >
                            +{backlog.length - shownBacklog.length} more in
                            Triage →
                        </button>
                    ) : null}
                </div>
            ) : (
                <p className="px-1.5 py-3 font-mono text-[11px] text-muted-foreground">
                    nothing open · workfile card create --title "…"
                </p>
            )}

            <Rule
                label="the trail"
                note={
                    trail.length
                        ? `${events.length.toLocaleString()} events · ${actors} actor${
                              actors === 1 ? "" : "s"
                          } · ${trail.length} moves since ${formatDay(
                              trail[trail.length - 1].date
                          )}`
                        : "no activity recorded"
                }
            />

            {trail.length ? (
                <div className="flex flex-col">
                    {shownTrail.map((row, index) => (
                        <div
                            key={row.key}
                            className="flex min-h-[var(--row-h)] items-center gap-2.5 px-1.5"
                        >
                            {/* The day is stated only when it changes. Without
                                it a feed spanning days reads as though it were
                                unsorted — 09:41, 09:32, 10:39 — because the
                                hour alone cannot say which day it belongs to. */}
                            <span className="w-[44px] shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
                                {index === 0 ||
                                shownTrail[index - 1].date !== row.date
                                    ? formatDay(row.date)
                                    : ""}
                            </span>
                            <span className="w-[52px] shrink-0 font-mono text-[11px] text-muted-foreground">
                                {row.time}Z
                            </span>
                            <span
                                className="w-[178px] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground/70"
                                title={row.actor}
                            >
                                {row.actor}
                            </span>
                            {/* Fixed width so the sentence column lines up:
                                a three-card burst must not push its own verb
                                out past the single-card rows above it. */}
                            <span className="flex w-[186px] shrink-0 gap-1.5">
                                {row.cards.slice(0, 3).map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onOpen(id)}
                                        className="font-mono text-[11px] hover:underline"
                                    >
                                        {id}
                                    </button>
                                ))}
                                {row.cards.length > 3 ? (
                                    <span className="font-mono text-[11px] text-muted-foreground/70">
                                        +{row.cards.length - 3}
                                    </span>
                                ) : null}
                            </span>
                            <span className="flex-1 truncate text-[12.5px] text-muted-foreground">
                                {row.text}
                            </span>
                        </div>
                    ))}
                    {olderCount > 0 ? (
                        <button
                            type="button"
                            onClick={() => setTrailOpen(true)}
                            className={cn(
                                "flex items-center gap-2.5 px-1.5 py-2 text-left font-mono text-[10.5px] text-muted-foreground",
                                "hover:text-foreground"
                            )}
                        >
                            <span className="h-px flex-1 bg-border" />
                            {olderCount.toLocaleString()} older move
                            {olderCount === 1 ? "" : "s"}
                            {olderDay ? `, back to ${formatDay(olderDay)}` : ""}{" "}
                            →
                        </button>
                    ) : null}
                </div>
            ) : (
                <p className="px-1.5 py-3 font-mono text-[11px] text-muted-foreground">
                    no card has moved yet
                </p>
            )}

            <div className="flex items-center gap-2.5 px-0.5 pt-5 pb-1">
                <span className="font-mono text-[11px] text-muted-foreground">
                    {tasks.length.toLocaleString()} cards
                    {moduleCounts.docs == null
                        ? ""
                        : ` · ${moduleCounts.docs.toLocaleString()} docs`}
                    {moduleCounts.memory == null
                        ? ""
                        : ` · ${moduleCounts.memory.toLocaleString()} memory`}
                    {history
                        ? ` · ${history.length.toLocaleString()} history records`
                        : ""}
                </span>
                <span className="flex-1" />
                <span className="font-mono text-[10.5px] text-muted-foreground/70">
                    {health
                        ? `checked ${new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short"
                          }).format(new Date(health.generatedAt))}`
                        : "workfile doctor --json"}
                </span>
            </div>
        </div>
    );
}

/** The section rule the two lists share: a label, a hairline, an honest note. */
function Rule({ label, note }: { label: string; note: string }) {
    return (
        <div className="flex items-center gap-2.5 px-0.5 pt-5 pb-1">
            <span className="font-mono text-[11px] tracking-wide uppercase">
                {label}
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10.5px] text-muted-foreground/70">
                {note}
            </span>
        </div>
    );
}
