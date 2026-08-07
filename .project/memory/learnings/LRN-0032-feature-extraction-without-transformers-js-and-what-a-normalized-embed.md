---
id: LRN-0032
title: Feature extraction without transformers.js, and what a normalized embedding does not care about
status: active
category: infra
confidence: high
related: [T-0221, ADR-0021]
tags: [search, embeddings]
created: 2026-08-07
updated: 2026-08-07
---

Recorded for T-0221, which replaced one `pipeline("feature-extraction")` call in
`packages/search-local/index.js` because `@huggingface/transformers` pulls `sharp`
and `onnxruntime-node` as hard dependencies and shipped their advisories to every
consumer.

**The pipeline was doing four things, and only four.** Fetch `tokenizer.json` and
the ONNX weights; tokenize; run the session; mean-pool over the attention mask and
L2-normalize. Reimplemented over `onnxruntime-web` plus
`@huggingface/tokenizers`, that is about 130 lines, and it audits clean with no
overrides. Measured against what it replaced, on the same q8 weights and the same
texts: per-vector cosine 0.9978, unit norms, identical ranking order. The residual
is the WASM and native kernels disagreeing at quantized precision, not a
difference in method. Session creation is about 800 ms and a warm search over a
handful of records is ~2–3 s.

**Details that are not obvious from the transformers.js API.**
`onnxruntime-web` runs in Node — the name is about the execution provider, not the
host. Threads are `ort.env.wasm.numThreads`, a global on the environment;
`intraOpNumThreads` in the session options is the native knob and does nothing
here. The tokenizer's encoding field is `ids`, not `input_ids`. `Xenova`-style
repositories spell q8 weights `onnx/model_quantized.onnx` while every other dtype
is `model_<dtype>.onnx`. And the exported graph declares `token_type_ids` even for
XLM-R-derived models that never use it, so feed zeros when `session.inputNames`
asks for it and skip it when it does not.

**The part worth remembering, because a test asserted the opposite.** After L2
normalization the pooling *divisor* cannot matter: dividing by the padded width
instead of the real token count is a positive scalar, and normalization cancels it
exactly. A mutation test that changed `counted` to `width` passed, and it was right
to pass. What does matter is which positions are *summed* — including padded
positions moves the direction, and on the test's own data it moves it about 45
degrees. So pin the mask, never the divisor, and do not write a comment claiming a
mutation will be caught without running it: the first version of that comment was
wrong in exactly this way.

**How to apply.** When a dependency is mostly a convenience wrapper, price the
wrapper before accepting its tree. Here the convenience was a model downloader and
four lines of arithmetic, and the price was two high-severity advisories with no
upstream fix, handed to everyone who installed the package.
