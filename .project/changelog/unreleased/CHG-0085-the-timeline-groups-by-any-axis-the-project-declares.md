---
id: CHG-0085
title: The timeline groups by any axis the project declares
type: added
area: ui
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
A project that declares a second classification axis can now read the timeline
by it.

Per ADR-0008, `area` is one axis and it tends to carry the delivery layer. A
repository that also wants a domain declares one:

```js
cards: {
    areas: ["api", "web", "infra"],
    axes: { context: ["treasury", "verifactu", "billing", "iam"] }
}
```

That axis now appears in the timeline's group control beside `epic` and
`area`, and the chart grows a labelled band per value. The options are built
from the workspace's own schema, so declaring a second axis puts it there with
no further change — and a project that declares none sees exactly what it saw
before.

Cards the axis says nothing about collect in a labelled band of their own at
the end (`no context`) rather than sorting silently to the top. Grouping still
only reorders: every scheduled card stays on the chart.
