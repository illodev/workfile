import assert from "node:assert/strict";
import test from "node:test";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    applyLegacyMigration,
    applySchemaMigration,
    inspectSchemaVersion,
    loadCards,
    loadWorkspace,
    planInitialization,
    planLegacyMigration,
    planSchemaMigration
} from "../dist/src/index.js";
import { SCHEMA_VERSION } from "../dist/src/config/defaults.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

function legacyCard(id, title, area = "api") {
    return `---\nid: ${id}\ntitle: ${title}\nstatus: backlog\ntype: task\npriority: medium\narea: ${area}\ncreated: 2026-07-28\nupdated: 2026-07-28\n---\n\nLegacy context.\n`;
}

test("legacy migration copies valid cards and preserves non-canonical sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-migration-"));
    await cp(fixture, root, { recursive: true });
    try {
        await mkdir(join(root, ".planning/backlog/tasks"), { recursive: true });
        await mkdir(join(root, ".planning/backlog/archive"), { recursive: true });
        await mkdir(join(root, ".planning/backlog/assets/T-0042"), {
            recursive: true
        });
        await mkdir(join(root, ".planning/proposals"), { recursive: true });
        await writeFile(
            join(root, ".planning/backlog/tasks/T-0042-portable.md"),
            legacyCard("T-0042", "Migrate portable card")
        );
        await writeFile(
            join(root, ".planning/backlog/archive/T-0043-closed.md"),
            legacyCard("T-0043", "Migrate archived card", "docs").replace(
                "status: backlog",
                "status: done"
            )
        );
        await writeFile(
            join(root, ".planning/backlog/assets/T-0042/proof.txt"),
            "proof"
        );
        await writeFile(
            join(root, ".planning/proposals/idea.md"),
            "# Legacy proposal\n"
        );
        await writeFile(
            join(root, ".planning/backlog/tasks/not-a-card.md"),
            "# Missing frontmatter\n"
        );

        const workspace = await loadWorkspace({ root });
        const plan = await planLegacyMigration(workspace);
        assert.equal(plan.counts.cards, 1);
        assert.equal(plan.counts.archivedCards, 1);
        assert.equal(plan.counts.assets, 1);
        assert.equal(plan.counts.sources, 2);
        assert.equal(plan.conflicts.length, 0);
        assert.ok(
            plan.warnings.some(
                (warning) => warning.code === "legacy-card-unparseable"
            )
        );

        const applied = await applyLegacyMigration(workspace, plan);
        assert.equal(applied.files.length, 5);
        const cards = await loadCards(workspace);
        assert.ok(cards.cards.some((card) => card.id === "T-0042" && !card.archived));
        assert.ok(cards.cards.some((card) => card.id === "T-0043" && card.archived));
        assert.equal(
            await readFile(join(root, ".project/assets/T-0042/proof.txt"), "utf8"),
            "proof"
        );
        assert.match(
            await readFile(
                join(root, ".project/sources/legacy-planning/proposals/idea.md"),
                "utf8"
            ),
            /Legacy proposal/
        );
        const state = JSON.parse(
            await readFile(
                join(root, ".project/migrations/legacy-planning.json"),
                "utf8"
            )
        );
        assert.equal(state.files.length, 5);

        const repeated = await planLegacyMigration(workspace);
        assert.equal(repeated.counts.identical, 5);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("legacy migration rejects destination conflicts unless forced", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-migration-conflict-"));
    await cp(fixture, root, { recursive: true });
    try {
        await mkdir(join(root, ".planning/backlog/tasks"), { recursive: true });
        await writeFile(
            join(root, ".planning/backlog/tasks/T-0001-different-name.md"),
            legacyCard("T-0001", "Different legacy task")
        );
        const workspace = await loadWorkspace({ root });
        const plan = await planLegacyMigration(workspace);
        assert.equal(plan.counts.conflicts, 1);
        await assert.rejects(
            () => applyLegacyMigration(workspace, plan),
            (error) => error.code === "MIGRATION_FILE_CONFLICT"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// `init` wrote `schemaVersion: 2` as a literal while the validator compared
// against the constant. On the day SCHEMA_VERSION moves, `workfile init` would
// throw on its own first line — generating a config its own validator rejects.
test("the initializer takes the schema version from the constant", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-schemaver-"));
    try {
        const plan = await planInitialization(root, { yes: true });
        const config = plan.actions.find((action) =>
            action.path.endsWith("project.config.mjs")
        );
        const version = plan.actions.find((action) =>
            action.path.endsWith("VERSION")
        );
        assert.match(
            config.content,
            new RegExp(`schemaVersion:\\s*${SCHEMA_VERSION}\\b`),
            "the generated config must declare the version the validator expects"
        );
        assert.equal(JSON.parse(version.content).schemaVersion, SCHEMA_VERSION);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// A workspace on an older schema used to fail every command with a message
// that only stated the mismatch, leaving hand-editing two files as the repair.
test("schema migration reports its state and names the repair", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-schemamig-"));
    try {
        await mkdir(join(root, ".project"), { recursive: true });
        await writeFile(
            join(root, "project.config.mjs"),
            `export default { schemaVersion: ${SCHEMA_VERSION}, name: "Versioned" };\n`
        );
        await writeFile(
            join(root, ".project", "VERSION"),
            JSON.stringify({ schemaVersion: SCHEMA_VERSION })
        );

        const workspace = await loadWorkspace({ root });
        const state = await inspectSchemaVersion(workspace);
        assert.equal(state.current, SCHEMA_VERSION);
        assert.equal(state.upToDate, true);
        assert.deepEqual(state.pending, []);

        // Nothing to do is not an error, and it writes nothing.
        const applied = await applySchemaMigration(workspace, {
            packageVersion: "test"
        });
        assert.deepEqual(applied.applied, []);
        assert.equal(
            JSON.parse(
                await readFile(join(root, ".project", "VERSION"), "utf8")
            ).upgradedWith,
            undefined
        );

        // A workspace ahead of the package is a different problem with a
        // different answer: upgrade the package, do not migrate the workspace.
        await writeFile(
            join(root, ".project", "VERSION"),
            JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5 })
        );
        await assert.rejects(
            () => planSchemaMigration(workspace),
            (error) => {
                assert.equal(error.code, "WORKSPACE_SCHEMA_AHEAD");
                assert.match(error.message, /Upgrade @illodev\/workfile/);
                return true;
            }
        );

        // And an older workspace is told exactly which command fixes it.
        await writeFile(
            join(root, ".project", "VERSION"),
            JSON.stringify({ schemaVersion: SCHEMA_VERSION - 1 })
        );
        await assert.rejects(
            () => loadWorkspace({ root }),
            (error) => {
                assert.equal(error.code, "CONFIG_SCHEMA_MISMATCH");
                assert.match(error.message, /workfile migrate schema/);
                return true;
            }
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
