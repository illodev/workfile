import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { activitySpan, planSpan } from "../ui/src/timeline.ts";

const uiRoot = fileURLToPath(new URL("../ui/src/", import.meta.url));

async function sources(directory = uiRoot, found = []) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = `${directory}${entry.name}`;
        if (entry.isDirectory()) await sources(`${path}/`, found);
        else if (/\.tsx?$/.test(entry.name))
            found.push([path.slice(uiRoot.length), await readFile(path, "utf8")]);
    }
    return found;
}

const files = await sources();

/**
 * `ProjectApi` is `typeof httpApi`, so the typechecker already forces the demo
 * adapter to implement every endpoint the real one gains. What it cannot see is
 * a component that skips the adapter and calls the network itself: in a static
 * build that request 404s, the surrounding catch swallows it, and the feature
 * is silently absent from the demo that exists to show it.
 *
 * Both of the features added for live agent presence did exactly that — the
 * presence strip fetched `/api/v2/activity`, the command palette fetched
 * `/api/v2/search` — and nothing failed, anywhere, to say so.
 */
test("no view reaches the network behind the API adapter", () => {
    const offenders = [];
    for (const [name, source] of files) {
        if (name === "api.http.ts") continue;
        for (const match of source.matchAll(/fetch\(\s*[`"']([^`"']*)/g)) {
            offenders.push(`${name}: fetch("${match[1]}")`);
        }
        // The stream is the one legitimate exception: it is a transport, not an
        // endpoint, and it already opts out of demo builds explicitly.
        if (name !== "store/live.ts" && /new EventSource\(/.test(source)) {
            offenders.push(`${name}: new EventSource(...)`);
        }
    }
    assert.deepEqual(
        offenders,
        [],
        `these bypass \`api\` and will be dead in the static demo:\n  ${offenders.join("\n  ")}`
    );
});

test("the live stream stays disabled in demo builds", async () => {
    const live = await readFile(new URL("../ui/src/store/live.ts", import.meta.url), "utf8");
    assert.match(
        live,
        /VITE_DEMO === "1"\) return;/,
        "a static host has no event stream, and EventSource retries forever"
    );
});

/**
 * The Timeline was empty on the hosted demo for every visitor: the snapshot
 * replays this repository, and not one of its cards has ever carried `start`
 * or `due`. One of ten nav entries opened on an empty state in the shop
 * window, and nothing failed to say so — the view was behaving exactly as
 * written.
 *
 * Asserted against the snapshot rather than the source because that is the
 * thing that ships: `build-demo-data.ts` could stop sending card bodies and
 * every unit test here would still pass.
 */
test("the demo snapshot has a timeline to draw", async () => {
    const snapshot = JSON.parse(
        await readFile(new URL("../ui/src/demo-data.json", import.meta.url), "utf8")
    );
    const drawable = snapshot.tasks.tasks.filter(
        (task) => planSpan(task) || activitySpan(task.body)
    );
    assert.ok(
        drawable.length > 0.5 * snapshot.tasks.tasks.length,
        `only ${drawable.length} of ${snapshot.tasks.tasks.length} demo cards can be placed on the timeline`
    );
});

test("the demo snapshot has a graph to draw", async () => {
    const snapshot = JSON.parse(
        await readFile(new URL("../ui/src/demo-data.json", import.meta.url), "utf8")
    );
    const records = snapshot.graph?.records ?? [];
    assert.ok(records.length > 100, `the snapshot carries ${records.length} graph records`);

    // Edges are the view. A snapshot rebuilt from a workspace whose index lost
    // its relationships would still have every node, and the hosted demo would
    // open the Workflow view on a field of unconnected dots with nothing
    // failing anywhere.
    const edges = records.reduce(
        (total, record) => total + (record.edges?.length ?? 0),
        0
    );
    assert.ok(edges > 100, `only ${edges} edges across ${records.length} records`);

    // And the default filters have to leave something standing. `mention` is
    // off and changes and releases are off, so a snapshot carrying only prose
    // edges between history records would pass the count above and still draw
    // nothing.
    const { filterGraph, DEFAULT_KINDS, DEFAULT_RELATIONS } = await import(
        "../ui/src/workflow.ts"
    );
    const drawn = filterGraph(records, {
        relations: new Set(DEFAULT_RELATIONS),
        kinds: new Set(DEFAULT_KINDS),
        hideIsolated: true
    });
    assert.ok(
        drawn.records.length > 50 && drawn.links.length > 50,
        `the defaults leave ${drawn.records.length} nodes and ${drawn.links.length} edges`
    );
});

// The snapshot is the demo's entire backend. A key the adapter reads but the
// builder never wrote is not a type error — `demo-data.json` is typed by
// assertion — it is `undefined` at runtime, in the browser, for every visitor.
test("the demo snapshot carries every collection the adapter reads", async () => {
    const snapshot = JSON.parse(
        await readFile(new URL("../ui/src/demo-data.json", import.meta.url), "utf8")
    );
    const adapter = await readFile(
        new URL("../ui/src/api.demo.ts", import.meta.url),
        "utf8"
    );
    const read = new Set(
        [...adapter.matchAll(/state\.(\w+)/g)].map((match) => match[1])
    );
    assert.ok(read.size > 4, "expected the adapter to read several collections");
    for (const key of read) {
        assert.ok(
            key in snapshot,
            `api.demo.ts reads state.${key}, which build-demo-data.ts never writes`
        );
    }
});
