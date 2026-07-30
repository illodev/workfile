import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    buildProjectIndex,
    createChangeFragment,
    createRelease,
    loadChangelog,
    loadWorkspace,
    patchChangeFragment,
    previewRelease,
    renderChangelog
} from "../dist/src/index.js";

async function makeWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "workfile-history-"));
    await mkdir(join(root, ".project", "cards", "archive"), { recursive: true });
    await mkdir(join(root, ".project", "docs"), { recursive: true });
    await mkdir(join(root, ".project", "changelog", "unreleased"), {
        recursive: true
    });
    await mkdir(join(root, ".project", "changelog", "releases"), {
        recursive: true
    });
    await writeFile(
        join(root, "project.config.mjs"),
        `export default {
            schemaVersion: 2,
            name: "History fixture",
            cards: { areas: ["billing", "infra"] },
            docs: { sources: ["README.md"] },
            changelog: { releaseStrategy: "semver" }
        };\n`
    );
    await writeFile(
        join(root, ".project", "VERSION"),
        `${JSON.stringify({ schemaVersion: 2 })}\n`
    );
    await writeFile(join(root, "README.md"), "# History fixture\n");
    await writeFile(
        join(root, ".project", "cards", "T-0001-fix-retries.md"),
        `---
id: T-0001
title: Fix retries
status: done
type: bug
priority: high
area: billing
created: 2026-07-01
updated: 2026-07-28
---

Fix duplicate retries.
`
    );
    return root;
}

test("Changelog fragments use collision-safe IDs and revision-aware patches", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const [first, second] = await Promise.all([
            createChangeFragment(workspace, {
                title: "Prevent duplicate invoice submissions",
                type: "fixed",
                area: "billing",
                visibility: "public",
                cards: ["T-0001"],
                body: "Retries now reuse the original invoice."
            }),
            createChangeFragment(workspace, {
                title: "Refactor release plumbing",
                type: "internal",
                area: "infra",
                visibility: "internal",
                body: "Internal cleanup."
            })
        ]);
        assert.deepEqual(
            [first.id, second.id].sort(),
            ["CHG-0001", "CHG-0002"]
        );
        const updated = await patchChangeFragment(
            workspace,
            first.id,
            { tags: ["billing", "retry"] },
            { expectedRevision: first.revision }
        );
        assert.deepEqual(updated.fragment.tags, ["billing", "retry"]);
        await assert.rejects(
            () =>
                patchChangeFragment(
                    workspace,
                    first.id,
                    { title: "Stale write" },
                    { expectedRevision: first.revision }
                ),
            (error) => error.code === "CHANGE_WRITE_CONFLICT"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Release creation consumes fragments and renders public history", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const publicChange = await createChangeFragment(workspace, {
            title: "Prevent duplicate invoice submissions",
            type: "fixed",
            area: "billing",
            visibility: "public",
            cards: ["T-0001"],
            body: "Retries now reuse the original invoice."
        });
        const internalChange = await createChangeFragment(workspace, {
            title: "Refactor release plumbing",
            type: "internal",
            area: "infra",
            visibility: "internal",
            body: "Internal cleanup."
        });
        const preview = await previewRelease(workspace);
        assert.equal(preview.fragments.length, 2);
        assert.match(preview.markdown, /### Fixed/);
        assert.match(preview.markdown, /### Internal/);

        const released = await createRelease(workspace, {
            version: "2.4.0",
            title: "Version 2.4.0",
            commit: "1a2b3c4",
            fragmentIds: [publicChange.id, internalChange.id],
            body: "A safer billing release."
        });
        assert.equal(released.release.id, "REL-0001");
        assert.deepEqual(released.release.fragments, ["CHG-0001", "CHG-0002"]);

        const loaded = await loadChangelog(workspace);
        assert.equal(loaded.releases.length, 1);
        assert.ok(loaded.fragments.every((fragment) => fragment.released));
        assert.ok(
            loaded.fragments.every((fragment) =>
                fragment.releaseIds.includes("REL-0001")
            )
        );
        const publicRendered = await renderChangelog(workspace, {
            visibility: "public"
        });
        assert.match(publicRendered, /Prevent duplicate invoice submissions/);
        assert.doesNotMatch(publicRendered, /Refactor release plumbing/);
        assert.match(publicRendered, /## 2\.4\.0 —/);

        const index = await buildProjectIndex(workspace, { diagnose: true });
        const release = index.byId.get("REL-0001");
        assert.deepEqual(
            release.outgoing.map((link) => link.id),
            ["CHG-0001", "CHG-0002"]
        );
        assert.equal(index.reports.changelog.counts.error, 0);
        const changelogPath = join(root, "CHANGELOG.md");
        await writeFile(changelogPath, publicRendered);
        assert.match(await readFile(changelogPath, "utf8"), /# Changelog/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Changelog doctor reports invalid references and release versions", async () => {
    const root = await makeWorkspace();
    try {
        await writeFile(
            join(root, ".project", "changelog", "unreleased", "CHG-0001-broken.md"),
            `---
id: CHG-0001
title: Broken fragment
type: fixed
area: billing
visibility: public
cards: [T-9999]
created: 2026-07-28
updated: 2026-07-28
---

Broken reference.
`
        );
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace, { diagnose: true });
        assert.ok(
            index.reports.changelog.issues.some(
                (issue) => issue.code === "change-missing-reference"
            )
        );
        await assert.rejects(
            () => createRelease(workspace, { version: "not-semver" }),
            (error) => error.code === "RELEASE_VERSION_INVALID"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("two releases cut the same day render newest-first", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        await createChangeFragment(workspace, {
            title: "First change",
            type: "fixed",
            area: "billing"
        });
        await createRelease(workspace, { version: "0.1.1", date: "2026-07-30" });
        await createChangeFragment(workspace, {
            title: "Second change",
            type: "added",
            area: "billing"
        });
        await createRelease(workspace, { version: "0.1.2", date: "2026-07-30" });

        const loaded = await loadChangelog(workspace);
        assert.deepEqual(
            loaded.releases.map((release) => release.version),
            ["0.1.2", "0.1.1"]
        );

        const rendered = await renderChangelog(workspace);
        assert.ok(
            rendered.indexOf("## 0.1.2") < rendered.indexOf("## 0.1.1"),
            "newest release must render first"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
