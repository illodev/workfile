import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { localSearchIntegration } from "../index.js";
import {
    defineProjectIntegration,
    searchProjectRecordsHybrid
} from "../../workfile/dist/src/index.js";

/**
 * Deterministic stand-in for the model: axis 0 is "fruit", axis 1 is
 * everything else. Counts invocations so the cache tests can prove what was
 * and was not re-embedded.
 */
function fakeEmbedder() {
    const calls = [];
    const embed = async (texts) => {
        calls.push(texts);
        return texts.map((text) =>
            /apple|fruit/i.test(text) ? [1, 0] : [0, 1]
        );
    };
    embed.calls = calls;
    return embed;
}

const RECORDS = [
    { id: "T-0001", title: "Apple pie recipe", body: "Bake with fruit." },
    { id: "T-0002", title: "Kernel scheduler", body: "CPU internals." }
];

test("ranks by embedding similarity and spreads scores over the candidates", async () => {
    const embed = fakeEmbedder();
    const integration = localSearchIntegration({
        embedder: embed,
        cacheDir: null
    });
    const result = await integration.semanticSearchProvider.search({
        query: "fruit desserts",
        records: RECORDS
    });
    assert.deepEqual(result, [
        { id: "T-0001", score: 1 },
        { id: "T-0002", score: 0 }
    ]);
    // One passage batch, one query batch.
    assert.equal(embed.calls.length, 2);
});

test("embeds each passage once in memory and once across instances via disk", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "workfile-embeddings-"));
    try {
        const first = fakeEmbedder();
        const integration = localSearchIntegration({
            embedder: first,
            cacheDir
        });
        await integration.semanticSearchProvider.search({
            query: "fruit",
            records: RECORDS
        });
        await integration.semanticSearchProvider.search({
            query: "cpu",
            records: RECORDS
        });
        // Passages batch + two query batches: the second search embeds only
        // its query.
        assert.equal(first.calls.length, 3);
        assert.deepEqual(first.calls[2], ["query: cpu"]);

        // A fresh instance — a new process, in real life — finds the vectors
        // on disk and embeds nothing but the query.
        const second = fakeEmbedder();
        const revived = localSearchIntegration({
            embedder: second,
            cacheDir
        });
        await revived.semanticSearchProvider.search({
            query: "fruit",
            records: RECORDS
        });
        assert.equal(second.calls.length, 1);
        assert.deepEqual(second.calls[0], ["query: fruit"]);
    } finally {
        await rm(cacheDir, { recursive: true, force: true });
    }
});

test("an edited record re-embeds while untouched ones stay cached", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "workfile-embeddings-"));
    try {
        const embed = fakeEmbedder();
        const integration = localSearchIntegration({
            embedder: embed,
            cacheDir
        });
        await integration.semanticSearchProvider.search({
            query: "fruit",
            records: RECORDS
        });
        const edited = [
            { ...RECORDS[0], body: "Bake with fruit and cinnamon." },
            RECORDS[1]
        ];
        await integration.semanticSearchProvider.search({
            query: "fruit",
            records: edited
        });
        // Second search: exactly one passage (the edited card) plus the query.
        assert.equal(embed.calls.length, 4);
        assert.equal(embed.calls[2].length, 1);
        assert.match(embed.calls[2][0], /cinnamon/);
    } finally {
        await rm(cacheDir, { recursive: true, force: true });
    }
});

// The first pass over a workspace embeds thousands of records. It used to be
// one giant embed() call with a single persist at the very end — a killed
// process lost every vector. Batches must land on disk as they complete.
test("an interrupted pass keeps every completed batch on disk", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "workfile-embeddings-"));
    try {
        const corpus = Array.from({ length: 6 }, (_, i) => ({
            id: `T-${i}`,
            title: i < 4 ? `Fruit basket ${i}` : `Apple crate ${i}`,
            body: "text"
        }));
        // Fails on the third passage batch: batches 1 and 2 (4 records)
        // complete, records 5 and 6 never embed.
        let passageBatches = 0;
        const flaky = async (texts) => {
            if (texts.some((text) => text.startsWith("passage:"))) {
                passageBatches += 1;
                if (passageBatches === 3) throw new Error("killed mid-pass");
            }
            return texts.map(() => [1, 0]);
        };
        const integration = localSearchIntegration({
            embedder: flaky,
            cacheDir,
            batchSize: 2
        });
        await assert.rejects(
            integration.semanticSearchProvider.search({
                query: "fruit",
                records: corpus
            }),
            /killed mid-pass/
        );

        // A fresh instance resumes: only the two lost records re-embed.
        const resumed = fakeEmbedder();
        const revived = localSearchIntegration({
            embedder: resumed,
            cacheDir,
            batchSize: 2
        });
        await revived.semanticSearchProvider.search({
            query: "fruit",
            records: corpus
        });
        const passages = resumed.calls.filter((texts) =>
            texts.some((text) => text.startsWith("passage:"))
        );
        assert.equal(
            passages.flat().length,
            2,
            "only the records the interrupted pass lost are re-embedded"
        );
    } finally {
        await rm(cacheDir, { recursive: true, force: true });
    }
});

test("large passes report progress; small ones stay silent", async () => {
    const seen = [];
    const integration = localSearchIntegration({
        embedder: fakeEmbedder(),
        cacheDir: null,
        batchSize: 2,
        onProgress: (state) => seen.push({ ...state })
    });
    await integration.semanticSearchProvider.search({
        query: "fruit",
        records: Array.from({ length: 5 }, (_, i) => ({
            id: `T-${i}`,
            title: `Record ${i}`,
            body: "text"
        }))
    });
    assert.deepEqual(seen, [
        { done: 0, total: 5 },
        { done: 2, total: 5 },
        { done: 4, total: 5 },
        { done: 5, total: 5 }
    ]);
});

test("plugs into the core registry and hybrid ranking end to end", async () => {
    const integration = defineProjectIntegration(
        localSearchIntegration({ embedder: fakeEmbedder(), cacheDir: null })
    );
    assert.equal(integration.id, "local-embeddings");

    const records = RECORDS.map((record) => ({
        ...record,
        kind: "card",
        recordType: "task",
        path: `.project/cards/${record.id}.md`,
        updated: "2026-07-30"
    }));
    const result = await searchProjectRecordsHybrid(
        records,
        "fruit desserts",
        { provider: integration.semanticSearchProvider }
    );
    assert.equal(result.mode, "hybrid");
    assert.equal(result.provider, "local-embeddings");
    assert.equal(result.records[0].id, "T-0001");
    assert.equal(result.records[0].semanticScore, 1);
});

test("empty queries and empty record sets short-circuit without embedding", async () => {
    const embed = fakeEmbedder();
    const integration = localSearchIntegration({
        embedder: embed,
        cacheDir: null
    });
    assert.deepEqual(
        await integration.semanticSearchProvider.search({
            query: "  ",
            records: RECORDS
        }),
        []
    );
    assert.deepEqual(
        await integration.semanticSearchProvider.search({
            query: "fruit",
            records: []
        }),
        []
    );
    assert.equal(embed.calls.length, 0);
});
