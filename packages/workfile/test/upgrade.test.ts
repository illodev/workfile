import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkAgentInstructions,
    checkCiTemplates,
    checkClaudeSurface,
    loadWorkspace,
    runUpgrade,
    syncAgentInstructions,
    syncCiTemplates,
    syncClaudeSurface
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

test("every owned surface is stamped, not only the first one behind", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-upgrade-all-"));
    await cp(fixture, root, { recursive: true });
    // Ownership is what the command reads: the config for agents and CI, and
    // for the Claude surface the skill being on disk, since installing it is
    // the opt-in. The fixture owns agents alone — which is why the sibling
    // test proves the stamp on one surface and this one owns all three.
    await writeFile(
        join(root, "project.config.mjs"),
        `export default {
    schemaVersion: 2,
    name: "Every surface",
    ci: { enabled: true, targets: ["github"] }
};
`
    );
    const workspace = await loadWorkspace({ root });
    try {
        await syncAgentInstructions(workspace);
        await syncCiTemplates(workspace);
        await syncClaudeSurface(workspace);

        const owned = async () =>
            [
                ...(await checkAgentInstructions(workspace)).files,
                ...(await checkCiTemplates(workspace)).files,
                ...(await checkClaudeSurface(workspace)).files
            ].filter((file) => file.version);

        const stamped = await owned();
        // Guards every loop below: iterating a filtered array that came back
        // empty is how a test passes while proving nothing.
        assert.ok(stamped.length >= 5, `only ${stamped.length} stamped files`);

        for (const file of stamped) {
            const path = join(root, file.path);
            const text = await readFile(path, "utf8");
            await writeFile(
                path,
                text.replace(` version=${installed} `, " version=0.0.1 ")
            );
        }

        const applied = await runUpgrade(workspace);
        for (const id of ["agents", "ci", "claude"]) {
            assert.equal(
                surface(applied, id).status,
                "synced",
                `${id} was left behind`
            );
        }

        const after = await owned();
        assert.equal(after.length, stamped.length);
        for (const file of after) {
            assert.equal(
                file.version,
                installed,
                `${file.path} kept an old stamp`
            );
        }

        const settled = await runUpgrade(workspace);
        for (const id of ["agents", "ci", "claude"]) {
            assert.equal(surface(settled, id).status, "current");
        }
        assert.deepEqual(settled.orphans, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("upgrading with a binary the workspace does not have is reported", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        // No local copy is not a mismatch: this binary is the only one, and
        // the generated registration says `npx` for exactly that reason.
        const alone = await runUpgrade(workspace, { dryRun: true });
        assert.deepEqual(alone.binary, {
            running: installed,
            local: null,
            mismatched: false
        });

        // The shape the docs warn about and the update instructions produce:
        // `pnpm i -g @illodev/workfile` upgrading a workspace pinned to an
        // older release. The hooks and the MCP server run the pinned one.
        const packagePath = join(
            root,
            "node_modules",
            "@illodev",
            "workfile",
            "package.json"
        );
        await mkdir(join(root, "node_modules", "@illodev", "workfile"), {
            recursive: true
        });
        await writeFile(
            packagePath,
            `${JSON.stringify({ name: "@illodev/workfile", version: "0.0.1" }, null, 2)}\n`
        );
        const behind = await runUpgrade(workspace, { dryRun: true });
        assert.deepEqual(behind.binary, {
            running: installed,
            local: "0.0.1",
            mismatched: true
        });

        // Same version on both sides is the ordinary case and says nothing.
        await writeFile(
            packagePath,
            `${JSON.stringify({ name: "@illodev/workfile", version: installed }, null, 2)}\n`
        );
        const agreed = await runUpgrade(workspace, { dryRun: true });
        assert.equal(agreed.binary.mismatched, false);
        assert.equal(agreed.binary.local, installed);
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
