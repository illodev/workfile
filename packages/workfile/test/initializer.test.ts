import assert from "node:assert/strict";
import test from "node:test";
import {
    access,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import {
    applyInitialization,
    checkAgentInstructions,
    checkCiTemplates,
    loadIndexedDocuments,
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

        const repeated = await planInitialization(root, {});
        assert.ok(repeated.conflicts.includes(join(root, "project.config.mjs")));
        await assert.rejects(
            () => applyInitialization(repeated),
            (error) => error.code === "INIT_FILE_CONFLICT"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/** Every directory and file under `root`, relative and sorted. */
async function tree(root: string) {
    const dirs: string[] = [];
    const files: string[] = [];
    const walk = async (relative: string) => {
        for (const entry of await readdir(join(root, relative), {
            withFileTypes: true
        })) {
            const child = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                dirs.push(child);
                await walk(child);
            } else {
                files.push(child);
            }
        }
    };
    await walk("");
    return { dirs: dirs.sort(), files: files.sort() };
}

/**
 * The dry run is the one command whose entire purpose is to be accurate before
 * anything is written, and it was describing a smaller workspace than it made:
 * 14 directories against 19, 3 files against 9. `mkdir` creates the parents of
 * every path it is given, and the agent surface is written after the plan by a
 * different function.
 *
 * Counted against the filesystem rather than against a number in a fixture, so
 * a directory added to `init` fails this until the plan admits to it.
 */
test("the plan counts what init creates, not what it names", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "workfile-init-count-"));
    try {
        const plan = await planInitialization(root, {
            name: "Counted",
            areas: ["general"],
            agents: ["agents-md", "claude"],
            ci: ["github"]
        });
        await applyInitialization(plan);
        const made = await tree(root);

        t.diagnostic(
            `planned ${plan.summary.directories} directories and ${plan.summary.files} files; created ${made.dirs.length} and ${made.files.length}`
        );
        assert.equal(
            plan.summary.directories,
            made.dirs.length,
            `the plan promised ${plan.summary.directories} directories and init made ${made.dirs.length}: ${made.dirs.join(", ")}`
        );
        assert.equal(
            plan.summary.files,
            made.files.length,
            `the plan promised ${plan.summary.files} files and init wrote ${made.files.length}: ${made.files.join(", ")}`
        );

        // Not only the counts: the plan has to name the same paths, or it
        // agrees by arithmetic while describing a different workspace.
        const planned = plan.actions
            .filter((action) => action.type !== "directory")
            .map((action) => action.path.slice(root.length + 1).split(sep).join("/"))
            .sort();
        assert.deepEqual(planned, made.files);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The generated config indexed `.project/specs/**` and `init` created
 * `.project/sources`, so the directory a document was configured to live in
 * was missing and an empty one nobody was pointed at was present.
 */
test("a document dropped where init points is indexed with no further configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-init-specs-"));
    try {
        const plan = await planInitialization(root, { areas: ["general"] });
        await applyInitialization(plan);

        const configured = plan.config.docs.sources.filter((source) =>
            source.startsWith(".project/")
        );
        assert.ok(configured.length, "the config has to point somewhere inside the workspace");
        for (const source of configured) {
            const directory = source.slice(0, source.indexOf("/**"));
            assert.ok(
                await exists(join(root, directory)),
                `${source} is indexed but ${directory} is not created`
            );
        }

        await writeFile(
            join(root, ".project/specs/DOC-0001-placed.md"),
            [
                "---",
                "id: DOC-0001",
                "title: Placed where init said",
                "kind: reference",
                "status: draft",
                "created: 2026-08-05",
                "updated: 2026-08-05",
                "---",
                "",
                "Body.",
                ""
            ].join("\n")
        );
        const workspace = await loadWorkspace({ root });
        const { documents } = await loadIndexedDocuments(workspace);
        assert.deepEqual(
            documents.map((doc) => doc.id),
            ["DOC-0001"],
            "a document in the configured directory has to be found"
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
