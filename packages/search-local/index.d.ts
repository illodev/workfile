export interface LocalSearchRecord {
    id: string;
    title?: string;
    body?: string;
    [key: string]: unknown;
}

export interface LocalSearchOptions {
    /** Integration id, referenced by `search.provider`. Default `local-embeddings`. */
    id?: string;
    /** Any feature-extraction model transformers.js can load. Default `Xenova/multilingual-e5-small`. */
    model?: string;
    /** Model quantization passed to transformers.js. Default `q8`. */
    dtype?: string;
    /** On-disk embedding cache directory; null disables persistence. Default `~/.cache/workfile/embeddings`. */
    cacheDir?: string | null;
    /** Body characters embedded per record. Default 2000. */
    passageChars?: number;
    /** Injectable embedding function (tests, custom backends). Must return one L2-normalized vector per text. */
    embedder?: ((texts: string[]) => Promise<number[][]>) | null;
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
