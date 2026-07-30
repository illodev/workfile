import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkAgentInstructions,
    loadWorkspace,
    runUpgrade,
    syncAgentInstructions,
    syncCiTemplates
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);
const installed = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
).version;

async function makeWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "workfile-upgrade-"));
    await cp(fixture, root, { recursive: true });
    return { root, workspace: await loadWorkspace({ root }) };
}

function surface(result, id) {
    return result.surfaces.find((entry) => entry.id === id);
}

test("a current-but-stale stamp is exactly what upgrade resyncs", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        await syncAgentInstructions(workspace);
        const agentsPath = join(root, "AGENTS.md");
        const synced = await readFile(agentsPath, "utf8");
        await writeFile(
            agentsPath,
            synced.replace(` version=${installed} `, " version=0.0.1 ")
        );

        // The staleness check deliberately ignores the stamp — this is the
        // gap the command exists for.
        const check = await checkAgentInstructions(workspace);
        assert.equal(check.ok, true);

        const planned = await runUpgrade(workspace, { dryRun: true });
        assert.equal(surface(planned, "agents").status, "would-sync");
        assert.match(await readFile(agentsPath, "utf8"), / version=0\.0\.1 /);

        const applied = await runUpgrade(workspace);
        assert.equal(surface(applied, "agents").status, "synced");
        assert.match(
            await readFile(agentsPath, "utf8"),
            new RegExp(` version=${installed.replaceAll(".", "\\.")} `)
        );
        assert.equal(surface(applied, "ci").status, "disabled");
        assert.equal(surface(applied, "claude").status, "not-installed");

        const settled = await runUpgrade(workspace);
        assert.equal(surface(settled, "agents").status, "current");
        assert.deepEqual(settled.orphans, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("managed blocks no target owns are reported, not skipped", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        await syncAgentInstructions(workspace);
        // Surfaces written by explicit targets the config never adopted —
        // exactly how an adapter block fossilizes.
        await syncAgentInstructions(workspace, { targets: ["claude"] });
        await syncCiTemplates(workspace, { targets: ["github"] });

        const result = await runUpgrade(workspace);
        const orphans = result.orphans.map(({ surface: s, target, file }) => ({
            surface: s,
            target,
            file
        }));
        assert.deepEqual(orphans, [
            { surface: "agents", target: "claude", file: "CLAUDE.md" },
            {
                surface: "ci",
                target: "github",
                file: ".github/workflows/workfile.yml"
            }
        ]);
        for (const orphan of result.orphans) {
            assert.equal(orphan.version, installed);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
