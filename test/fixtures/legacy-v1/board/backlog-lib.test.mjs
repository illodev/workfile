import assert from "node:assert/strict";
import test from "node:test";

import {
    diagnoseBacklog,
    parseTask,
    parseValue,
    serializeValue
} from "./backlog-lib.mjs";

const valid = {
    id: "T-0001",
    file: "T-0001-example.md",
    title: "Example task",
    status: "backlog",
    type: "task",
    priority: "medium",
    area: "api",
    created: "2026-07-25",
    updated: "2026-07-25",
    body: "Context",
    archived: false
};

test("parseTask reads the restricted frontmatter format", () => {
    const task = parseTask(
        "T-0001-example.md",
        `---
id: T-0001
title: Example task
status: backlog
type: task
priority: medium
area: api
tags: [one, two]
created: 2026-07-25
updated: 2026-07-25
---

Context`
    );
    assert.equal(task.id, "T-0001");
    assert.deepEqual(task.tags, ["one", "two"]);
    assert.equal(task.body, "Context");
});

test("serializeValue and parseValue are exact inverses", () => {
    const scalars = [
        "Plain title",
        'Sweep RSC: reducir la herencia laxa de "use client"',
        '"Totales" a cero en el 390',
        "Incluir los plazos en 'Sincronizar ahora'",
        "Validar Achievement::series con Assert\\Choice",
        "Casillas [62/63] y {74}",
        "Trailing quote in the middle isn't a quote\"",
        "#hash-leading",
        "a: b # c"
    ];
    for (const value of scalars) {
        const written = serializeValue("title", value);
        assert.equal(parseValue("title", written), value);
        // A second save must not drift: the file text has to stay byte-identical.
        assert.equal(
            serializeValue("title", parseValue("title", written)),
            written
        );
    }
    const lists = [
        ["apps/api/src/Billing", "packages/sdk"],
        ["one, with comma", 'quoted "tag"', "plain"]
    ];
    for (const value of lists) {
        const written = serializeValue("scope", value);
        assert.deepEqual(parseValue("scope", written), value);
        assert.equal(
            serializeValue("scope", parseValue("scope", written)),
            written
        );
    }
});

test("parseValue decodes the JSON escapes already stored in cards", () => {
    assert.equal(
        parseValue("title", '"Validar Achievement::series con Assert\\\\Choice"'),
        "Validar Achievement::series con Assert\\Choice"
    );
    assert.equal(
        parseValue("title", 'Distinguir 403 de \'sin avanzar\''),
        "Distinguir 403 de 'sin avanzar'"
    );
});

test("diagnoseBacklog accepts a valid card", async () => {
    const report = await diagnoseBacklog({
        cards: [valid],
        repoRoot: process.cwd(),
        checkPaths: false
    });
    assert.deepEqual(report.counts, { error: 0, warning: 0, info: 0 });
});

test("diagnoseBacklog catches duplicate ids and broken references", async () => {
    const report = await diagnoseBacklog({
        cards: [
            valid,
            {
                ...valid,
                file: "T-0001-duplicate.md",
                parent: "T-9999",
                depends: ["T-8888"]
            }
        ],
        repoRoot: process.cwd(),
        checkPaths: false
    });
    assert.ok(report.issues.some((entry) => entry.code === "duplicate-id"));
    assert.ok(report.issues.some((entry) => entry.code === "missing-parent"));
    assert.ok(
        report.issues.some((entry) => entry.code === "missing-dependency")
    );
});

test("diagnoseBacklog warns when done criteria remain unchecked", async () => {
    const report = await diagnoseBacklog({
        cards: [
            {
                ...valid,
                status: "done",
                body: "## Acceptance criteria\n\n- [ ] Verify the outcome"
            }
        ],
        repoRoot: process.cwd(),
        checkPaths: false
    });
    assert.equal(report.counts.warning, 1);
    assert.equal(report.issues[0].code, "done-unchecked");
});
