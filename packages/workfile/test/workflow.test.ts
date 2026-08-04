import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
    bounds,
    curve,
    DEFAULT_KINDS,
    DEFAULT_RELATIONS,
    filterGraph,
    reconcile,
    RELATIONS,
    MAX_SCALE,
    MIN_SCALE,
    panTo,
    seed,
    step,
    zoomAt,
    type GraphNode,
    type Viewport
} from "../ui/src/workflow.ts";
import { buildProjectIndex, loadWorkspace, projectRecord } from "../dist/src/index.js";

const repository = resolve(
    fileURLToPath(new URL("../../..", import.meta.url))
);

const filters = (over: Record<string, unknown> = {}) => ({
    relations: new Set(DEFAULT_RELATIONS),
    kinds: new Set(DEFAULT_KINDS),
    hideIsolated: true,
    ...over
});

/** The workspace this repository keeps, in the shape the canvas receives. */
async function liveGraph() {
    const workspace = await loadWorkspace({ root: repository });
    const index = await buildProjectIndex(workspace);
    return index.records.map((record) => projectRecord(record, "graph"));
}

test("the filters decide the node set, and an edge survives on any kept relation", () => {
    const records = [
        {
            id: "T-0001",
            kind: "card",
            recordType: "bug",
            title: "First",
            edges: [
                { to: "T-0002", rel: ["origin", "related", "wikilink"] },
                { to: "T-0003", rel: ["mention"] },
                { to: "CHG-0001", rel: ["cards"] }
            ]
        },
        { id: "T-0002", kind: "card", recordType: "task", title: "Second", edges: [] },
        { id: "T-0003", kind: "card", recordType: "task", title: "Third", edges: [] },
        { id: "CHG-0001", kind: "change", recordType: "fixed", title: "Shipped", edges: [] }
    ];

    const standard = filterGraph(records, filters());
    // T-0003 is reachable only through a mention, which is off by default, and
    // CHG-0001 is a kind that is off. Both drop out with the edge that named
    // them — an edge to a node nobody is drawing is a line into empty space.
    assert.deepEqual(
        standard.records.map((record) => record.id),
        ["T-0001", "T-0002"]
    );
    assert.equal(standard.links.length, 1);
    assert.deepEqual(standard.links[0].relations, ["origin", "related", "wikilink"]);
    assert.equal(
        standard.links[0].declared,
        true,
        "an edge with a declared relation among prose ones is a declared edge"
    );

    // Turn every declared relation off and the same pair survives on its
    // wikilink alone — as a prose edge, which is what makes it look different.
    const prose = filterGraph(
        records,
        filters({ relations: new Set(["wikilink"]) })
    );
    assert.equal(prose.links.length, 1);
    assert.equal(prose.links[0].declared, false);

    // `hideIsolated` counts degree over surviving edges, not over the record's
    // own list: with mentions off, T-0003 has no edge left and must not be
    // drawn as a dot connected to nothing.
    const shown = filterGraph(records, filters({ hideIsolated: false }));
    assert.ok(shown.records.some((record) => record.id === "T-0003"));
    assert.equal(shown.degree.get("T-0003") ?? 0, 0);
});

test("a filter change moves the picture instead of replacing it", () => {
    const records = [
        { id: "A", kind: "card", recordType: "task", title: "A", edges: [{ to: "B", rel: ["origin"] }] },
        { id: "B", kind: "card", recordType: "task", title: "B", edges: [] }
    ];
    const graph = filterGraph(records, filters());
    const first = reconcile([], graph.records, graph.degree);
    for (const node of first) {
        node.x += 500;
        node.y -= 250;
    }
    const settled = new Map(first.map((node) => [node.id, { x: node.x, y: node.y }]));

    const again = reconcile(first, graph.records, graph.degree);
    for (const node of again) {
        assert.deepEqual(
            { x: node.x, y: node.y },
            settled.get(node.id),
            `${node.id} was re-seeded instead of held`
        );
    }
    // Velocity is dropped, so a re-heat starts from rest rather than resuming
    // whatever the node was doing when the filter changed.
    assert.ok(again.every((node) => node.vx === 0 && node.vy === 0));
});

test("seeding is deterministic and never stacks two nodes on one point", () => {
    const points = Array.from({ length: 400 }, (_, index) => seed(index, 400));
    const twice = Array.from({ length: 400 }, (_, index) => seed(index, 400));
    assert.deepEqual(points, twice, "the same graph must settle the same way twice");
    const distinct = new Set(points.map(({ x, y }) => `${x.toFixed(4)},${y.toFixed(4)}`));
    assert.equal(distinct.size, points.length);
});

test("two nodes at the same point separate rather than becoming NaN", () => {
    // The failure this guards is total: one Infinity in the force sum
    // propagates to every node through the springs, and the layout never
    // recovers — a blank canvas with no error anywhere.
    const nodes: GraphNode[] = ["A", "B"].map((id) => ({
        id,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        record: { id, kind: "card", recordType: "task", title: id, edges: [] },
        degree: 0
    }));
    for (let tick = 0; tick < 40; tick += 1) step(nodes, [], 1);
    for (const node of nodes) {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.id} left the plane`);
    }
    const dx = nodes[0].x - nodes[1].x;
    const dy = nodes[0].y - nodes[1].y;
    assert.ok(Math.sqrt(dx * dx + dy * dy) > 1, "coincident nodes never separated");
});

test("the layout settles this repository's own graph without hand tuning", async () => {
    const records = await liveGraph();
    assert.ok(records.length > 200, `only ${records.length} records reached the canvas`);

    const graph = filterGraph(records, filters());
    assert.ok(graph.records.length > 100, "the default filters emptied the board");
    assert.ok(graph.links.length > 100, "the default filters emptied the edges");

    let nodes = reconcile([], graph.records, graph.degree);
    let alpha = 1;
    while (alpha > 0.02) {
        step(nodes, graph.links, alpha);
        alpha *= 0.97;
    }

    for (const node of nodes) {
        assert.ok(
            Number.isFinite(node.x) && Number.isFinite(node.y),
            `${node.id} is at ${node.x},${node.y}`
        );
    }

    // Not a blob and not an explosion. Both are what an untuned force layout
    // does when its constants are wrong, and neither throws: the canvas simply
    // shows one dot, or nothing within the viewport.
    const box = bounds(nodes);
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    assert.ok(width > 400 && height > 400, `collapsed to ${Math.round(width)}x${Math.round(height)}`);
    assert.ok(
        width < 200_000 && height < 200_000,
        `flew apart to ${Math.round(width)}x${Math.round(height)}`
    );

    // Nodes have to be individually clickable, so the median nearest-neighbour
    // gap matters more than the extremes.
    const gaps = nodes.map((node) => {
        let nearest = Infinity;
        for (const other of nodes) {
            if (other === node) continue;
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            nearest = Math.min(nearest, dx * dx + dy * dy);
        }
        return Math.sqrt(nearest);
    });
    gaps.sort((left, right) => left - right);
    assert.ok(
        gaps[Math.floor(gaps.length / 2)] > 12,
        `median nearest-neighbour gap is ${gaps[Math.floor(gaps.length / 2)].toFixed(1)}px`
    );
});

test("every relation the index can emit has a filter to turn it off", async () => {
    const records = await liveGraph();
    const emitted = new Set<string>();
    for (const record of records) {
        for (const edge of record.edges) for (const relation of edge.rel) emitted.add(relation);
    }
    const offered = new Set(RELATIONS.map((relation) => relation.id));
    const unfilterable = [...emitted].filter((relation) => !offered.has(relation)).sort();
    assert.deepEqual(
        unfilterable,
        [],
        `these edges are drawn with no way to hide them: ${unfilterable.join(", ")}`
    );
});

test("a curve leaves and arrives where the line would", () => {
    const path = curve(0, 0, 100, 0);
    assert.match(path, /^M 0 0 Q /);
    assert.ok(path.endsWith("100 0"));
    // Bowed, or A→B and B→A land on the same pixels and read as one edge.
    const [, controlY] = /Q (-?[\d.]+) (-?[\d.]+)/.exec(path)!.slice(1).map(Number);
    assert.notEqual(controlY, 0);
});

test("zooming holds the point under the cursor, and stays inside its range", () => {
    // The property that matters is not the scale, it is that the pixel the
    // reader put the cursor on is still under the cursor afterwards. Zooming
    // to the centre instead walks it off screen at the moment they asked for a
    // closer look.
    const before = { x: 137, y: -42, k: 0.8 };
    const [px, py] = [400, 300];
    const graphPoint = (view: Viewport) => ({
        x: (px - view.x) / view.k,
        y: (py - view.y) / view.k
    });
    const anchored = graphPoint(before);
    for (const factor of [1.12, 0.89, 1.12 ** 5, 0.89 ** 5]) {
        const after = zoomAt(before, px, py, factor);
        const moved = graphPoint(after);
        assert.ok(
            Math.abs(moved.x - anchored.x) < 1e-9 &&
                Math.abs(moved.y - anchored.y) < 1e-9,
            `the anchor drifted to ${moved.x},${moved.y} at factor ${factor}`
        );
    }

    // Clamped at both ends, so a fast scroll cannot invert the canvas or
    // shrink it to a point it can never be zoomed back out of.
    let out = { x: 0, y: 0, k: 1 };
    for (let i = 0; i < 200; i += 1) out = zoomAt(out, 0, 0, 0.89);
    assert.equal(out.k, MIN_SCALE);
    let inward = { x: 0, y: 0, k: 1 };
    for (let i = 0; i < 200; i += 1) inward = zoomAt(inward, 0, 0, 1.12);
    assert.equal(inward.k, MAX_SCALE);
});

test("panning translates by the pointer's travel, taking its origin as an argument", () => {
    // `panTo` takes the origin rather than reading it, which is the whole
    // point: the old handler read it off a ref inside the setState updater,
    // React ran that after `pointerup` had nulled the ref, and a single click
    // on the background threw `Cannot read properties of null (reading 'x')`.
    const origin = { x: 100 - 30, y: 200 - 45 };
    assert.deepEqual(panTo(origin, 160, 260), { x: 90, y: 105 });
    // Pure and total: no ref, no event, nothing that can be absent later.
    assert.deepEqual(panTo({ x: 0, y: 0 }, 0, 0), { x: 0, y: 0 });
});
