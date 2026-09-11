import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkAgentInstructions,
    checkCiTemplates,
    checkClaudeSurface,
    checkForUpdate,
    compareVersions,
    loadWorkspace,
    runUpgrade,
    syncAgentInstructions,
    syncCiTemplates,
    syncClaudeSurface,
    upgradeHint,
    UPDATE_CHECK_TTL_MS,
    UPDATE_RETRY_MS
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

/**
 * Nothing told a workspace the package itself was behind. The installed
 * version was only ever compared against the stamps inside the workspace, so a
 * repository could sit two releases behind with every check green (T-0208).
 *
 * Where the check runs was decided, not assumed: `upgrade` and the footer, and
 * nowhere else. So the test is about what a check that must never fail a
 * command does at its edges — the cache, the wire going away, a registry that
 * answers nonsense, and the switch — rather than about the happy path alone.
 */
test("the registry is asked once a day, and never when it cannot be", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        const calls: string[] = [];
        const registry = "https://registry.example.test";
        const answering =
            (version: string | null, ok = true) =>
            async (url: string) => {
                calls.push(url);
                return { ok, json: async () => (version ? { version } : {}) } as any;
            };
        const t0 = new Date("2026-09-11T12:00:00Z");
        const at = (offsetMs: number) => new Date(t0.getTime() + offsetMs);
        const ask = (now: Date, fetch, extra = {}) =>
            checkForUpdate(workspace, {
                now,
                fetch,
                installed: "0.12.0",
                registry,
                ...extra
            });
        const listing = async () =>
            (await readdir(join(root, ".project"), { recursive: true }))
                .map(String)
                .filter((path) => !path.replaceAll("\\", "/").startsWith(".cache"))
                .sort();
        const recordsBefore = await listing();

        // Behind, from the wire: one GET for the latest manifest and nothing else.
        const behind = await ask(t0, answering("9.9.9"));
        assert.equal(behind.status, "behind");
        assert.equal(behind.latest, "9.9.9");
        assert.equal(behind.source, "registry");
        assert.deepEqual(calls, [`${registry}/@illodev%2Fworkfile/latest`]);
        assert.equal(
            behind.nextCheckAt,
            at(UPDATE_CHECK_TTL_MS).toISOString(),
            "the interval is stated, not implied"
        );

        // The cache lives under the gitignored cache directory and touches no record.
        const cached = JSON.parse(
            await readFile(join(root, ".project/.cache/update-check.json"), "utf8")
        );
        assert.equal(cached.latest, "9.9.9");
        assert.deepEqual(await listing(), recordsBefore, "nothing under .project but the cache changed");

        // Within the day the registry is not asked again, whatever it would say now.
        const later = await ask(at(60 * 60_000), answering("0.0.1"));
        assert.equal(later.source, "cache");
        assert.equal(later.latest, "9.9.9");
        assert.equal(calls.length, 1);

        // Past the day it is, and a matching version is `current`.
        const nextDay = await ask(at(UPDATE_CHECK_TTL_MS + 1), answering("0.12.0"));
        assert.equal(nextDay.status, "current");
        assert.equal(calls.length, 2);

        // A different registry is a different question: the cache does not answer it.
        const mirror = await ask(at(UPDATE_CHECK_TTL_MS + 2), answering("0.12.0"), {
            registry: "https://mirror.example.test"
        });
        assert.equal(mirror.source, "registry");
        assert.equal(calls.length, 3);

        // The wire goes away: `unknown`, nothing thrown, and the failure is
        // itself cached — for an hour, not a day — so an offline machine pays
        // the timeout once rather than on every command.
        const offlineAt = at(2 * UPDATE_CHECK_TTL_MS);
        const offline = await ask(offlineAt, async () => {
            throw new Error("getaddrinfo ENOTFOUND registry.example.test");
        });
        assert.equal(offline.status, "unknown");
        assert.equal(offline.latest, null);
        assert.equal(
            offline.nextCheckAt,
            new Date(offlineAt.getTime() + UPDATE_RETRY_MS).toISOString()
        );
        const stillOffline = await ask(
            new Date(offlineAt.getTime() + UPDATE_RETRY_MS / 2),
            answering("9.9.9")
        );
        assert.equal(stillOffline.status, "unknown");
        assert.equal(stillOffline.source, "cache");
        assert.equal(calls.length, 3, "a cached failure asks nothing");
        const backOnline = await ask(
            new Date(offlineAt.getTime() + UPDATE_RETRY_MS + 1),
            answering("9.9.9")
        );
        assert.equal(backOnline.status, "behind");
        assert.equal(calls.length, 4);

        // A registry that answers anything but a version is no answer. Past
        // the day `backOnline` bought, or the cache would answer first.
        const garbageAt = at(4 * UPDATE_CHECK_TTL_MS);
        assert.equal((await ask(garbageAt, answering("latest"))).status, "unknown");
        assert.equal(
            (
                await ask(
                    new Date(garbageAt.getTime() + UPDATE_RETRY_MS + 1),
                    answering(null, false)
                )
            ).status,
            "unknown",
            "a 404 is no answer either"
        );

        // A development build past the registry is `ahead`, not `behind`.
        const ahead = await ask(at(5 * UPDATE_CHECK_TTL_MS), answering("0.12.0"), {
            installed: "0.13.0-dev.1"
        });
        assert.equal(ahead.status, "ahead");

        // The switch removes the request, not the message.
        const before = calls.length;
        const off = await checkForUpdate(
            { ...workspace, config: { ...workspace.config, upgrade: { check: false } } },
            { now: at(6 * UPDATE_CHECK_TTL_MS), fetch: answering("9.9.9"), installed: "0.12.0", registry }
        );
        assert.equal(off.status, "disabled");
        assert.equal(off.source, "config");
        assert.equal(calls.length, before, "off means no request");

        // `upgrade` carries the answer, asked alongside the surfaces.
        const result = await runUpgrade(workspace, {
            dryRun: true,
            updateCheck: {
                now: at(7 * UPDATE_CHECK_TTL_MS),
                fetch: answering("9.9.9"),
                installed: "0.12.0",
                registry
            }
        });
        assert.equal(result.update.status, "behind");
        assert.equal(result.update.latest, "9.9.9");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("versions compare the way `behind` needs, and the hint names the manager in use", () => {
    assert.equal(compareVersions("0.12.0", "0.13.0"), -1);
    assert.equal(compareVersions("0.13.0", "0.12.0"), 1);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
    assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
    assert.equal(compareVersions("1.0.0-rc.1", "1.0.0"), -1, "a prerelease sorts under its release");
    assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
    assert.equal(compareVersions("0.9.9", "0.10.0"), -1, "numeric, not lexical");
    assert.equal(compareVersions("latest", "1.0.0"), null, "not a version is not an answer");
    assert.equal(compareVersions("1.2", "1.2.0"), null);

    assert.match(upgradeHint("pnpm"), /^pnpm add -D @illodev\/workfile@latest, then run `workfile upgrade` again$/);
    assert.match(upgradeHint("yarn"), /^yarn add -D /);
    assert.match(upgradeHint("bun"), /^bun add -d /);
    assert.match(upgradeHint("npm"), /^npm install -D /);
    assert.match(upgradeHint("something-else"), /^npm install -D /);
    assert.match(
        upgradeHint("pnpm", { local: false }),
        /^npm install -g @illodev\/workfile@latest/,
        "a workspace with no local copy runs the global binary, so that is what it updates"
    );
});
