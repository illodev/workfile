import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    loadCards,
    loadChangelog,
    loadDocuments,
    loadMemory,
    loadWorkspace,
    runDoctor
} from "../dist/src/index.js";

/**
 * `id` is the field the loaders sort on, so a record that carries none used to
 * throw a `TypeError` out of `Array.sort` — after every file had been read,
 * taking down `doctor`, the server and every CLI command with a stack trace
 * that named neither the file nor the field. These check the refusal that
 * replaced it: per record, under `unreadable`, with the rest still loading.
 */

/** `unreadable` carries the path as the loader built it, and on Windows that
 * has backslashes. Every assertion here is about which file, not about which
 * separator. */
function posix(value) {
    return String(value).replaceAll("\\", "/");
}

async function makeWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "workfile-missing-id-"));
    await mkdir(join(root, ".project", "cards", "archive"), { recursive: true });
    await mkdir(join(root, ".project", "docs"), { recursive: true });
    await mkdir(join(root, ".project", "changelog", "unreleased"), {
        recursive: true
    });
    await mkdir(join(root, ".project", "changelog", "releases", "0-1-0"), {
        recursive: true
    });
    await mkdir(join(root, ".project", "memory", "learnings"), {
        recursive: true
    });
    await writeFile(
        join(root, "project.config.mjs"),
        `export default {
            schemaVersion: 2,
            name: "Missing id fixture",
            cards: { areas: ["api", "infra"] },
            docs: { sources: ["README.md"] }
        };\n`
    );
    await writeFile(
        join(root, ".project", "VERSION"),
        `${JSON.stringify({ schemaVersion: 2 })}\n`
    );
    await writeFile(join(root, "README.md"), "# Missing id fixture\n");
    await writeFile(
        join(root, ".project", "cards", "T-0001-ship-it.md"),
        `---
id: T-0001
title: Ship it
status: done
type: task
priority: high
area: api
created: 2026-08-01
updated: 2026-08-02
---

Body.
`
    );

    await writeFile(
        join(root, ".project", "changelog", "unreleased", "CHG-0002-readable.md"),
        `---
id: CHG-0002
title: Readable fragment
type: fixed
area: api
visibility: public
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );
    // The hand edit this exists for: a fragment copied from another repository
    // with everything but the `id:` line kept.
    await writeFile(
        join(root, ".project", "changelog", "unreleased", "CHG-0003-no-id.md"),
        `---
title: Fragment with no id
type: fixed
area: api
visibility: public
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );
    await writeFile(
        join(root, ".project", "changelog", "releases", "0-1-0", "REL-0001-0-1-0.md"),
        `---
id: REL-0001
title: Version 0.1.0
version: 0.1.0
date: 2026-08-01
fragments: [CHG-0001]
---

Body.
`
    );
    await writeFile(
        join(root, ".project", "changelog", "releases", "0-1-0", "REL-no-id.md"),
        `---
title: Release with no id
version: 0.1.1
date: 2026-08-01
fragments: [CHG-0001]
---

Body.
`
    );

    await writeFile(
        join(root, ".project", "memory", "learnings", "LRN-0001-readable.md"),
        `---
id: LRN-0001
title: Readable learning
status: active
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );
    await writeFile(
        join(root, ".project", "memory", "learnings", "LRN-0002-no-id.md"),
        `---
title: Learning with no id
status: active
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );
    // A bare `id:` with nothing after it parses to no key at all, which is the
    // shape a half-finished hand edit actually leaves behind.
    await writeFile(
        join(root, ".project", "memory", "learnings", "LRN-0003-blank-id.md"),
        `---
id:
title: Learning with a blank id
status: active
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );

    await writeFile(
        join(root, ".project", "docs", "DOC-0001-no-id.md"),
        `---
title: Managed document with no id
kind: reference
status: draft
created: 2026-08-01
updated: 2026-08-01
---

Body.
`
    );
    return root;
}

test("A changelog record with no id is unreadable, not fatal", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const loaded = await loadChangelog(workspace);

        assert.deepEqual(
            loaded.fragments.map((fragment) => fragment.id),
            ["CHG-0002"]
        );
        assert.deepEqual(
            loaded.releases.map((release) => release.id),
            ["REL-0001"]
        );

        const unreadable = loaded.unreadable.map((entry) => posix(entry.file));
        assert.deepEqual(unreadable.sort(), [
            ".project/changelog/releases/0-1-0/REL-no-id.md",
            ".project/changelog/unreleased/CHG-0003-no-id.md"
        ]);
        // The reason names the field and the file, which is what the stack
        // trace never did.
        for (const entry of loaded.unreadable) {
            assert.match(posix(entry.reason), /has no id: \.project\//);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("A memory record with no id is unreadable, not fatal", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const loaded = await loadMemory(workspace);

        assert.deepEqual(
            loaded.records.map((record) => record.id),
            ["LRN-0001"]
        );
        assert.deepEqual(
            loaded.unreadable.map((entry) => posix(entry.file)).sort(),
            [
                ".project/memory/learnings/LRN-0002-no-id.md",
                ".project/memory/learnings/LRN-0003-blank-id.md"
            ]
        );
        for (const entry of loaded.unreadable) {
            assert.match(posix(entry.reason), /Memory record has no id: \.project\//);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("A document with no id keeps the id derived from its path", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const loaded = await loadDocuments(workspace);

        // Documents are indexed as well as authored, so most of them never
        // carry frontmatter at all: `normalizeDocument` derives an id from the
        // path and `loadDocuments` sorts on the path, which is why this module
        // never had the hole the other two did. Asserted rather than assumed —
        // a later change to either would reopen it silently.
        assert.deepEqual(loaded.unreadable, []);
        const document = loaded.documents.find((candidate) =>
            candidate.path.endsWith("DOC-0001-no-id.md")
        );
        assert.ok(document, "the id-less document still loads");
        assert.match(document.id, /^PATH-[0-9A-F]{12}$/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("doctor reports records with no id instead of exiting on a stack trace", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const report = await runDoctor(workspace, { checkPaths: false });

        assert.equal(report.ok, false);
        const missing = report.issues.filter((issue) =>
            [
                "unreadable-changelog-record",
                "unreadable-memory-record"
            ].includes(issue.code)
        );
        assert.deepEqual(
            missing.map((issue) => posix(issue.file)).sort(),
            [
                ".project/changelog/releases/0-1-0/REL-no-id.md",
                ".project/changelog/unreleased/CHG-0003-no-id.md",
                ".project/memory/learnings/LRN-0002-no-id.md",
                ".project/memory/learnings/LRN-0003-blank-id.md"
            ]
        );
        for (const issue of missing) assert.equal(issue.severity, "error");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The fourth module, which T-0204 could not reach: `loadCardDirectory` treated
// a card with no `id:` as a perfectly good card, and `buildProjectIndex` sorts
// every record on `id`, so it threw in exactly the same place.
test("A card with no id is unreadable, not fatal", async () => {
    const root = await makeWorkspace();
    try {
        await writeFile(
            join(root, ".project", "cards", "T-0900-nameless.md"),
            [
                "---",
                "title: A card whose id line was eaten by a merge",
                "status: backlog",
                "type: task",
                "priority: medium",
                "area: api",
                "created: 2026-08-06",
                "updated: 2026-08-06",
                "---",
                "",
                "Body.",
                ""
            ].join("\n")
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadCards(workspace);

        // The rest of the directory still loads.
        assert.ok(loaded.cards.length >= 1, "the good cards are still there");
        assert.ok(
            loaded.cards.every((card) => typeof card.id === "string" && card.id),
            "no card without an id reaches a caller"
        );
        const refused = loaded.unreadable.find((entry) =>
            posix(entry.file).includes("T-0900-nameless.md")
        );
        assert.ok(refused, "the card with no id is reported as unreadable");
        assert.match(refused.reason, /no id/i);

        // And the whole thing that used to fall over now answers.
        const report = await runDoctor(workspace);
        assert.equal(typeof report.ok, "boolean");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// An empty `id:` is the other half of the same shape and sorts no better.
test("A card whose id is blank is refused the same way", async () => {
    const root = await makeWorkspace();
    try {
        await writeFile(
            join(root, ".project", "cards", "T-0901-blank.md"),
            [
                "---",
                'id: ""',
                "title: A card with an empty id",
                "status: backlog",
                "type: task",
                "priority: medium",
                "area: api",
                "created: 2026-08-06",
                "updated: 2026-08-06",
                "---",
                "",
                "Body.",
                ""
            ].join("\n")
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadCards(workspace);
        assert.ok(
            loaded.unreadable.some((entry) =>
                posix(entry.file).includes("T-0901-blank.md")
            ),
            "an empty id is refused too"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
