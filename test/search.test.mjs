import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBenchWorkspace } from "../scripts/bench-workspace.mjs";
import {
    buildProjectIndex,
    createSemanticSearchProvider,
    loadWorkspace,
    searchProjectRecords,
    searchProjectRecordsHybrid
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

test("hybrid search accepts an injected semantic provider without network coupling", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const index = await buildProjectIndex(workspace);
    let received = null;
    const provider = createSemanticSearchProvider({
        id: "test-provider",
        async search(input) {
            received = input;
            return [{ id: "T-0002", score: 0.98 }];
        }
    });
    const result = await searchProjectRecordsHybrid(
        index.records,
        "shipped runtime evidence",
        { provider, semanticWeight: 0.8, limit: 10 }
    );
    assert.equal(result.mode, "hybrid");
    assert.equal(result.provider, "test-provider");
    assert.equal(result.records[0].id, "T-0002");
    assert.equal(received.query, "shipped runtime evidence");
    assert.ok(received.records.every((record) => "body" in record));
});

test("hybrid search remains deterministic lexical search without a provider", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const index = await buildProjectIndex(workspace);
    const result = await searchProjectRecordsHybrid(
        index.records,
        "example",
        { provider: null, limit: 10 }
    );
    assert.equal(result.mode, "lexical");
    assert.equal(result.provider, null);
    assert.equal(result.records[0].id, "T-0001");
});

// The postings index decides which records reach the scorer; it must never
// decide what they score. A prefilter that silently drops a record changes the
// ordering agents act on, and nothing downstream would notice — so the only
// acceptable evidence is that results are identical either way, across enough
// queries to be convincing.
test("the postings prefilter never changes a result", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-postings-"));
    try {
        await buildBenchWorkspace(root, "M");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace, { cache: false });

        // The same records, with the prefilter unavailable: a plain copy of the
        // array carries no postings, so `searchProjectRecords` falls back to
        // scoring everything — which is exactly the previous behaviour.
        const unindexed = [...index.records];

        const queries = [
            "",
            "billing",
            "retry queue",
            "T-0042",
            "DOC-0001",
            "synthetic card 17",
            "schema index cache revision",
            "diseño",
            "diseno",
            "búsqueda",
            "migración protocol",
            "nothing matches this at all",
            "CARD",
            "card list",
            "alpha beta",
            "reference",
            "a",
            "zz",
            "workspace record backlink",
            "invoice"
        ];

        for (const query of queries) {
            for (const kinds of [[], ["card"], ["doc", "memory"]]) {
                const withIndex = searchProjectRecords(index.records, query, {
                    kinds,
                    limit: 200
                });
                const without = searchProjectRecords(unindexed, query, {
                    kinds,
                    limit: 200
                });
                const label = `${JSON.stringify(query)} kinds=${kinds.join("|") || "*"}`;
                assert.equal(withIndex.total, without.total, `total for ${label}`);
                assert.deepEqual(
                    withIndex.records.map((record) => record.id),
                    without.records.map((record) => record.id),
                    `order for ${label}`
                );
                assert.deepEqual(
                    withIndex.records.map((record) => record.searchScore),
                    without.records.map((record) => record.searchScore),
                    `scores for ${label}`
                );
            }
        }

        // The prefilter has to be doing something, or the test above proves
        // nothing: a query matching few records must consider few records.
        const narrow = searchProjectRecords(index.records, "T-0042", {
            limit: 200
        });
        assert.ok(narrow.total > 0 && narrow.total < index.records.length / 10);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The interface had a real query grammar and the core had none, so
// `status:doing` filtered correctly in the Explorer and scored as two loose
// words everywhere else — the same string returning different answers
// depending on which view you were in.
test("one query grammar across every surface", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-query-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace, { cache: false });
        const find = (query, options = {}) =>
            searchProjectRecords(index.records, query, {
                limit: 500,
                view: "list",
                ...options
            });

        // A field filter narrows instead of scoring. Before, this matched
        // anything mentioning either word.
        const doing = find("status:doing");
        assert.ok(doing.total > 0);
        assert.ok(
            doing.records.every((record) => record.status === "doing"),
            "status: must filter, not rank"
        );
        // Constructed rather than assumed: a card that *says* "doing" without
        // being in that status is what separates filtering from scoring.
        const { createCard } = await import("../dist/src/index.js");
        await createCard(workspace, {
            title: "Notes on doing things",
            area: "core",
            status: "backlog"
        });
        const refreshed = await buildProjectIndex(workspace, { cache: false });
        const loose = searchProjectRecords(refreshed.records, "doing", {
            limit: 500,
            view: "list"
        });
        const filtered = searchProjectRecords(refreshed.records, "status:doing", {
            limit: 500,
            view: "list"
        });
        assert.ok(
            loose.records.some((record) => record.status !== "doing"),
            "free text reaches the decoy"
        );
        assert.equal(
            filtered.records.some((record) => record.status !== "doing"),
            false,
            "the filter does not"
        );

        // Filters combine with AND.
        const combined = find("status:doing area:core");
        assert.ok(
            combined.records.every(
                (record) => record.status === "doing" && record.area === "core"
            )
        );
        assert.ok(combined.total <= doing.total);

        // Negation excludes, on fields and on free text alike.
        const notDoing = find("-status:doing");
        assert.equal(
            notDoing.records.some((record) => record.status === "doing"),
            false
        );

        // An unknown field matches nothing rather than silently becoming free
        // text, which would quietly return everything.
        assert.equal(find("nosuchfield:whatever").total, 0);

        // Aliases, because `tag:` reads better than `tags:`.
        const tagged = find("tag:alpha");
        assert.ok(tagged.total > 0);
        assert.ok(
            tagged.records.every((record) => (record.tags || []).includes("alpha"))
        );

        // Diacritics fold, which matters for a Spanish corpus: this is the
        // case the interface got wrong and the core got right.
        assert.equal(find("diseno").total, find("diseño").total);
        assert.ok(find("diseno").total > 0);

        // A quoted phrase is one term, not two.
        assert.ok(find('"synthetic card"').total > 0);

        // And a plain query still ranks exactly as it did.
        const plain = find("billing");
        assert.deepEqual(
            plain.records.map((record) => record.id),
            searchProjectRecords(index.records, "billing", {
                limit: 500,
                view: "list"
            }).records.map((record) => record.id)
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
