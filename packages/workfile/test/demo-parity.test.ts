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

/**
 * What a query matches, on both sides of the same question.
 *
 * `api.demo.ts` answered `q` with a case-insensitive `includes` over the raw
 * title, body, path and id, and the palette's lexical branch had a third rule
 * again — id and title only, weighted 100/50/25/10. The server tokenizes: a body
 * matches by whole token and only a title falls back to a substring. So `nvoic`
 * found a body on the hosted demo and nothing against a real workspace, and
 * T-0195 had to write a placeholder that was exactly true of the server and
 * merely understated for the demo (T-0202).
 *
 * The two implementations have to stay separate — the server reaches the
 * filesystem and the demo is a static bundle — so this drives both over one
 * fixture and compares the answers, rather than asserting each against a list of
 * expectations written twice. Ordered, not as sets: the ranking is the same rule
 * as the match, and a record that outranks another on the server must outrank it
 * in the demo.
 */
test("the demo backend and the server agree on what a query matches", async () => {
    const { rankByQuery } = await import("../ui/src/record-search.ts");
    const { searchProjectRecords } = await import(
        "../dist/src/modules/records/public.js"
    );

    // Shaped to separate the rules that differed: a body token that no title
    // carries, a partial word, a metadata-only hit, an id, and an accent.
    const fixture = [
        {
            id: "DOC-0001",
            kind: "doc",
            recordType: "reference",
            title: "Registry listings",
            path: "docs/reference/DOC-0001-registry-listings.md",
            status: "current",
            area: "docs",
            tags: ["registry"],
            body: "Invoicing is documented elsewhere. See the retention policy.",
            updated: "2026-08-05"
        },
        {
            id: "DOC-0002",
            kind: "doc",
            recordType: "guide",
            title: "Invoicing guide",
            path: "docs/guides/DOC-0002-invoicing-guide.md",
            status: "draft",
            area: "billing",
            tags: [],
            body: "How to raise an invoice, and what a rectificativa changes.",
            updated: "2026-08-06"
        },
        {
            id: "CHG-0099",
            kind: "change",
            recordType: "change",
            title: "Retention window widened",
            path: ".project/changelog/unreleased/CHG-0099.md",
            status: "unreleased",
            area: "core",
            visibility: "internal",
            type: "changed",
            tags: ["retention"],
            body: "The window is a year now.",
            updated: "2026-08-07"
        },
        {
            id: "LRN-0007",
            kind: "memory",
            recordType: "learning",
            title: "Acentuación en los índices",
            path: ".project/memory/learnings/LRN-0007.md",
            status: "active",
            area: "search",
            confidence: "high",
            tags: [],
            body: "Un índice construido con acentos no encuentra la consulta sin ellos.",
            updated: "2026-08-04"
        }
    ];

    const queries = [
        "",
        // The whole point: a body token, and a partial of it.
        "invoicing",
        "invoic",
        "nvoic",
        // A title substring, which is the one fallback the server keeps.
        "listing",
        // Metadata only — no title and no body carries these.
        "billing",
        "internal",
        "registry",
        // Identity.
        "DOC-0002",
        "chg-0099",
        // Two terms, which the server ORs rather than requiring as a phrase.
        "invoicing retention",
        "retention window",
        // Accents, folded on both sides.
        "acentuacion",
        "indice",
        "índices",
        // The filter grammar and negation.
        "status:draft",
        "area:docs",
        "tag:retention",
        "-invoicing retention",
        "invoicing -guide",
        // Nothing at all.
        "zzzz",
        // Punctuation the tokenizer drops.
        "rectificativa.",
        "a-year"
    ];

    const disagreements: string[] = [];
    for (const query of queries) {
        // A fresh copy per query: the server caches its tokens on the record
        // object, and a shared fixture would let one query's cache answer the
        // next one's — which would hide exactly the kind of bug this looks for.
        const server = searchProjectRecords(
            structuredClone(fixture),
            query,
            { limit: fixture.length }
        ).records.map((record: { id: string }) => record.id);
        const demo = rankByQuery(structuredClone(fixture), query).map(
            (record) => (record as { id: string }).id
        );
        if (JSON.stringify(server) !== JSON.stringify(demo)) {
            disagreements.push(
                `  ${JSON.stringify(query)}\n` +
                    `      server: ${server.join(", ") || "(none)"}\n` +
                    `      demo:   ${demo.join(", ") || "(none)"}`
            );
        }
    }
    assert.deepEqual(
        disagreements,
        [],
        `the demo backend and the server answer these differently:\n${disagreements.join("\n")}`
    );

    // And the adapter has no matcher of its own left. The three list endpoints
    // and the palette all went through their own rule; a fourth would drift the
    // same way, and this suite would not see it.
    const adapter = await readFile(
        new URL("../ui/src/api.demo.ts", import.meta.url),
        "utf8"
    );
    assert.match(adapter, /import \{ rankByQuery \} from "\.\/record-search"/);
    assert.doesNotMatch(
        adapter,
        /\.toLowerCase\(\)\.includes\(/,
        "api.demo.ts is matching a query by substring again"
    );
});
