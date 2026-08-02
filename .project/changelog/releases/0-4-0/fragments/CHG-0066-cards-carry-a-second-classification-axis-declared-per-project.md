---
id: CHG-0066
title: Cards carry a second classification axis, declared per project
type: added
area: core
visibility: public
cards: [T-0102]
created: 2026-08-02
updated: 2026-08-02
---
`area` is a card's only classification axis and it is shaped like a delivery
layer. A repository with fifteen bounded contexts had all of them under one
`api`, and declaring the contexts as areas would only have lost the layer
instead. `cards.axes` declares a second axis and its vocabulary:

```js
cards: {
    areas: ["api", "web", "infra"],
    axes: { context: ["treasury", "verifactu", "billing", "iam"] }
}
```

Each axis becomes a flat frontmatter key, so `search "context:treasury"` reads
it with no new index — that half already worked. What is new is that a value
outside the vocabulary is now refused, naming the accepted values, instead of
being written and then matching nothing.

Write it with `--axis name=value` on `card create` and `card patch`, repeated
once per axis, or with `axes: { name: value }` through MCP and HTTP. An empty
value clears it. `workfile schema` reports the declared axes, so an agent
discovers them the way it discovers areas.
