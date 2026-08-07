export interface LocalSearchRecord {
    id: string;
    title?: string;
    body?: string;
    [key: string]: unknown;
}

export interface LocalSearchOptions {
    /** Integration id, referenced by `search.provider`. Default `local-embeddings`. */
    id?: string;
    /**
     * A Hugging Face repository exporting ONNX feature extraction, or a
     * filesystem path to a directory holding `tokenizer.json` and the ONNX file,
     * which skips the download. Default `Xenova/multilingual-e5-small`.
     */
    model?: string;
    /** Which exported ONNX weights to load. Default `q8`. */
    dtype?: string;
    /** On-disk embedding cache directory; null disables persistence. Default `~/.cache/workfile/embeddings`. */
    cacheDir?: string | null;
    /**
     * Where the model and tokenizer are kept, separate from `cacheDir` because
     * vectors are cheap to recompute and the model is a 118 MB download. Default
     * `~/.cache/workfile/models`.
     */
    modelDir?: string;
    /** Body characters embedded per record. Default 2000. */
    passageChars?: number;
    /** Injectable embedding function (tests, custom backends). Must return one L2-normalized vector per text. */
    embedder?: ((texts: string[]) => Promise<number[][]>) | null;
    /** ONNX WASM threads. Default: half the machine's cores, never all of them. */
    numThreads?: number;
    /** Records embedded per model call; the cache persists after each batch. Default 32. */
    batchSize?: number;
    /** Progress callback for embedding passes. Default writes to stderr when 64+ records are missing. */
    onProgress?: ((state: { done: number; total: number }) => void) | null;
}

export interface LocalSearchIntegration {
    id: string;
    title: string;
    description: string;
    semanticSearchProvider: {
        id: string;
        search(input: {
            query: string;
            records: LocalSearchRecord[];
            limit?: number;
        }): Promise<Array<{ id: string; score: number }>>;
    };
}

export function localSearchIntegration(
    options?: LocalSearchOptions
): LocalSearchIntegration;

/**
 * The ONNX file a dtype names in a Hugging Face repository. Exported because it
 * is a naming convention rather than an API, and a caller passing a custom
 * `dtype` needs to know what will be fetched.
 */
export function onnxFileName(dtype: string): string;

/**
 * Mean-pool hidden states over an attention mask, then L2-normalize. Exported so
 * the arithmetic the ranking rests on can be checked without loading a model.
 */
export function poolAndNormalize(
    hidden: ArrayLike<number>,
    mask: ArrayLike<number | bigint>,
    shape: { rows: number; width: number; size: number }
): number[][];
