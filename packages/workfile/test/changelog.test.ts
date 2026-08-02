import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    buildProjectIndex,
    createChangeFragment,
    amendRelease,
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

/**
 * A release used to be writable exactly once, and never again.
 *
 * 0.2.0 was cut dated a day ahead of UTC — correct where the maintainer was
 * standing — and `doctor` flagged `release-date-in-future` on a record no
 * command could reach: `changelog patch` sees unreleased fragments only. The
 * recovery was `git checkout` over the cut and a second release, which works
 * while the cut is uncommitted and while an operator is holding the
 * repository. Neither is true of an agent following the protocol.
 *
 * The newest release only. History that can be rewritten anywhere is a weaker
 * record, and the case this serves is the minutes after a cut. Ordered by
 * allocation rather than by date, because the date is the field most likely to
 * be the thing being corrected.
 */
test("the newest release can be corrected, and nothing behind it can", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        await createChangeFragment(workspace, {
            title: "First",
            type: "fixed",
            area: "billing"
        });
        const first = await createRelease(workspace, {
            version: "1.0.0",
            date: "2026-08-09"
        });

        const fixed = await amendRelease(workspace, "1.0.0", {
            date: "2026-08-01"
        });
        assert.equal(fixed.release.date, "2026-08-01");
        // Amending one field must not disturb the others: an earlier draft
        // spread `{ title: option("--title") }` with no `--title` given, and
        // `patchFrontmatter` reads an explicit empty as a removal, so redating
        // a release deleted its title and left a record failing `doctor` on a
        // rule the amendment itself introduced.
        assert.equal(fixed.release.title, first.release.title);
        assert.deepEqual(fixed.release.fragments, first.release.fragments);
        assert.equal(fixed.release.version, "1.0.0");

        await assert.rejects(
            amendRelease(workspace, "1.0.0", { version: "1.0.1" }),
            (error: any) => {
                assert.equal(error.code, "RELEASE_FIELD_NOT_AMENDABLE");
                return true;
            }
        );
        await assert.rejects(
            amendRelease(workspace, "1.0.0", {}),
            (error: any) => {
                assert.equal(error.code, "RELEASE_AMEND_EMPTY");
                return true;
            }
        );
        await assert.rejects(
            amendRelease(workspace, "9.9.9", { date: "2026-08-01" }),
            (error: any) => {
                assert.equal(error.code, "RELEASE_NOT_FOUND");
                return true;
            }
        );

        // Once something follows it, the record is settled.
        await createChangeFragment(workspace, {
            title: "Second",
            type: "fixed",
            area: "billing"
        });
        await createRelease(workspace, { version: "1.1.0" });
        await assert.rejects(
            amendRelease(workspace, "1.0.0", { date: "2026-01-01" }),
            (error: any) => {
                assert.equal(error.code, "RELEASE_NOT_AMENDABLE");
                assert.match(error.message, /1\.1\.0/);
                return true;
            }
        );
        const newest = await amendRelease(workspace, "1.1.0", {
            title: "Version 1.1.0 (hotfix)"
        });
        assert.equal(newest.release.title, "Version 1.1.0 (hotfix)");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * "Not found" was the answer to four different questions.
 *
 * `changelog patch REL-0010` reported `CHANGE_FRAGMENT_NOT_FOUND` for a record
 * sitting in the tree, sending the caller to look for a missing file when what
 * they had done was aim a fragment command at a release. A fragment already
 * cut into a version got the same answer, which reads as data loss rather than
 * as the freeze it is.
 */
test("a fragment command aimed at a release says so", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const fragment = await createChangeFragment(workspace, {
            title: "Cut into a version",
            type: "fixed",
            area: "billing"
        });
        const release = await createRelease(workspace, { version: "1.0.0" });

        for (const id of [release.release.id, "1.0.0"]) {
            await assert.rejects(
                patchChangeFragment(workspace, id, { title: "no" }),
                (error: any) => {
                    assert.equal(error.code, "CHANGE_RECORD_NOT_A_FRAGMENT");
                    assert.match(error.message, /1\.0\.0/);
                    return true;
                },
                `${id} was not recognised as a release`
            );
        }

        await assert.rejects(
            patchChangeFragment(workspace, fragment.id, { title: "no" }),
            (error: any) => {
                assert.equal(error.code, "CHANGE_FRAGMENT_RELEASED");
                assert.match(error.message, /1\.0\.0/);
                return true;
            }
        );

        await assert.rejects(
            patchChangeFragment(workspace, "CHG-9999", { title: "no" }),
            (error: any) => {
                assert.equal(error.code, "CHANGE_FRAGMENT_NOT_FOUND");
                return true;
            }
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
