import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";

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

async function loadTransformersEmbedder(model, dtype) {
    const { pipeline } = await import("@huggingface/transformers");
    // Quantized by default: on CPU q8 is several times faster than fp32 and
    // the retrieval quality difference is noise at this scale.
    const extractor = await pipeline("feature-extraction", model, { dtype });
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
 * Declare it in `project.config.mjs`:
 *
 *     import { localSearchIntegration } from "@illodev/workfile-search-local";
 *     export const integrations = [localSearchIntegration()];
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
        embedder = null
    } = options;
    const cache = createEmbeddingCache(cacheDir, model);
    let embedderPromise = null;
    const resolveEmbedder = () => {
        embedderPromise ||= embedder
            ? Promise.resolve(embedder)
            : loadTransformersEmbedder(model, dtype);
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
                    const embedded = await embed(
                        missing.map((i) =>
                            passageText(records[i], passageChars)
                        )
                    );
                    missing.forEach((recordIndex, embeddedIndex) => {
                        vectors[recordIndex] = embedded[embeddedIndex];
                        cache.set(keys[recordIndex], embedded[embeddedIndex]);
                    });
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
