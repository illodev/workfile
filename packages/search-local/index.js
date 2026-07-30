import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { availableParallelism, homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";

/**
 * Half the machine by default, never all of it. The first pass over a real
 * workspace embeds thousands of records, and ONNX left to its own devices
 * takes every core for however long that lasts — on one consumer machine it
 * took the graphical session down. Search being slower is recoverable;
 * a frozen desktop is not.
 */
const DEFAULT_THREADS = Math.max(
    1,
    Math.floor((availableParallelism?.() || 4) / 2)
);

/** Below this many missing records the pass is quick enough to stay silent. */
const PROGRESS_THRESHOLD = 64;

function defaultProgress({ done, total }) {
    // stderr on purpose: stdout belongs to CLI results and, under MCP, to the
    // JSON-RPC stream — a progress line there would corrupt the protocol.
    process.stderr.write(
        done === 0
            ? `[workfile-search-local] embedding ${total} records (first pass; cached afterwards)\n`
            : `[workfile-search-local] ${done}/${total}\n`
    );
}

function contentHash(model, text) {
    return createHash("sha256").update(model).update("\n").update(text).digest("hex");
}

/** Vectors arrive L2-normalized, so cosine similarity is the dot product. */
function dot(left, right) {
    let sum = 0;
    for (let i = 0; i < left.length; i += 1) sum += left[i] * right[i];
    return sum;
}

/**
 * What gets embedded for a record. Title first — it carries most of the
 * meaning per token — then the body, capped: the models truncate around 512
 * tokens anyway, and embedding kilobytes that will be cut costs time for
 * nothing. e5 models are trained with the `passage:`/`query:` prefixes; leaving
 * them out measurably hurts retrieval.
 */
function passageText(record, passageChars) {
    const title = String(record.title || "");
    const body = String(record.body || "").slice(0, passageChars);
    return `passage: ${title}\n${body}`.trim();
}

/**
 * On-disk embedding cache, one JSON file per model.
 *
 * Keyed by content hash rather than record id: a card edited since it was
 * embedded must not answer with the stale vector, and two records with the
 * same content may share one. Loading is lazy and failures are treated as an
 * empty cache — a corrupt file costs a re-embed, never an error.
 */
function createEmbeddingCache(cacheDir, model) {
    const file = cacheDir
        ? join(cacheDir, `${model.replace(/[^a-zA-Z0-9._-]+/g, "-")}.json`)
        : null;
    let entries = null;
    let dirty = false;
    return {
        async load() {
            if (entries) return;
            entries = new Map();
            if (!file) return;
            try {
                const parsed = JSON.parse(await readFile(file, "utf8"));
                for (const [key, vector] of Object.entries(parsed)) {
                    if (Array.isArray(vector)) entries.set(key, vector);
                }
            } catch {
                // Missing or corrupt cache: start empty.
            }
        },
        get(key) {
            return entries.get(key) || null;
        },
        set(key, vector) {
            entries.set(key, vector);
            dirty = true;
        },
        async persist() {
            if (!file || !dirty) return;
            dirty = false;
            await mkdir(cacheDir, { recursive: true });
            const temporary = `${file}.${process.pid}.tmp`;
            await writeFile(
                temporary,
                JSON.stringify(Object.fromEntries(entries))
            );
            await rename(temporary, file);
        }
    };
}

async function loadTransformersEmbedder(model, dtype, numThreads) {
    const { pipeline } = await import("@huggingface/transformers");
    // Quantized by default: on CPU q8 is several times faster than fp32 and
    // the retrieval quality difference is noise at this scale.
    const extractor = await pipeline("feature-extraction", model, {
        dtype,
        session_options: {
            intraOpNumThreads: numThreads,
            interOpNumThreads: 1
        }
    });
    return async (texts) => {
        const output = await extractor(texts, {
            pooling: "mean",
            normalize: true
        });
        return output.tolist();
    };
}

/**
 * A Workfile integration whose semantic search runs entirely on-device.
 *
 * Declare it in `project.config.mjs` with a GUARDED import — a bare
 * `import ... from "@illodev/workfile-search-local"` resolves from the config
 * file, so the config only loads with `node_modules` present, and the
 * generated CI job runs `npx` on a clean clone:
 *
 *     export const integrations = await (async () => {
 *         try {
 *             const { localSearchIntegration } = await import(
 *                 "@illodev/workfile-search-local"
 *             );
 *             return [localSearchIntegration()];
 *         } catch {
 *             return []; // package absent: search degrades to lexical
 *         }
 *     })();
 *
 * The model is downloaded once on first use (to the transformers.js cache) and
 * everything afterwards is offline. Repository content never leaves the
 * machine — which is the reason this package exists instead of an API client.
 */
export function localSearchIntegration(options = {}) {
    const {
        id = "local-embeddings",
        model = DEFAULT_MODEL,
        dtype = "q8",
        cacheDir = join(homedir(), ".cache", "workfile", "embeddings"),
        passageChars = 2000,
        embedder = null,
        /** ONNX intra-op threads. Default: half the cores, never all. */
        numThreads = DEFAULT_THREADS,
        /** Records embedded per model call; the cache persists after each batch. */
        batchSize = 32,
        /** ({done, total}) => void. Default writes to stderr for large passes. */
        onProgress = null
    } = options;
    const cache = createEmbeddingCache(cacheDir, model);
    let embedderPromise = null;
    const resolveEmbedder = () => {
        embedderPromise ||= embedder
            ? Promise.resolve(embedder)
            : loadTransformersEmbedder(model, dtype, numThreads);
        return embedderPromise;
    };

    return {
        id,
        title: "Local embeddings",
        description: `On-device semantic search via ${model}; repository content never leaves the machine.`,
        semanticSearchProvider: {
            id,
            async search({ query, records, limit }) {
                const text = String(query || "").trim();
                if (!text || !records?.length) return [];
                const embed = await resolveEmbedder();
                await cache.load();

                const keys = records.map((record) =>
                    contentHash(model, passageText(record, passageChars))
                );
                const vectors = keys.map((key) => cache.get(key));
                const missing = [];
                for (let i = 0; i < records.length; i += 1) {
                    if (!vectors[i]) missing.push(i);
                }
                if (missing.length) {
                    // Batched, persisted per batch, with a progress signal.
                    // One giant embed() call had three failure modes at once:
                    // nothing hit disk until the very end (a killed pass lost
                    // every vector), nothing reported progress, and the event
                    // loop starved for minutes. A workspace-sized first pass
                    // must be interruptible and resumable, not a leap of faith.
                    const chunk = Math.max(1, Math.floor(batchSize) || 32);
                    const report =
                        onProgress ||
                        (missing.length >= PROGRESS_THRESHOLD
                            ? defaultProgress
                            : null);
                    report?.({ done: 0, total: missing.length });
                    for (
                        let start = 0;
                        start < missing.length;
                        start += chunk
                    ) {
                        const slice = missing.slice(start, start + chunk);
                        const embedded = await embed(
                            slice.map((i) =>
                                passageText(records[i], passageChars)
                            )
                        );
                        slice.forEach((recordIndex, embeddedIndex) => {
                            vectors[recordIndex] = embedded[embeddedIndex];
                            cache.set(
                                keys[recordIndex],
                                embedded[embeddedIndex]
                            );
                        });
                        await cache.persist();
                        report?.({
                            done: Math.min(
                                start + chunk,
                                missing.length
                            ),
                            total: missing.length
                        });
                        // Let timers, signals and the host breathe between batches.
                        await new Promise((resolve) => setImmediate(resolve));
                    }
                }
                const [queryVector] = await embed([`query: ${text}`]);

                const raw = records.map((record, i) => ({
                    id: record.id,
                    score: dot(queryVector, vectors[i])
                }));
                // Cosines from these models cluster in a narrow band
                // (~0.75–0.95), useless raw as a 0..1 signal. Spread them over
                // the candidate set instead: best match 1, worst 0. Relative
                // is exactly what a ranking blend needs.
                let minimum = Infinity;
                let maximum = -Infinity;
                for (const entry of raw) {
                    if (entry.score < minimum) minimum = entry.score;
                    if (entry.score > maximum) maximum = entry.score;
                }
                const spread = maximum - minimum;
                const scored = raw
                    .map(({ id: recordId, score }) => ({
                        id: recordId,
                        score: spread ? (score - minimum) / spread : 1
                    }))
                    .sort((left, right) => right.score - left.score);

                await cache.persist();
                return limit ? scored.slice(0, limit) : scored;
            }
        }
    };
}
