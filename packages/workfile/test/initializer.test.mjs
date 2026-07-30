import assert from "node:assert/strict";
import test from "node:test";
import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    applyInitialization,
    checkAgentInstructions,
    checkCiTemplates,
    loadWorkspace,
    planInitialization
} from "../dist/src/index.js";

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

test("initializer detects a monorepo and creates a portable workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-init-"));
    try {
        await mkdir(join(root, "apps/api"), { recursive: true });
        await mkdir(join(root, "apps/web"), { recursive: true });
        await mkdir(join(root, "packages/sdk"), { recursive: true });
        await mkdir(join(root, "docs"), { recursive: true });
        await mkdir(join(root, ".github/workflows"), { recursive: true });
        await writeFile(
            join(root, "package.json"),
            `${JSON.stringify({ name: "@acme/portable", scripts: { test: "node --test" } }, null, 2)}\n`
        );
        await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
        await writeFile(join(root, "README.md"), "# Portable\n");

        const plan = await planInitialization(root, {
            language: "es",
            agents: ["agents-md", "cursor"],
            ci: ["github"]
        });
        assert.equal(plan.detected.packageManager, "pnpm");
        assert.equal(plan.detected.monorepo, true);
        assert.deepEqual(plan.config.cards.areas, ["api", "web", "sdk", "docs"]);
        assert.ok(plan.config.docs.sources.includes("apps/*/README.md"));
        assert.equal(plan.conflicts.length, 0);

        const applied = await applyInitialization(plan);
        assert.equal(applied.dryRun, false);
        assert.ok(await exists(join(root, ".project/VERSION")));
        assert.ok(await exists(join(root, ".project/agents/protocol.md")));
        assert.ok(await exists(join(root, "AGENTS.md")));
        assert.ok(
            await exists(join(root, ".cursor/rules/workfile.mdc"))
        );
        assert.ok(
            await exists(join(root, ".github/workflows/workfile.yml"))
        );
        const config = await readFile(join(root, "project.config.mjs"), "utf8");
        assert.doesNotMatch(config, /@illodev\/workfile/);
        assert.match(config, /name: "portable"/);
        const packageJson = JSON.parse(
            await readFile(join(root, "package.json"), "utf8")
        );
        assert.equal(packageJson.scripts.project, "workfile ui");
        assert.equal(packageJson.scripts["project:agents"], "workfile agents sync");
        assert.match(await readFile(join(root, ".gitignore"), "utf8"), /\.project\/\.cache\//);

        const workspace = await loadWorkspace({ root });
        assert.equal((await checkAgentInstructions(workspace)).ok, true);
        assert.equal((await checkCiTemplates(workspace)).ok, true);

        const repeated = await planInitialization(root, { language: "es" });
        assert.ok(repeated.conflicts.includes(join(root, "project.config.mjs")));
        await assert.rejects(
            () => applyInitialization(repeated),
            (error) => error.code === "INIT_FILE_CONFLICT"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("initializer dry runs without writing canonical files", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-init-dry-"));
    try {
        const plan = await planInitialization(root, {
            name: "Dry run",
            areas: ["general"],
            agents: ["agents-md"],
            ci: []
        });
        const result = await applyInitialization(plan, { dryRun: true });
        assert.equal(result.dryRun, true);
        assert.equal(await exists(join(root, "project.config.mjs")), false);
        assert.equal(await exists(join(root, ".project/VERSION")), false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
