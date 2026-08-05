import assert from "node:assert/strict";
import test from "node:test";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    archiveCard,
    createCard,
    diagnoseCards,
    loadCards,
    loadWorkspace,
    parseCard,
    patchCardBody
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

test("parseCard reads the restricted frontmatter format", () => {
    const card = parseCard(
        "T-0001-example.md",
        `---\nid: T-0001\ntitle: Example task\nstatus: backlog\ntype: task\npriority: medium\narea: api\ntags: [one, two]\ncreated: 2026-07-25\nupdated: 2026-07-25\n---\n\nContext`
    );
    assert.equal(card.id, "T-0001");
    assert.deepEqual(card.tags, ["one", "two"]);
    assert.equal(card.body, "Context");
});

test("doctor is configuration-driven and accepts valid golden cards", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const loaded = await loadCards(workspace);
    const report = await diagnoseCards({ ...loaded, workspace, checkPaths: false });
    assert.equal(report.counts.error, 0);
    assert.equal(report.cards, 2);
});

test("the nested card archive is loaded exactly once", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const { cards } = await loadCards(workspace);
    assert.equal(workspace.config.cards.archivePath, ".project/cards/archive");
    const archived = cards.filter((card) => card.id === "T-0002");
    assert.equal(archived.length, 1);
    assert.equal(archived[0].archived, true);
    assert.equal(archived[0].file, "T-0002-completed.md");
});

test("cards in subfolders load, validate and share the global sequence", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-card-tree-"));
    try {
        await cp(fixture, root, { recursive: true });
        await mkdir(join(root, ".project", "cards", "epics", "billing"), {
            recursive: true
        });
        await writeFile(
            join(
                root,
                ".project",
                "cards",
                "epics",
                "billing",
                "T-0009-nested.md"
            ),
            `---
id: T-0009
title: Nested epic
status: done
type: epic
priority: medium
area: api
created: 2026-07-25
updated: 2026-07-26
---

Grouped by hand in a folder.
`
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadCards(workspace);
        const nested = loaded.cards.find((card) => card.id === "T-0009");
        assert.ok(nested, "the nested card is loaded");
        assert.equal(nested.file, "epics/billing/T-0009-nested.md");
        assert.equal(nested.archived, false);

        const report = await diagnoseCards({
            ...loaded,
            workspace,
            checkPaths: false
        });
        assert.equal(report.counts.error, 0, JSON.stringify(report.issues));
        assert.equal(report.cards, 3);

        // Nested cards take part in the global sequence.
        const created = await createCard(workspace, {
            title: "After the nested epic",
            area: "api"
        });
        assert.equal(created.id, "T-0010");

        // Archiving keeps the folder and creates it on the archive side.
        const archived = await archiveCard(workspace, "T-0009");
        assert.equal(archived.card.file, "epics/billing/T-0009-nested.md");
        await access(
            join(
                root,
                ".project",
                "cards",
                "archive",
                "epics",
                "billing",
                "T-0009-nested.md"
            )
        );
        const after = await loadCards(workspace);
        const moved = after.cards.filter((card) => card.id === "T-0009");
        assert.equal(moved.length, 1);
        assert.equal(moved[0].archived, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("exclusive card creation resolves concurrent ID collisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const [first, second] = await Promise.all([
            createCard(workspace, { title: "Concurrent A", area: "api" }),
            createCard(workspace, { title: "Concurrent B", area: "web" })
        ]);
        assert.notEqual(first.id, second.id);
        assert.deepEqual(new Set([first.id, second.id]), new Set(["T-0003", "T-0004"]));
        const content = await readFile(first.path, "utf8");
        assert.match(content, new RegExp(`id: ${first.id}`));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The rule that would have caught T-0026 through T-0029 while they were still
// open. It is a warning rather than an error on purpose: a card is allowed to
// keep a checklist that was never a criterion, and failing `doctor` on a body
// that is correct costs more than the false positive does.
test("doctor reports a checklist no acceptance heading claimed", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-unreadable-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });

        const hidden = await createCard(workspace, { title: "Hidden criteria", area: "api" });
        await patchCardBody(workspace, hidden.id, {
            body: "## Acceptancia\n\n- [ ] Nobody can see this one\n- [x] This one is settled"
        });
        // Declares its region properly, and keeps a list elsewhere. Nothing is
        // wrong with it and it must stay quiet.
        const fine = await createCard(workspace, { title: "Both lists", area: "api" });
        await patchCardBody(workspace, fine.id, {
            body: [
                "## Plan",
                "",
                "- [ ] a step, which is not a criterion",
                "",
                "## Acceptance criteria",
                "",
                "- [ ] the real one"
            ].join("\n")
        });

        const loaded = await loadCards(workspace);
        const report = await diagnoseCards({ ...loaded, workspace, checkPaths: false });
        const found = report.issues.filter(
            (entry: any) => entry.code === "acceptance-unreadable"
        );
        assert.equal(found.length, 1);
        assert.equal(found[0].severity, "warning");
        assert.equal(found[0].id, hidden.id);
        assert.match(found[0].message, /Nobody can see this one/);
        // The settled box is not outstanding, so it is not reported.
        assert.doesNotMatch(found[0].message, /This one is settled/);
        assert.equal(report.counts.error, 0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
