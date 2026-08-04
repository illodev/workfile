import type { GraphRecord } from "./types.ts";

/**
 * The Workflow view's data and layout, kept out of the component.
 *
 * Same split as `timeline.ts`: what can be reasoned about without a DOM lives
 * here and is tested directly, and the `.tsx` beside it only draws. Under
 * ADR-0010 the layout is ours to maintain rather than a library's, which makes
 * "it is testable" a requirement and not a nicety.
 */

/**
 * Which relationships can be drawn, and how.
 *
 * Ordered as the index ranks them, strongest first — the same order that
 * decides which relationship names an edge when a pair holds several.
 *
 * `declared` is the whole visual distinction. ADR-0005 leaves colour spoken
 * for by status, so a prose edge is a dashed line rather than a different hue,
 * which is also the more honest encoding: an ID in a sentence is a weaker
 * claim than a frontmatter field and should not look equally solid.
 */
export const RELATIONS: ReadonlyArray<{
    id: string;
    label: string;
    declared: boolean;
}> = [
    { id: "parent", label: "parent", declared: true },
    { id: "depends", label: "depends", declared: true },
    { id: "origin", label: "origin", declared: true },
    { id: "supersedes", label: "supersedes", declared: true },
    { id: "superseded_by", label: "superseded by", declared: true },
    { id: "graduated_to", label: "graduated to", declared: true },
    { id: "corrective_actions", label: "corrective", declared: true },
    { id: "cards", label: "cards", declared: true },
    { id: "decisions", label: "decisions", declared: true },
    { id: "fragments", label: "fragments", declared: true },
    { id: "related", label: "related", declared: true },
    { id: "source", label: "source", declared: true },
    { id: "wikilink", label: "wiki link", declared: false },
    { id: "markdown", label: "md link", declared: false },
    { id: "mention", label: "mention", declared: false }
];

export const DECLARED_RELATIONS: ReadonlySet<string> = new Set(
    RELATIONS.filter((relation) => relation.declared).map(
        (relation) => relation.id
    )
);

export const KINDS: ReadonlyArray<{ id: string; label: string }> = [
    { id: "card", label: "Cards" },
    { id: "memory", label: "Memory" },
    { id: "doc", label: "Docs" },
    { id: "change", label: "Changes" },
    { id: "release", label: "Releases" }
];

/**
 * Defaults measured rather than chosen, on T-0155 and T-0156.
 *
 * `mention` is off because prose scanning is 294 of this workspace's 742 edges
 * and turns the SPEC's citation of RFC 2119 into an edge. Changes and releases
 * are off because a release hangs off fifteen to twenty fragments — they take
 * maximum degree from 11 to 25, and they answer "what shipped together", which
 * History and Timeline answer better.
 *
 * Wikilinks are *on*, and that is not a soft call: they carry 154 of the card
 * graph's edges against 45 declared ones. Off, this view opens on a graveyard.
 */
export const DEFAULT_RELATIONS: readonly string[] = RELATIONS.map(
    (relation) => relation.id
).filter((id) => id !== "mention");

export const DEFAULT_KINDS: readonly string[] = ["card", "memory", "doc"];

export interface GraphNode {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    record: GraphRecord;
    degree: number;
}

export interface GraphLink {
    from: string;
    to: string;
    relations: string[];
    declared: boolean;
}

export interface Filters {
    relations: ReadonlySet<string>;
    kinds: ReadonlySet<string>;
    hideIsolated: boolean;
}

/**
 * The records and edges a filter leaves on screen.
 *
 * Degree is counted over the surviving edges rather than the record's own
 * count, because it decides both node size and what `hideIsolated` removes: a
 * card whose only edge was a `mention` is isolated once mentions are off, and
 * saying otherwise would leave a dot connected to nothing.
 */
export function filterGraph(
    records: readonly GraphRecord[],
    filters: Filters
): { records: GraphRecord[]; links: GraphLink[]; degree: Map<string, number> } {
    const visible = records.filter((record) => filters.kinds.has(record.kind));
    const ids = new Set(visible.map((record) => record.id));
    const links: GraphLink[] = [];
    const degree = new Map<string, number>();
    for (const record of visible) {
        for (const edge of record.edges) {
            if (!ids.has(edge.to) || edge.to === record.id) continue;
            const kept = edge.rel.filter((name) => filters.relations.has(name));
            if (!kept.length) continue;
            links.push({
                from: record.id,
                to: edge.to,
                relations: kept,
                // Solid when *any* surviving relationship is declared. A pair
                // that is both `origin` and `wikilink` is a declared edge that
                // also happens to be written about.
                declared: kept.some((name) => DECLARED_RELATIONS.has(name))
            });
            degree.set(record.id, (degree.get(record.id) || 0) + 1);
            degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
        }
    }
    return {
        records: filters.hideIsolated
            ? visible.filter((record) => degree.get(record.id))
            : visible,
        links,
        degree
    };
}

/**
 * A starting position on a phyllotactic spiral rather than at random.
 *
 * The simulation converges from anywhere, but only a deterministic start makes
 * the same graph settle the same way twice — which matters because a reader
 * who toggles a filter and toggles it back expects the picture they had.
 */
export function seed(index: number, count: number): { x: number; y: number } {
    const angle = index * 2.399963;
    const radius = 18 * Math.sqrt(index) + (count > 200 ? 40 : 0);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

const REPULSION = 9000;
const SPRING = 0.012;
const REST = 130;
const CENTRE = 0.0006;
const DAMPING = 0.82;

/**
 * One step of a force-directed layout: repulsion, springs, and a pull home.
 *
 * O(n²) on purpose. The default node set is around 200 records, so a tick is
 * roughly 20,000 pair comparisons — a quadtree would be more code defending
 * against a cost this graph does not have. It runs a step per frame with a
 * decaying alpha, so the canvas stays interactive while it settles and a
 * filter change re-heats the existing positions instead of starting over.
 */
export function step(
    nodes: GraphNode[],
    links: readonly GraphLink[],
    alpha: number
): void {
    for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let squared = dx * dx + dy * dy;
            // Two nodes at the same point have no direction to separate along
            // and the force becomes Infinity, which propagates to NaN and the
            // layout never recovers. Break the tie by index so it breaks the
            // same way on every run.
            if (squared < 1) {
                dx = (i - j) * 0.5;
                dy = 0.5;
                squared = dx * dx + dy * dy;
            }
            const distance = Math.sqrt(squared);
            const force = (REPULSION * alpha) / squared;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const link of links) {
        const a = byId.get(link.from);
        const b = byId.get(link.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (distance - REST) * SPRING * alpha;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
    }
    for (const node of nodes) {
        node.vx -= node.x * CENTRE * alpha;
        node.vy -= node.y * CENTRE * alpha;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
    }
}

/**
 * Build the simulation's node set, keeping the positions of survivors.
 *
 * A filter change should move the picture, not replace it: re-seeding every
 * node makes toggling one relationship feel like a reload.
 */
export function reconcile(
    previous: readonly GraphNode[],
    records: readonly GraphRecord[],
    degree: Map<string, number>
): GraphNode[] {
    const held = new Map(previous.map((node) => [node.id, node]));
    return records.map((record, index) => {
        const existing = held.get(record.id);
        const start = existing ?? seed(index, records.length);
        return {
            id: record.id,
            x: start.x,
            y: start.y,
            vx: 0,
            vy: 0,
            record,
            degree: degree.get(record.id) || 0
        };
    });
}

/**
 * A curve, not a line, and the arc is what makes it readable.
 *
 * Straight edges between force-placed nodes overlap into ambiguity: A→B and
 * B→A land on the same pixels, and an edge passing behind a third node reads
 * as two edges. Offsetting the control point perpendicular to the run
 * separates both, and the offset grows with distance so short edges stay
 * nearly straight while long ones bow out of the way.
 */
export function curve(
    ax: number,
    ay: number,
    bx: number,
    by: number
): string {
    const dx = bx - ax;
    const dy = by - ay;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const bow = Math.min(distance * 0.18, 60);
    const mx = (ax + bx) / 2 - (dy / distance) * bow;
    const my = (ay + by) / 2 + (dx / distance) * bow;
    return `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

export interface Viewport {
    x: number;
    y: number;
    k: number;
}

export const MIN_SCALE = 0.08;
export const MAX_SCALE = 4;

/**
 * Zoom towards a point rather than towards the centre.
 *
 * The pixel under the cursor is the one the reader is asking about, so it has
 * to stay under the cursor: zooming to the centre walks it off screen at
 * exactly the moment they wanted a closer look. Solving for that is what the
 * two subtractions do — the point's position in graph space is held fixed
 * while the scale changes around it.
 */
export function zoomAt(
    view: Viewport,
    px: number,
    py: number,
    factor: number
): Viewport {
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k * factor));
    return {
        k,
        x: px - ((px - view.x) / view.k) * k,
        y: py - ((py - view.y) / view.k) * k
    };
}

/**
 * Where the canvas sits while a drag is in flight.
 *
 * A function rather than three lines inside the handler because of how it
 * failed: the offset used to be read off a ref *inside* the `setState`
 * updater, which React runs after the handler returns — and `pointerup`
 * lands in between on a plain click, so the ref was null by then and the
 * updater threw `Cannot read properties of null`. Taking the origin as an
 * argument means there is no later moment for it to be read at.
 */
export function panTo(
    origin: { x: number; y: number },
    clientX: number,
    clientY: number
): { x: number; y: number } {
    return { x: clientX - origin.x, y: clientY - origin.y };
}

/** The box the settled layout occupies, for the fit-to-screen control. */
export function bounds(nodes: readonly GraphNode[]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
    }
    return { minX, minY, maxX, maxY };
}
