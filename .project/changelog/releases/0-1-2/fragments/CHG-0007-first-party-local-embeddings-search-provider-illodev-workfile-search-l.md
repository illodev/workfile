---
id: CHG-0007
title: "First-party local embeddings search provider: @illodev/workfile-search-local"
type: added
area: search
visibility: public
cards: [T-0018]
created: 2026-07-30
updated: 2026-07-30
---

New optional workspace package running semantic search entirely on-device (transformers.js, quantized multilingual-e5-small by default). Declare `localSearchIntegration()` in project.config.mjs and every surface ranks hybrid results. Embeddings are cached by content hash (~5 ms warm searches); the model downloads once and everything afterwards is offline. Repository content never leaves the machine.
