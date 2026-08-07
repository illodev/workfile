import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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

/**
 * The ONNX file a dtype names, in the layout Hugging Face repositories use.
 *
 * `q8` is spelled `model_quantized.onnx` and everything else is
 * `model_<dtype>.onnx`, with `fp32` the unsuffixed original. This is a naming
 * convention rather than an API, so a dtype this cannot spell is refused here
 * with the list — better than a 404 from a URL the caller never wrote.
 */
export function onnxFileName(dtype) {
    if (dtype === "fp32") return "model.onnx";
    if (dtype === "q8") return "model_quantized.onnx";
    if (/^(fp16|int8|uint8|q4|q4f16|bnb4)$/.test(dtype)) {
        return `model_${dtype}.onnx`;
    }
    throw new Error(
        `Unknown dtype "${dtype}". Use fp32, fp16, q8, int8, uint8, q4, q4f16 or bnb4.`
    );
}

/**
 * Mean-pool a batch's hidden states over the attention mask, then L2-normalize.
 *
 * Separated from the session so it can be tested without a model: this is the
 * arithmetic the whole ranking rests on, and it is the part a refactor breaks
 * silently — a pooled vector that divides by the padded width instead of the
 * real token count still looks like a plausible embedding.
 *
 * Padding must be excluded rather than averaged in. It is why the mask is read
 * here at all: with a batch of one, dividing by the width happens to be right,
 * and every batch after that is quietly wrong in proportion to how uneven the
 * texts are.
 */
export function poolAndNormalize(hidden, mask, { rows, width, size }) {
    const vectors = [];
    for (let row = 0; row < rows; row += 1) {
        const vector = new Array(size).fill(0);
        let counted = 0;
        for (let column = 0; column < width; column += 1) {
            if (!mask[row * width + column]) continue;
            counted += 1;
            const base = (row * width + column) * size;
            for (let i = 0; i < size; i += 1) vector[i] += hidden[base + i];
        }
        if (counted) for (let i = 0; i < size; i += 1) vector[i] /= counted;
        let norm = 0;
        for (const value of vector) norm += value * value;
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < size; i += 1) vector[i] /= norm;
        vectors.push(vector);
    }
    return vectors;
}

/**
 * Where the model files live, fetching them once if they are not there yet.
 *
 * `@huggingface/transformers` used to do this, and it is most of what it was
 * here for. It also brought `sharp` and `onnxruntime-node` as hard
 * dependencies — image processing and an archive extractor this package never
 * touches — each carrying a high-severity advisory with no upstream fix, handed
 * to everybody who installed this package. See ADR-0021 and T-0221.
 *
 * A `model` containing a path separator is read from disk and never fetched, so
 * an air-gapped or offline install works by pointing at a directory.
 */
async function ensureModelFiles(model, dtype, modelDir) {
    const onnx = onnxFileName(dtype);
    if (model.includes("/") && (model.startsWith(".") || model.startsWith("/"))) {
        return {
            tokenizer: join(model, "tokenizer.json"),
            tokenizerConfig: join(model, "tokenizer_config.json"),
            onnx: join(model, onnx)
        };
    }
    const directory = join(modelDir, model.replace(/[^a-zA-Z0-9._-]+/g, "-"));
    await mkdir(directory, { recursive: true });
    const wanted = [
        ["tokenizer.json", "tokenizer.json"],
        ["tokenizer_config.json", "tokenizer_config.json"],
        [`onnx/${onnx}`, onnx]
    ];
    const resolved = {};
    for (const [remote, local] of wanted) {
        const path = join(directory, local);
        resolved[local] = path;
        try {
            await stat(path);
            continue;
        } catch {
            // Not cached yet.
        }
        const url = `https://huggingface.co/${model}/resolve/main/${remote}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Could not fetch ${remote} for ${model}: HTTP ${response.status} from ${url}`
            );
        }
        // Written under a temporary name and renamed, so an interrupted
        // download can never leave a truncated model that loads and produces
        // nonsense — the same reason the embedding cache does it.
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
        await rename(temporary, path);
    }
    return {
        tokenizer: resolved["tokenizer.json"],
        tokenizerConfig: resolved["tokenizer_config.json"],
        onnx: resolved[onnx]
    };
}

/**
 * Feature extraction over `onnxruntime-web` and `@huggingface/tokenizers`.
 *
 * Replaces one `pipeline("feature-extraction")` call, and the reason is the
 * dependency tree rather than the API: this reaches the same weights through the
 * WASM execution provider, which needs neither the native binding nor its
 * archive extractor. Verified against the implementation it replaces — per
 * vector cosine 0.9978 on the same texts with the same q8 weights, unit norms,
 * and the same ranking order. The residual is the WASM and native kernels
 * disagreeing at quantized precision, not a difference in method.
 */
async function loadOnnxEmbedder(model, dtype, numThreads, modelDir) {
    const [ort, { Tokenizer }] = await Promise.all([
        import("onnxruntime-web"),
        import("@huggingface/tokenizers")
    ]);
    const files = await ensureModelFiles(model, dtype, modelDir);
    const [tokenizerJson, tokenizerConfigJson] = await Promise.all([
        readFile(files.tokenizer, "utf8"),
        readFile(files.tokenizerConfig, "utf8").catch(() => "{}")
    ]);
    const config = JSON.parse(tokenizerConfigJson);
    const tokenizer = new Tokenizer(JSON.parse(tokenizerJson), config);

    // A global on the ort environment rather than a session option: for the
    // WASM provider `intraOpNumThreads` is not the knob, `env.wasm.numThreads`
    // is. Same intent as before — half the machine, never all of it.
    ort.env.wasm.numThreads = numThreads;
    const session = await ort.InferenceSession.create(files.onnx);
    const wantsTokenTypes = session.inputNames.includes("token_type_ids");
    // These models truncate anyway; feeding more than the position embeddings
    // cover is an error from the runtime rather than a longer read.
    const limit = Number(config.model_max_length) || 512;

    return async (texts) => {
        const encodings = texts.map((text) => {
            const encoded = tokenizer.encode(text, {
                return_token_type_ids: wantsTokenTypes
            });
            const ids = encoded.ids.slice(0, limit);
            return {
                ids,
                mask: (encoded.attention_mask || ids.map(() => 1)).slice(0, limit)
            };
        });
        const rows = encodings.length;
        const width = Math.max(...encodings.map((encoding) => encoding.ids.length));
        const ids = new BigInt64Array(rows * width);
        const mask = new BigInt64Array(rows * width);
        encodings.forEach((encoding, row) => {
            for (let column = 0; column < encoding.ids.length; column += 1) {
                ids[row * width + column] = BigInt(encoding.ids[column]);
                mask[row * width + column] = BigInt(encoding.mask[column]);
            }
        });
        const dims = [rows, width];
        const feeds = {
            input_ids: new ort.Tensor("int64", ids, dims),
            attention_mask: new ort.Tensor("int64", mask, dims)
        };
        // All zeros: one segment. Present only because the exported graph
        // declares the input, which XLM-R-derived models do while never using it.
        if (wantsTokenTypes) {
            feeds.token_type_ids = new ort.Tensor(
                "int64",
                new BigInt64Array(rows * width),
                dims
            );
        }
        const output = await session.run(feeds);
        const hidden = output.last_hidden_state;
        return poolAndNormalize(hidden.data, mask, {
            rows,
            width,
            size: hidden.dims[2]
        });
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
 * The model is downloaded once on first use, into `modelDir`, and everything
 * afterwards is offline. Repository content never leaves the machine — which is
 * the reason this package exists instead of an API client. Pointing `model` at a
 * directory skips the download entirely, for an install with no network.
 */
export function localSearchIntegration(options = {}) {
    const {
        id = "local-embeddings",
        model = DEFAULT_MODEL,
        dtype = "q8",
        cacheDir = join(homedir(), ".cache", "workfile", "embeddings"),
        /**
         * Where the model and tokenizer are kept. Separate from `cacheDir`:
         * vectors are cheap to recompute and the model is a 118 MB download, so
         * clearing one must not cost the other.
         */
        modelDir = join(homedir(), ".cache", "workfile", "models"),
        passageChars = 2000,
        embedder = null,
        /** ONNX WASM threads. Default: half the cores, never all. */
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
            : loadOnnxEmbedder(model, dtype, numThreads, modelDir);
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
