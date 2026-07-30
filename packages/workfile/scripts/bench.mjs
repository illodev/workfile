import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBenchWorkspace } from "./bench-workspace.mjs";
import {
    buildProjectIndex,
    loadCards,
    loadWorkspace,
    runDoctor,
    searchProjectRecords
} from "../dist/src/index.js";

const WARMUPS = 2;
const RUNS = 5;

function percentile(values, fraction) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

async function measure(label, fn) {
    for (let index = 0; index < WARMUPS; index += 1) await fn();
    const samples = [];
    for (let index = 0; index < RUNS; index += 1) {
        const started = performance.now();
        await fn();
        samples.push(performance.now() - started);
    }
    return {
        label,
        p50: Math.round(percentile(samples, 0.5) * 10) / 10,
        p95: Math.round(percentile(samples, 0.95) * 10) / 10
    };
}

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * Timings and, more importantly, payload sizes.
 *
 * Times drift with the machine; bytes do not. The byte figures are the ones
 * worth gating on, because they are exactly what a listing hands an agent — the
 * cost this protocol exists to reduce.
 */
export async function runBenchmark(scale = "M") {
    const root = await mkdtemp(join(tmpdir(), `project-bench-${scale}-`));
    try {
        await buildBenchWorkspace(root, scale);
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace);

        const timings = [
            await measure("loadCards", () => loadCards(workspace)),
            await measure("buildProjectIndex", () => buildProjectIndex(workspace)),
            await measure("search:empty", async () =>
                searchProjectRecords(index.records, "", { limit: 20 })
            ),
            await measure("search:terms", async () =>
                searchProjectRecords(index.records, "billing retry queue", {
                    limit: 20
                })
            ),
            await measure("runDoctor", () => runDoctor(workspace))
        ];

        const cards = await loadCards(workspace);
        const payloads = {
            "index.records": bytes(index.records),
            "search:20": bytes(
                searchProjectRecords(index.records, "billing", { limit: 20 })
                    .records
            ),
            "cards:all": bytes(cards.cards),
            "cards:all,no-body": bytes(
                cards.cards.map(({ body, ...rest }) => rest)
            )
        };

        return {
            scale,
            records: index.records.length,
            timings,
            payloads
        };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const scale = process.argv[2] || "M";
    const result = await runBenchmark(scale);
    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`scale ${result.scale} — ${result.records} records\n`);
        console.log("  timings (ms)          p50      p95");
        for (const timing of result.timings) {
            console.log(
                `  ${timing.label.padEnd(20)} ${String(timing.p50).padStart(7)} ${String(timing.p95).padStart(8)}`
            );
        }
        console.log("\n  payloads (bytes)");
        for (const [label, size] of Object.entries(result.payloads)) {
            console.log(
                `  ${label.padEnd(20)} ${size.toLocaleString("en-US").padStart(12)}`
            );
        }
    }
}
