import assert from "node:assert/strict";
import test from "node:test";
import {
    mkdir,
    mkdtemp,
    readdir,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
    containedPath,
    discoverWorkspaceRoot,
    loadWorkspace,
    readMarkdownTree
} from "../dist/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "fixtures/workspace");

test("readMarkdownTree returns sorted relative paths and skips noise", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-tree-"));
    try {
        assert.deepEqual(await readMarkdownTree(join(root, "missing")), []);
        await mkdir(join(root, "architecture", "billing"), { recursive: true });
        await mkdir(join(root, "archive"), { recursive: true });
        await mkdir(join(root, ".cache"), { recursive: true });
        await writeFile(join(root, "root.md"), "root");
        await writeFile(join(root, "notes.txt"), "ignored");
        await writeFile(join(root, "architecture", "b.md"), "b");
        await writeFile(join(root, "architecture", "a.md"), "a");
        await writeFile(join(root, "architecture", "billing", "deep.md"), "deep");
        await writeFile(join(root, "archive", "old.md"), "old");
        await writeFile(join(root, ".cache", "cached.md"), "cached");
        await symlink(join(root, "root.md"), join(root, "link.md")).catch(
            () => undefined
        );

        assert.deepEqual(await readMarkdownTree(root), [
            "architecture/a.md",
            "architecture/b.md",
            "architecture/billing/deep.md",
            "archive/old.md",
            "root.md"
        ]);
        assert.deepEqual(
            await readMarkdownTree(root, { skip: [join(root, "archive")] }),
            [
                "architecture/a.md",
                "architecture/b.md",
                "architecture/billing/deep.md",
                "root.md"
            ]
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("containedPath is the single containment criterion", () => {
    const root = resolve("/tmp/workfile-contained");
    assert.equal(containedPath(root, "docs"), join(root, "docs"));
    assert.equal(containedPath(root, ""), root);
    assert.equal(containedPath(root, "docs/../guides"), join(root, "guides"));
    assert.equal(containedPath(root, "../outside"), null);
    assert.equal(containedPath(root, "docs/../../outside"), null);
    assert.equal(containedPath(root, "/etc/passwd"), null);
});

test("loadWorkspace resolves configured paths and runtime schema", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    assert.equal(workspace.config.name, "Golden workspace");
    assert.deepEqual(workspace.schema.cards.areas, ["api", "web", "infra", "docs"]);
    assert.equal(workspace.paths.cards, resolve(fixture, ".project/cards"));
    assert.equal(workspace.version.schemaVersion, 2);
});

test("workspace paths cannot escape the repository", async () => {
    const temporary = resolve(here, "fixtures/escape-workspace");
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    await writeFile(
        resolve(temporary, "project.config.mjs"),
        `export default { schemaVersion: 2, cards: { areas: ["api"], path: "../outside" } };\n`
    );
    await assert.rejects(
        () => loadWorkspace({ root: temporary }),
        /outside the workspace/
    );
    await rm(temporary, { recursive: true, force: true });
});

// Falling back to the working directory meant any command run outside a
// workspace quietly started a second one wherever it happened to be: the cards
// were written, `doctor` reported everything fine, and the work was invisible.
// A subagent with the wrong cwd loses it entirely.
test("a directory with no workspace marker is an error, not a new workspace", async () => {
    const empty = await mkdtemp(join(tmpdir(), "workfile-nowhere-"));
    try {
        assert.equal(await discoverWorkspaceRoot(empty), null);

        await assert.rejects(
            () => loadWorkspace({ cwd: empty }),
            (error) => {
                assert.equal(error.code, "WORKSPACE_NOT_FOUND");
                assert.equal(error.exitCode, 2);
                assert.match(error.message, /workfile init/);
                return true;
            }
        );

        // Nothing was written on the way out.
        assert.deepEqual(await readdir(empty), []);

        // Bootstrapping callers can still opt in explicitly.
        const permissive = await loadWorkspace({ cwd: empty, allowMissing: true });
        assert.equal(permissive.root, empty);
    } finally {
        await rm(empty, { recursive: true, force: true });
    }
});

test("the workspace is discovered from a nested working directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-nested-"));
    const nested = join(root, "apps", "api", "src");
    try {
        await mkdir(nested, { recursive: true });
        await writeFile(
            join(root, "project.config.mjs"),
            'export default { schemaVersion: 2, name: "Nested" };\n'
        );
        assert.equal(await discoverWorkspaceRoot(nested), root);
        const workspace = await loadWorkspace({ cwd: nested });
        assert.equal(workspace.root, root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
