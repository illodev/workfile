# @illodev/workfile-search-local

Local embeddings semantic search provider for [Workfile](https://github.com/illodev/workfile).
Models run on-device via [transformers.js](https://github.com/huggingface/transformers.js) (ONNX on CPU) — repository content never leaves the machine.

## Usage

```bash
pnpm add -D @illodev/workfile-search-local
```

```js
// project.config.mjs
import { localSearchIntegration } from "@illodev/workfile-search-local";

export const integrations = [localSearchIntegration()];

export default {
    schemaVersion: 2,
    name: "My project",
    search: { provider: "local-embeddings" }
};
```

That is all: `workfile search`, the HTTP API, the UI and the MCP server rank
hybrid results automatically. `workfile search QUERY --mode lexical` opts out
per call.

## Behavior

- The model (default `Xenova/multilingual-e5-small`, quantized, multilingual)
  is downloaded once on first use to the transformers.js cache; everything
  afterwards is offline.
- Record embeddings are cached in `~/.cache/workfile/embeddings`, keyed by
  content hash — editing a card re-embeds that card only. The first hybrid
  search over a large workspace pays the embedding cost once; the rest are
  fast.
- Scores are spread over the candidate set (best 1, worst 0) before Workfile
  blends them with the lexical ranking (`search.semanticWeight`, default 0.35).

## Options

```js
localSearchIntegration({
    id: "local-embeddings",             // integration id, referenced by search.provider
    model: "Xenova/multilingual-e5-small",
    cacheDir: "~/.cache/workfile/embeddings-or-null",
    passageChars: 2000,                 // body characters embedded per record
    embedder: null                      // inject your own (texts) => vectors
});
```
