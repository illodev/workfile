import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBenchWorkspace } from "../scripts/bench-workspace.ts";
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

// The provider cap used to slice(0, N) the corpus in index order, so a record
// beyond position N was invisible to the semantic layer no matter how relevant
// — on a real ~3,800-record workspace, 87% of the corpus. Candidates must be
// chosen by lexical relevance first, index order only as filler.
test("the provider cap keeps lexically relevant records, wherever they live", async () => {
    const records = [];
    for (let i = 0; i < 60; i += 1) {
        records.push({
            id: `T-${String(i).padStart(4, "0")}`,
            kind: "card",
            recordType: "card",
            title: `Filler record number ${i}`,
            path: `cards/filler-${i}.md`,
            body: "Nothing relevant here.",
            tags: []
        });
    }
    // The only record matching the query sits far beyond the cap.
    records[55].title = "Verifactu hash chain tiebreaker";
    records[55].body = "Two registrations in the same second share a hash.";

    let received = null;
    const provider = createSemanticSearchProvider({
        id: "cap-probe",
        async search(input) {
            received = input;
            return [];
        }
    });
    await searchProjectRecordsHybrid(records, "verifactu hash", {
        provider,
        maxProviderRecords: 10,
        limit: 5
    });
    assert.equal(received.records.length, 10, "the cap itself still holds");
    assert.ok(
        received.records.some((record) => record.id === "T-0055"),
        "the lexical hit beyond the cap reaches the provider"
    );
    // And with room to spare, everything goes.
    await searchProjectRecordsHybrid(records, "verifactu hash", {
        provider,
        maxProviderRecords: 100,
        limit: 5
    });
    assert.equal(received.records.length, 60);
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

function regexFixtureRecords() {
    const records: any[] = [];
    records.push(
        {
            id: "T-0001",
            kind: "card",
            recordType: "card",
            title: "Retry the billing queue",
            path: "cards/retry.md",
            body: "The worker path is jobs/billing/retry.\nTimeouts happen.",
            tags: []
        },
        {
            id: "DOC-0001",
            kind: "doc",
            recordType: "doc",
            title: "Needle taxonomy",
            path: "docs/needle.md",
            body: "One needle here.",
            tags: []
        },
        {
            id: "T-0002",
            kind: "card",
            recordType: "card",
            title: "Unrelated cleanup",
            path: "cards/cleanup.md",
            body: "needle needle needle needle in the body only",
            tags: []
        }
    );
    return records;
}

// `/pattern/flags` is exact-intent: only the full form — both delimiters, a
// non-empty pattern, flags from [imsu] — switches modes. A slash inside a
// plain query, a missing delimiter or an unknown flag stays lexical.
test("only the full /pattern/flags form triggers regex mode", async () => {
    const records = regexFixtureRecords();
    for (const query of ["jobs/billing/retry", "/needle", "needle/", "/needle/x", "//"]) {
        const result = await searchProjectRecordsHybrid(records, query, {});
        assert.equal(result.mode, "lexical", `${JSON.stringify(query)} stays lexical`);
    }
    const result = await searchProjectRecordsHybrid(records, "/NEEDLE/i", {});
    assert.equal(result.mode, "regex");
    assert.equal(result.provider, null);
    assert.ok(result.records.length > 0);
    assert.ok(result.records.every((record) => Number(record.searchScore) > 0));
});

test("an invalid regex pattern is refused with SEARCH_REGEX_INVALID", async () => {
    const records = regexFixtureRecords();
    await assert.rejects(
        () => searchProjectRecordsHybrid(records, "/(unclosed/", {}),
        { code: "SEARCH_REGEX_INVALID" }
    );
    // The length cap is part of the same contract.
    await assert.rejects(
        () => searchProjectRecordsHybrid(records, `/${"a".repeat(300)}/`, {}),
        { code: "SEARCH_REGEX_INVALID" }
    );
});

test("regex ranking puts a title hit above any number of body hits", async () => {
    const records = regexFixtureRecords();
    const result = await searchProjectRecordsHybrid(records, "/needle/i", {
        view: "summary"
    });
    // DOC-0001 matches once in the title; T-0002 four times in the body only.
    assert.deepEqual(
        result.records.map((record) => record.id),
        ["DOC-0001", "T-0002"]
    );
    // The excerpt is the matched line, not the head of the body.
    assert.equal(
        result.records[1].excerpt,
        "needle needle needle needle in the body only"
    );
});

test("regex scanning stops at the first 20000 body characters", async () => {
    const records = regexFixtureRecords();
    records[2].body = `${"x".repeat(20_000)} needle`;
    const result = await searchProjectRecordsHybrid(records, "/needle/", {});
    // T-0002's only occurrence now sits beyond the cap; DOC-0001 remains.
    assert.deepEqual(
        result.records.map((record) => record.id),
        ["DOC-0001"]
    );
});

/**
 * The guard the three caps could not be.
 *
 * A pattern cap of 256, an `imsu` flag allowlist and a 20,000-character body
 * cap all bound the *input*, and none of them bounds backtracking. `/(a+)+$/`
 * is six characters and passes every one: 232ms against a 24-character body,
 * 3.7s against 28, 57s against 32 — two more characters is four times the
 * work, and against the cap it does not finish ([[T-0190]]).
 *
 * 400 characters is chosen to be hopeless rather than merely slow. If the
 * deadline ever stops working this test does not get slower, it stops
 * terminating, which is the failure mode worth having: a wrong answer here
 * would be indistinguishable from a fast machine.
 */
test("a pattern that cannot finish is stopped rather than waited for", async () => {
    const records = regexFixtureRecords();
    records[2].body = `${"a".repeat(400)}!`;

    const started = process.hrtime.bigint();
    await assert.rejects(
        () => searchProjectRecordsHybrid(records, "/(a+)+$/", {}),
        { code: "SEARCH_REGEX_TIMEOUT" }
    );
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    // The deadline is 2s; anything under 10 proves it was the deadline that
    // ended this and not the pattern finishing on its own.
    assert.ok(ms < 10_000, `the scan ran for ${ms.toFixed(0)}ms`);
});

// The ordinary path still crosses a thread boundary, so the envelope is worth
// asserting after it: paging pages, `view` projects, `fields` overrides.
test("regex mode reuses the lexical result envelope", async () => {
    const records = regexFixtureRecords();
    const paged = await searchProjectRecordsHybrid(records, "/needle/i", {
        limit: 1,
        offset: 1
    });
    assert.equal(paged.total, 2);
    assert.equal(paged.offset, 1);
    assert.deepEqual(paged.records.map((record) => record.id), ["T-0002"]);
    const listed = await searchProjectRecordsHybrid(records, "/needle/i", {
        view: "list"
    });
    assert.equal(listed.records[0].excerpt, undefined);
    assert.equal(typeof listed.records[0].bodyBytes, "number");
    const fielded = await searchProjectRecordsHybrid(records, "/needle/i", {
        fields: ["id", "title"]
    });
    assert.deepEqual(Object.keys(fielded.records[0]), ["id", "title"]);
});

test("every path reports its mode: lexical, hybrid and regex", async () => {
    const records = regexFixtureRecords();
    const provider = createSemanticSearchProvider({
        id: "mode-probe",
        async search() {
            return [{ id: "T-0001", score: 0.9 }];
        }
    });
    const lexical = await searchProjectRecordsHybrid(records, "needle", {});
    assert.equal(lexical.mode, "lexical");
    assert.equal(lexical.provider, null);
    const hybrid = await searchProjectRecordsHybrid(records, "needle", { provider });
    assert.equal(hybrid.mode, "hybrid");
    assert.equal(hybrid.provider, "mode-probe");
    // The provider is deliberately bypassed for exact-intent queries.
    const regex = await searchProjectRecordsHybrid(records, "/needle/", { provider });
    assert.equal(regex.mode, "regex");
    assert.equal(regex.provider, null);
});
