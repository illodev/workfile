import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { api } from "../../api";
import { recordStatusColor } from "../../theme";
import type { GraphRecord } from "../../types";
import {
    bounds,
    curve,
    DEFAULT_KINDS,
    DEFAULT_RELATIONS,
    filterGraph,
    KINDS,
    reconcile,
    RELATIONS,
    panTo,
    type RecordFilters,
    step,
    type GraphLink,
    zoomAt,
    type GraphNode
} from "../../workflow";

/**
 * Workflow: the record graph as a canvas.
 *
 * The view answers the one question no other view does — *where did this come
 * from* — and it is the only place the typed edges added by T-0154 and T-0159
 * are a shape rather than a list. Flow and Overview answer "what are we
 * working on"; a graph does that worse, and a view trying to do both becomes a
 * hairball answering neither.
 *
 * Everything that can be reasoned about without a DOM is in `workflow.ts`,
 * where it is tested. This file draws.
 */

const STORE = "workfile-workflow-filters";

interface Stored {
    relations: string[];
    kinds: string[];
    hideIsolated: boolean;
}

function readStored(): Stored {
    const fallback: Stored = {
        relations: [...DEFAULT_RELATIONS],
        kinds: [...DEFAULT_KINDS],
        hideIsolated: true
    };
    try {
        const raw = localStorage.getItem(STORE);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<Stored>;
        return {
            relations: Array.isArray(parsed.relations)
                ? parsed.relations
                : fallback.relations,
            kinds: Array.isArray(parsed.kinds) ? parsed.kinds : fallback.kinds,
            hideIsolated:
                typeof parsed.hideIsolated === "boolean"
                    ? parsed.hideIsolated
                    : fallback.hideIsolated
        };
    } catch {
        return fallback;
    }
}

function Toggle({
    on,
    onClick,
    children,
    dashed
}: {
    on: boolean;
    onClick: () => void;
    children: React.ReactNode;
    dashed?: boolean;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                on
                    ? "border-ring bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                dashed && "border-dashed"
            )}
        >
            {children}
        </button>
    );
}

export function WorkflowView({
    selectedId,
    onSelect,
    filters
}: {
    selectedId: string | null;
    /** Sets the app-wide selection, which is what opens the shared drawer. */
    onSelect: (id: string | null) => void;
    /**
     * The shell's filter strip, which this view renders and used to ignore.
     * Composed with the view's own relation and kind toggles rather than
     * replacing them: one says which records, the other which edges.
     */
    filters: RecordFilters;
}) {
    const [records, setRecords] = useState<GraphRecord[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const stored = useRef(readStored());
    const [relations, setRelations] = useState<Set<string>>(
        () => new Set(stored.current.relations)
    );
    const [kinds, setKinds] = useState<Set<string>>(
        () => new Set(stored.current.kinds)
    );
    const [hideIsolated, setHideIsolated] = useState(
        stored.current.hideIsolated
    );
    const [hovered, setHovered] = useState<string | null>(null);
    // Selecting rather than navigating. Routing a click by the shape of its ID
    // would send the reader to Explorer, Docs or Memory, which for a canvas is
    // the opposite of the point: the whole reason to draw the graph was to
    // stop going card by card, and being ejected on every click is going card
    // by card with extra steps. The drawer's own control is what leaves.
    //
    // The drawer itself is the app's, not this view's. Holding a private copy
    // of the selection meant clicking a dot opened a drawer while the app-wide
    // selection never moved — the dot never drew as active and the URL never
    // said what was on screen — and a second drawer stacked over the card
    // inspector whenever both decided to open.
    const openedAt = useRef(0);
    const [view, setView] = useState({ x: 0, y: 0, k: 1 });
    // The simulation mutates node objects in place and the canvas reads them
    // during render. React is told a frame happened, not what changed — 300
    // nodes in state would be 300 objects reallocated sixty times a second.
    const [, setFrame] = useState(0);
    const simulation = useRef<{
        nodes: GraphNode[];
        links: GraphLink[];
        alpha: number;
    }>({
        nodes: [],
        links: [],
        alpha: 0
    });
    const surface = useRef<SVGSVGElement | null>(null);
    /** Set the moment the reader pans or zooms; the auto-framing then stops. */
    const moved = useRef(false);

    useEffect(() => {
        let live = true;
        api.graph()
            .then((response) => {
                if (live) setRecords(response.records);
            })
            .catch((cause: Error) => {
                if (live) setError(cause.message);
            });
        return () => {
            live = false;
        };
    }, []);

    useEffect(() => {
        localStorage.setItem(
            STORE,
            JSON.stringify({
                relations: [...relations],
                kinds: [...kinds],
                hideIsolated
            })
        );
    }, [relations, kinds, hideIsolated]);

    const graph = useMemo(
        () =>
            filterGraph(records ?? [], {
                relations,
                kinds,
                hideIsolated,
                record: filters
            }),
        [records, kinds, relations, hideIsolated, filters]
    );

    /** The shell's axes that are actually set, for the empty state to name. */
    const narrowed = useMemo(
        () =>
            Object.entries(filters)
                .filter(([, value]) => value)
                .map(([axis, value]) => `${axis} ${value}`),
        [filters]
    );

    // Sync the simulation's node set with the filter, keeping the positions of
    // nodes that survived. A filter change should move the picture, not
    // replace it — re-seeding everything makes a toggle feel like a reload.
    useEffect(() => {
        simulation.current.nodes = reconcile(
            simulation.current.nodes,
            graph.records,
            graph.degree
        );
        simulation.current.links = graph.links;
        simulation.current.alpha = 1;
        setFrame((frame) => frame + 1);
    }, [graph]);

    const fit = useCallback(() => {
        const nodes = simulation.current.nodes;
        const element = surface.current;
        if (!nodes.length || !element) return;
        const box = element.getBoundingClientRect();
        const { minX, minY, maxX, maxY } = bounds(nodes);
        const pad = 80;
        const k = Math.min(
            3,
            Math.max(
                0.15,
                Math.min(
                    box.width / (maxX - minX + pad * 2),
                    box.height / (maxY - minY + pad * 2)
                )
            )
        );
        setView({
            k,
            x: box.width / 2 - ((minX + maxX) / 2) * k,
            y: box.height / 2 - ((minY + maxY) / 2) * k
        });
    }, []);

    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const state = simulation.current;
            if (state.alpha > 0.02 && state.nodes.length) {
                step(state.nodes, state.links, state.alpha);
                state.alpha *= 0.97;
                // Keep the camera on the graph while it expands, rather than
                // framing it once at the end. The layout starts as a knot at
                // the origin and the origin is the top-left corner, so a
                // static transform showed the view opening off-centre and
                // then jumping when the fit landed. Following it reads as a
                // camera pulling back, and there is nothing to jump from.
                //
                // Until the reader touches it, at which point the camera is
                // theirs and must stop moving under them.
                if (!moved.current) fit();
                setFrame((frame) => frame + 1);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [fit]);

    const onWheel = (event: React.WheelEvent) => {
        event.preventDefault();
        const box = surface.current?.getBoundingClientRect();
        if (!box) return;
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        moved.current = true;
        const factor = event.deltaY < 0 ? 1.12 : 0.89;
        setView((current) => zoomAt(current, px, py, factor));
    };

    const drag = useRef<{ x: number; y: number } | null>(null);
    const onPointerDown = (event: React.PointerEvent) => {
        moved.current = true;
        drag.current = { x: event.clientX - view.x, y: event.clientY - view.y };
        (event.target as Element).setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: React.PointerEvent) => {
        // Read the ref and the event *here*, not inside the updater.
        //
        // The updater runs when React processes the queue, which is after this
        // handler returns — and `pointerup` lands in between on a plain click,
        // so `drag.current` was already null by the time the old code read
        // `drag.current!.x` and it threw `Cannot read properties of null`. The
        // guard was true at event time and said nothing about update time; the
        // `!` is what let that compile.
        const origin = drag.current;
        if (!origin) return;
        const next = panTo(origin, event.clientX, event.clientY);
        setView((current) => ({ ...current, ...next }));
    };

    const onPointerUp = () => {
        drag.current = null;
    };

    const toggle = (
        set: Set<string>,
        apply: (next: Set<string>) => void,
        id: string
    ) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        apply(next);
    };

    const nodes = simulation.current.nodes;
    const byId = useMemo(
        () => new Map(nodes.map((node) => [node.id, node])),
        // Recomputed on every frame by design: the map holds the same node
        // objects the simulation is mutating, so it stays correct as they move.
        [nodes, view]
    );
    const focus = hovered ?? selectedId;
    // Resolved once. Three `byId.get(focus)!` in the same expression asserted
    // three times over a map that is rebuilt every frame, and the assertion is
    // the same shape as the one that made the drag handler throw.
    const focused = focus ? byId.get(focus) : undefined;
    const adjacent = useMemo(() => {
        if (!focus) return null;
        const set = new Set<string>([focus]);
        for (const link of graph.links) {
            if (link.from === focus) set.add(link.to);
            if (link.to === focus) set.add(link.from);
        }
        return set;
    }, [focus, graph.links]);

    if (error) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                The graph could not be read: {error}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                    {KINDS.map((kind) => (
                        <Toggle
                            key={kind.id}
                            on={kinds.has(kind.id)}
                            onClick={() => toggle(kinds, setKinds, kind.id)}
                        >
                            {kind.label}
                        </Toggle>
                    ))}
                </div>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-1">
                    {RELATIONS.map((relation) => (
                        <Toggle
                            key={relation.id}
                            on={relations.has(relation.id)}
                            dashed={!relation.declared}
                            onClick={() =>
                                toggle(relations, setRelations, relation.id)
                            }
                        >
                            {relation.label}
                        </Toggle>
                    ))}
                </div>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <Toggle
                    on={hideIsolated}
                    onClick={() => setHideIsolated(!hideIsolated)}
                >
                    hide isolated
                </Toggle>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                        {graph.records.length} nodes · {graph.links.length} edges
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => {
                            moved.current = false;
                            fit();
                        }}
                    >
                        <Crosshair aria-hidden="true" className="size-3" />
                        Fit
                    </Button>
                </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
                {!records ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                        />
                        Reading the graph…
                    </div>
                ) : null}
                {/* A canvas drawing nothing looks the same as a canvas that
                    failed, and the reader cannot tell which of the two filter
                    sets emptied it — the shell's strip above or the toggles
                    beside it. So say so, and say which. */}
                {records?.length && !graph.records.length ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-sm text-muted-foreground">
                        {graph.isolated ? (
                            <>
                                <span>
                                    {graph.isolated}{" "}
                                    {graph.isolated === 1
                                        ? "record matches"
                                        : "records match"}
                                    , and{" "}
                                    {graph.isolated === 1 ? "it is" : "none is"}{" "}
                                    connected to anything else here.
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setHideIsolated(false)}
                                >
                                    Show unconnected records
                                </Button>
                            </>
                        ) : (
                            <>
                                <span>No records match these filters.</span>
                                <span className="text-xs">
                                    {narrowed.length
                                        ? `${narrowed.join(", ")} above, and ${kinds.size} of ${KINDS.length} kinds here.`
                                        : `${kinds.size} of ${KINDS.length} kinds and ${relations.size} of ${RELATIONS.length} relationships.`}
                                </span>
                            </>
                        )}
                    </div>
                ) : null}
                <svg
                    ref={surface}
                    role="presentation"
                    className="size-full cursor-grab touch-none active:cursor-grabbing"
                    onWheel={onWheel}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                >
                    <defs>
                        <marker
                            id="workflow-arrow"
                            viewBox="0 0 8 8"
                            refX="7"
                            refY="4"
                            markerWidth="5"
                            markerHeight="5"
                            orient="auto-start-reverse"
                        >
                            <path
                                d="M 0 1 L 7 4 L 0 7 z"
                                className="fill-muted-foreground"
                            />
                        </marker>
                    </defs>
                    <g
                        transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
                    >
                        {graph.links.map((link) => {
                            const a = byId.get(link.from);
                            const b = byId.get(link.to);
                            if (!a || !b) return null;
                            const dim =
                                adjacent &&
                                !(
                                    adjacent.has(link.from) &&
                                    adjacent.has(link.to)
                                );
                            return (
                                <path
                                    key={`${link.from}->${link.to}`}
                                    d={curve(a.x, a.y, b.x, b.y)}
                                    fill="none"
                                    markerEnd="url(#workflow-arrow)"
                                    className={cn(
                                        "stroke-muted-foreground transition-opacity",
                                        dim ? "opacity-10" : "opacity-45"
                                    )}
                                    strokeWidth={1.2 / view.k}
                                    strokeDasharray={
                                        link.declared
                                            ? undefined
                                            : `${4 / view.k} ${3 / view.k}`
                                    }
                                >
                                    <title>
                                        {`${link.from} → ${link.to}: ${link.relations.join(", ")}`}
                                    </title>
                                </path>
                            );
                        })}
                        {nodes.map((node) => {
                            const dim = adjacent && !adjacent.has(node.id);
                            const selected = node.id === selectedId;
                            const radius = Math.min(
                                16,
                                6 + Math.sqrt(node.degree) * 2
                            );
                            return (
                                <g
                                    key={node.id}
                                    transform={`translate(${node.x} ${node.y})`}
                                    className={cn(
                                        "cursor-pointer transition-opacity",
                                        dim && "opacity-20"
                                    )}
                                    onPointerEnter={() => setHovered(node.id)}
                                    onPointerLeave={() => setHovered(null)}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        openedAt.current = performance.now();
                                        onSelect(node.id);
                                    }}
                                >
                                    <circle
                                        r={radius}
                                        style={{
                                            fill: recordStatusColor(
                                                node.record.status || "backlog"
                                            )
                                        }}
                                        className={cn(
                                            selected
                                                ? "stroke-foreground"
                                                : "stroke-background"
                                        )}
                                        strokeWidth={
                                            (selected ? 3 : 1.5) / view.k
                                        }
                                    />
                                    <title>
                                        {`${node.id} — ${node.record.title}`}
                                    </title>
                                    {view.k > 0.55 || selected || dim === false ? (
                                        <text
                                            y={radius + 11 / view.k}
                                            textAnchor="middle"
                                            className="pointer-events-none fill-foreground"
                                            style={{
                                                fontSize: `${11 / view.k}px`
                                            }}
                                        >
                                            {node.id}
                                        </text>
                                    ) : null}
                                </g>
                            );
                        })}
                    </g>
                </svg>
                {focused ? (
                    <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(30rem,70%)] rounded-md border bg-background/95 px-3 py-2 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-medium">
                                {focus}
                            </span>
                            <Badge
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px] font-normal"
                            >
                                {focused.record.recordType}
                            </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                            {focused.record.title}
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
