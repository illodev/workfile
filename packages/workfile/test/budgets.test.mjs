import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBenchWorkspace } from "../scripts/bench-workspace.mjs";
import {
    INDEX_CACHE_FORMAT,
    buildProjectIndex,
    clearIndexCache,
    createProjectIndexStore,
    exists,
    indexConfigSignature,
    loadCards,
    loadWorkspace,
    searchProjectRecords
} from "../dist/src/index.js";


// Byte budgets, not timings. Times drift with the machine; bytes do not, and
// bytes are exactly what a listing hands an agent — the cost this protocol
// exists to reduce. A regression here is a regression in the product's whole
// reason for being, and the glob regression that shipped unnoticed is the
// argument for gating it rather than trusting review.
//
// Numbers are ceilings measured on the deterministic S workspace. Raise one
// only with a reason written next to it.
// Measured on the S workspace at the time of writing. `search:20` is the loud
// one: twenty results cost ~31 KB because every record still carries its full
// Markdown body and both link arrays. The field projection work lowers it, and
// this ceiling comes down with it.
const BUDGETS = {
    "search:20": 33_000,
    "cards:list": 40_000,
    "index:records": 300_000
};

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

test("read payloads stay within their byte budgets", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-budget-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace);
        const { cards } = await loadCards(workspace);

        const measured = {
            "search:20": bytes(
                searchProjectRecords(index.records, "billing", { limit: 20 })
                    .records
            ),
            "cards:list": bytes(cards.map(({ body, ...rest }) => rest)),
            "index:records": bytes(index.records)
        };

        for (const [label, budget] of Object.entries(BUDGETS)) {
            assert.ok(
                measured[label] <= budget,
                `${label} is ${measured[label].toLocaleString("en-US")} bytes, over its ${budget.toLocaleString("en-US")} budget`
            );
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// An empty query scores nothing, so tokenizing every body to reach that
// conclusion was pure waste — and `doc list` and `memory list` both do it.
test("an empty query does not tokenize record bodies", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-emptyq-"));
    try {
        await buildBenchWorkspace(root, "M");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace);

        const time = (query) => {
            const started = performance.now();
            for (let run = 0; run < 5; run += 1) {
                searchProjectRecords(index.records, query, { limit: 20 });
            }
            return performance.now() - started;
        };

        // Warm the token cache so the comparison is about the empty-query path
        // and not about who ran first.
        time("billing");
        const empty = time("");
        const terms = time("billing retry");

        // Generous on purpose: the assertion is "does not scan every body",
        // which is an order of magnitude, not a percentage.
        assert.ok(
            empty < terms * 2,
            `empty query took ${empty.toFixed(1)}ms against ${terms.toFixed(1)}ms for a real one`
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// Diagnosis walks every local link with a filesystem call. It used to run
// inside every index build, so listings, searches and record reads all paid
// for it. An empty report now says so, rather than reading as a clean bill.
test("diagnosis is opt-in and its absence is visible", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-diag-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });

        const plain = await buildProjectIndex(workspace);
        assert.equal(plain.diagnosed, false);
        assert.equal(plain.reports.docs.diagnosed, false);
        assert.deepEqual(plain.reports.docs.issues, []);

        const diagnosed = await buildProjectIndex(workspace, { diagnose: true });
        assert.equal(diagnosed.diagnosed, true);
        assert.notEqual(diagnosed.reports.docs.diagnosed, false);

        // Records are identical either way: only the reports differ.
        assert.equal(plain.records.length, diagnosed.records.length);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// Every workspace grows a hub: the epic everybody links to. It is also the
// record an agent most needs to read, and it was the one it could not — the
// backlink array was 93% of a ~58 KB payload, and past a certain size the MCP
// tool refused the call outright with "narrow the query", which a get-by-id
// cannot do.
test("a hub record stays readable however many things link to it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-hub-"));
    try {
        await buildBenchWorkspace(root, "M");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace);

        const hub = [...index.records].sort(
            (left, right) => right.incomingTotal - left.incomingTotal
        )[0];

        assert.ok(
            hub.incomingTotal > 100,
            `the fixture should produce a real hub, got ${hub.incomingTotal}`
        );
        assert.equal(hub.incoming.length, 20, "backlinks are capped");
        assert.equal(
            hub.incomingTotal > hub.incoming.length,
            true,
            "the true count stays available"
        );

        const size = Buffer.byteLength(JSON.stringify(hub), "utf8");
        assert.ok(
            size < 6_000,
            `the hub record is ${size.toLocaleString("en-US")} bytes; reading one record must not cost a context window`
        );

        // Explicit edges outrank prose when the list is trimmed: a `parent` or
        // `depends` entry is a real dependency, an ID in a sentence is not.
        const ranks = hub.incoming.map((link) => link.relation);
        assert.ok(
            ranks.indexOf("mention") === -1 ||
                ranks.lastIndexOf("reference") < ranks.indexOf("mention"),
            `explicit relations must come first, got ${ranks.join(",")}`
        );

        // And the two kinds are distinguishable at all, which they were not.
        const relations = new Set(
            index.records.flatMap((record) =>
                record.outgoing.map((link) => link.relation)
            )
        );
        assert.ok(relations.has("reference"), "frontmatter edges");
        assert.ok(relations.has("mention"), "prose mentions");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// Bodies are 64% of a serialized index, and a list of titles does not need
// them. `full` stays the default because three detail panels still read the
// body out of the array that feeds their list.
test("field projection narrows a listing without changing its default", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-view-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace);

        const shapes = Object.fromEntries(
            ["full", "summary", "list"].map((view) => [
                view,
                searchProjectRecords(index.records, "", { limit: 50, view })
            ])
        );

        // Every view returns the same records, only narrower.
        for (const view of ["summary", "list"]) {
            assert.deepEqual(
                shapes[view].records.map((record) => record.id),
                shapes.full.records.map((record) => record.id),
                view
            );
        }

        assert.ok("body" in shapes.full.records[0]);
        assert.equal("body" in shapes.summary.records[0], false);
        assert.equal("body" in shapes.list.records[0], false);

        // The body is replaced by something that answers "is there anything
        // here, and is it worth fetching" without shipping it.
        assert.equal(typeof shapes.summary.records[0].bodyBytes, "number");
        assert.equal(typeof shapes.summary.records[0].excerpt, "string");
        // `list` drops even the excerpt: it renders a row, nothing more.
        assert.equal("excerpt" in shapes.list.records[0], false);

        const size = (view) => bytes(shapes[view].records);
        assert.ok(
            size("summary") < size("full") / 2,
            `summary ${size("summary")} against full ${size("full")}`
        );
        assert.ok(size("list") < size("summary"));

        // An explicit field list wins over the view and returns exactly it.
        const picked = searchProjectRecords(index.records, "", {
            limit: 50,
            fields: ["id", "title", "status"]
        });
        assert.deepEqual(Object.keys(picked.records[0]).sort(), [
            "id",
            "status",
            "title"
        ]);
        assert.ok(bytes(picked.records) < size("list") / 3);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The index cache used to be a one-second TTL, which did two incompatible jobs:
// it was the only thing keeping a rebuild off the hot path, and it was the only
// way a running server noticed a write made by the CLI or MCP in another
// process. Raising it bought speed and lost freshness, which is why it sat at
// one second and satisfied neither.
test("the index revalidates against the filesystem instead of expiring", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-revalidate-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        // revalidateAfterMs: 0 so every call checks, which is what the test is
        // about; the default throttles bursts inside a single turn.
        const store = createProjectIndexStore(workspace, {
            revalidateAfterMs: 0
        });

        const cold = await store.get();
        const warm = await store.get();
        assert.equal(warm, cold, "an unchanged workspace returns the same index");

        // A write from outside the process — git, an editor, another agent — is
        // seen without waiting for any interval to elapse.
        await writeFile(
            join(root, ".project/cards/T-9999-written-elsewhere.md"),
            [
                "---",
                "id: T-9999",
                "title: Written elsewhere",
                "status: backlog",
                "type: task",
                "priority: low",
                "area: core",
                "created: 2026-07-30",
                "updated: 2026-07-30",
                "---",
                "",
                "Body.",
                ""
            ].join("\n")
        );

        const after = await store.get();
        assert.notEqual(after, cold, "an external write must invalidate");
        assert.equal(after.records.length, cold.records.length + 1);
        assert.ok(after.records.some((record) => record.id === "T-9999"));

        // And it settles again.
        assert.equal(await store.get(), after);

        // A build racing an invalidation must not become the cached answer.
        const before = store.epoch;
        const racing = store.get({ fresh: true });
        store.invalidate();
        await racing;
        assert.ok(store.epoch > before);
        const rebuilt = await store.get();
        assert.notEqual(rebuilt, after, "the discarded build must not be cached");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The CLI starts a process per command, so without a persisted index every
// invocation re-reads the whole corpus. The dangerous failure of such a cache
// is not a miss — it is a hit that returns records built by an older
// normalizer, silently and forever, because the files it derives from have not
// changed. Every guard below exists for that.
test("the persisted index is revalidated, versioned and never authoritative", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-index-cache-"));
    const cacheFile = join(root, ".project/.cache/index/index.json");
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });

        const first = await buildProjectIndex(workspace);
        const cached = JSON.parse(await readFile(cacheFile, "utf8"));
        assert.equal(cached.format, INDEX_CACHE_FORMAT);
        assert.equal(cached.configSignature, indexConfigSignature(workspace));
        assert.ok(cached.fingerprint);

        const second = await buildProjectIndex(workspace);
        assert.deepEqual(
            second.records.map((record) => record.id),
            first.records.map((record) => record.id)
        );

        // A stale format must miss rather than deserialize old-shaped records.
        await writeFile(
            cacheFile,
            JSON.stringify({
                ...cached,
                format: INDEX_CACHE_FORMAT - 1,
                index: { ...cached.index, records: [] }
            })
        );
        assert.ok(
            (await buildProjectIndex(workspace)).records.length > 0,
            "an old cache format must be ignored, not trusted"
        );

        // So must a different package version.
        await writeFile(
            cacheFile,
            JSON.stringify({
                ...cached,
                packageVersion: "0.0.0-not-this-one",
                index: { ...cached.index, records: [] }
            })
        );
        assert.ok((await buildProjectIndex(workspace)).records.length > 0);

        // And a fingerprint that no longer matches the corpus.
        await writeFile(
            cacheFile,
            JSON.stringify({
                ...cached,
                fingerprint: "not-the-current-one",
                index: { ...cached.index, records: [] }
            })
        );
        assert.ok((await buildProjectIndex(workspace)).records.length > 0);

        // Corruption is a miss, not a crash.
        await writeFile(cacheFile, "{ this is not json");
        assert.ok((await buildProjectIndex(workspace)).records.length > 0);

        // A diagnosed build is never cached: its reports depend on the
        // filesystem beyond the records themselves.
        await clearIndexCache(workspace);
        await buildProjectIndex(workspace, { diagnose: true });
        assert.equal(await exists(cacheFile), false);

        // And the escape hatch really removes it.
        await buildProjectIndex(workspace);
        assert.equal(await exists(cacheFile), true);
        await clearIndexCache(workspace);
        assert.equal(await exists(cacheFile), false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The config signature is an explicit list, so a field added to the config
// without being considered here would silently keep serving a stale index.
test("changing what the corpus contains invalidates the persisted index", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cache-config-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const signature = indexConfigSignature(workspace);

        for (const mutate of [
            (config) => (config.cards.areas = [...config.cards.areas, "extra"]),
            (config) => (config.docs.sources = ["different/**/*.md"]),
            (config) => (config.memory.collections = ["learnings"]),
            (config) => (config.docs.enabled = false)
        ]) {
            const altered = structuredClone(workspace.config);
            mutate(altered);
            assert.notEqual(
                indexConfigSignature({ ...workspace, config: altered }),
                signature,
                "a change to the corpus definition must change the signature"
            );
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// `[[T-0042]]` is a declared reference; `T-0042` appearing in a sentence is
// not. Treating them alike made 43% of a real workspace's graph edges prose,
// and a consumer following dependencies could not tell which was which.
test("a wiki-link is a declared edge, a bare mention is not", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-wiki-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const { createCard } = await import("../dist/src/index.js");

        await createCard(workspace, {
            title: "Cites two ways",
            area: "core",
            body: [
                "Blocked on [[T-0001]] until it lands.",
                "",
                "T-0002 is mentioned only in passing.",
                "",
                "A labelled one too: [[T-0003|the third card]].",
                "",
                "And itself, [[T-9999]], which must not become a self-edge."
            ].join("\n")
        });

        const index = await buildProjectIndex(workspace, { cache: false });
        const record = index.records.find(
            (entry) => entry.title === "Cites two ways"
        );
        const relationOf = (id) =>
            record.outgoing.find((link) => link.id === id)?.relation;

        assert.equal(relationOf("T-0001"), "reference", "wiki-link");
        assert.equal(relationOf("T-0003"), "reference", "labelled wiki-link");
        assert.equal(relationOf("T-0002"), "mention", "bare id in prose");

        // A record citing itself is not an edge in its own graph.
        assert.equal(
            record.outgoing.some((link) => link.id === record.id),
            false
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
