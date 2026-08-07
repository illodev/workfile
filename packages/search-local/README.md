# @illodev/workfile-search-local

Local embeddings semantic search provider for [Workfile](https://github.com/illodev/workfile).
Models run on-device via [onnxruntime-web](https://onnxruntime.ai/) and
[@huggingface/tokenizers](https://github.com/huggingface/tokenizers) (ONNX on CPU, WASM) —
repository content never leaves the machine.

## Usage

```bash
pnpm add -D @illodev/workfile-search-local
```

```js
// project.config.mjs — the import is GUARDED on purpose. A bare
// `import ... from "@illodev/workfile-search-local"` resolves from this file,
// so the config would only load with node_modules present — and the generated
// CI job runs `npx --yes @illodev/workfile@X doctor` on a clean clone. With
// the guard, no package means lexical search, not a red pipeline.
export const integrations = await (async () => {
    try {
        const { localSearchIntegration } = await import(
            "@illodev/workfile-search-local"
        );
        return [localSearchIntegration()];
    } catch {
        return [];
    }
})();

export default {
    schemaVersion: 2,
    name: "My project",
    search: { provider: "local-embeddings" }
};
```

That is all: `workfile search`, the HTTP API, the UI and the MCP server rank
hybrid results automatically. `workfile search QUERY --mode lexical` opts out
per call.

## The first pass, honestly

The first hybrid search over a workspace embeds every candidate record that is
not yet cached. On a few thousand records that is **minutes of sustained CPU**,
and it is triggered by whichever surface searches first — the CLI, the board
UI, or the MCP server a coding agent loads. The provider is built so that pass
is survivable:

- **Half the cores by default** (`numThreads`): ONNX no longer takes the whole
  machine. Raise it deliberately if the box is idle.
- **Batched with per-batch persistence** (`batchSize`, default 32): killing the
  process keeps every completed batch; the next search resumes where it died
  instead of starting over.
- **Progress on stderr** once 64+ records are missing, so a long pass looks
  like work instead of a hang. `onProgress` replaces it with your own sink.

Afterwards the cache makes searches fast (typically seconds), and editing a
record re-embeds that record only.

## Behavior

- The model (default `Xenova/multilingual-e5-small`, quantized, multilingual)
  is downloaded once on first use into `modelDir` — about 135 MB of tokenizer
  and weights — and everything afterwards is offline. Point `model` at a
  directory holding `tokenizer.json` and the ONNX file to skip the download
  entirely, which is how this runs on a machine with no network.
- Record embeddings are cached in `~/.cache/workfile/embeddings`, keyed by
  content hash — editing a card re-embeds that card only. Only the first
  `passageChars` characters of a body are embedded, so edits beyond that
  boundary intentionally do not invalidate the vector.
- Scores are spread over the candidate set (best 1, worst 0) before Workfile
  blends them with the lexical ranking (`search.semanticWeight`, default 0.35).
- Workfile picks semantic candidates by lexical relevance first, filling the
  remainder in index order up to `search.maxProviderRecords` — size that cap
  to your corpus if you want every record eligible.

## Options

```js
localSearchIntegration({
    id: "local-embeddings",             // integration id, referenced by search.provider
    model: "Xenova/multilingual-e5-small",
    dtype: "q8",                        // which exported ONNX weights to load
    cacheDir: "~/.cache/workfile/embeddings-or-null",
    modelDir: "~/.cache/workfile/models", // where the model and tokenizer are kept
    passageChars: 2000,                 // body characters embedded per record
    embedder: null,                     // inject your own (texts) => vectors
    numThreads: 4,                      // ONNX WASM threads; default: half the cores
    batchSize: 32,                      // records per model call; cache persists per batch
    onProgress: ({ done, total }) => {} // default: stderr lines on large passes
});
```
