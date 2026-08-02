import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const script = join(repoRoot, "scripts/sync-workspace-versions.ts");

test("workspace packages stay version-locked to the root", async () => {
    // The same check the release workflow runs; failing here stops the drift
    // at the commit that introduced it instead of at tag time.
    await assert.doesNotReject(() =>
        execute(
            process.execPath,
            ["./scripts/sync-workspace-versions.ts", "--check"],
            { cwd: repoRoot }
        )
    );
});

/**
 * `npm version` commits `package.json` plus whatever the `version` hook
 * staged, and the hook used to name the files itself. That list was already
 * wrong: this script also rewrites `server.json`, so a bump left it modified
 * and uncommitted, and the tag pointed at a tree stating two versions.
 *
 * Caught by the release workflow rather than published — but after the tag is
 * cut and pushed, which is the expensive place to find it. Exercised against a
 * throwaway repository because the alternative is running `npm version` for
 * real. [[T-0131]]
 */
test("a bump stages every file it rewrites, not only the packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-version-"));
    try {
        await execute("git", ["init", "-q"], { cwd: root });
        await mkdir(join(root, "packages/thing"), { recursive: true });
        await writeFile(
            join(root, "package.json"),
            JSON.stringify({ name: "root", version: "9.9.9" }, null, 4)
        );
        await writeFile(
            join(root, "packages/thing/package.json"),
            JSON.stringify({ name: "thing", version: "0.0.1" }, null, 4)
        );
        await writeFile(
            join(root, "server.json"),
            JSON.stringify(
                { version: "0.0.1", packages: [{ version: "0.0.1" }] },
                null,
                4
            )
        );
        await mkdir(join(root, ".claude-plugin"), { recursive: true });
        await writeFile(
            join(root, ".claude-plugin/marketplace.json"),
            JSON.stringify({ plugins: [{ version: "0.0.1" }] }, null, 2)
        );

        await execute(process.execPath, [script, "--stage"], { cwd: root });

        const { stdout } = await execute(
            "git",
            ["diff", "--cached", "--name-only"],
            { cwd: root }
        );
        assert.deepEqual(
            stdout.split("\n").filter(Boolean).sort(),
            [
                ".claude-plugin/marketplace.json",
                "packages/thing/package.json",
                "server.json"
            ],
            "a file this script rewrites and does not stage rides out of the release commit"
        );
        // Both statements in server.json, not only the first.
        const manifest = JSON.parse(
            await readFile(join(root, "server.json"), "utf8")
        );
        assert.equal(manifest.version, "9.9.9");
        assert.equal(manifest.packages[0].version, "9.9.9");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The two plugin manifests state the version outside `packages/*`. Until
 * T-0132 they were stamped by `build-plugin`, which runs under `check` — so
 * the version moved as a side effect of testing, and nothing verified what was
 * committed. At 0.3.0 the marketplace shipped a version behind and no step
 * failed.
 */
test("drift in the plugin manifests is a check failure, and repairable", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-version-"));
    try {
        await mkdir(join(root, ".claude-plugin"), { recursive: true });
        await mkdir(join(root, "plugins/workfile/.claude-plugin"), {
            recursive: true
        });
        await writeFile(
            join(root, "package.json"),
            JSON.stringify({ name: "root", version: "9.9.9" }, null, 4)
        );
        await writeFile(
            join(root, ".claude-plugin/marketplace.json"),
            JSON.stringify(
                { name: "illodev", plugins: [{ name: "w", version: "0.0.1" }] },
                null,
                2
            )
        );
        await writeFile(
            join(root, "plugins/workfile/.claude-plugin/plugin.json"),
            JSON.stringify({ name: "w", version: "0.0.1" }, null, 2)
        );

        const refused = await execute(process.execPath, [script, "--check"], {
            cwd: root
        }).then(
            () => null,
            (error: { code: number; stderr: string }) => error
        );
        assert.ok(refused, "drifted manifests should fail the check");
        assert.equal(refused.code, 1);
        for (const named of ["marketplace.json", "plugin.json"]) {
            assert.match(
                refused.stderr,
                new RegExp(named),
                `the check should name ${named}`
            );
        }

        await execute(process.execPath, [script], { cwd: root });
        const marketplace = JSON.parse(
            await readFile(join(root, ".claude-plugin/marketplace.json"), "utf8")
        );
        const plugin = JSON.parse(
            await readFile(
                join(root, "plugins/workfile/.claude-plugin/plugin.json"),
                "utf8"
            )
        );
        assert.equal(marketplace.plugins[0].version, "9.9.9");
        assert.equal(plugin.version, "9.9.9");
        await assert.doesNotReject(() =>
            execute(process.execPath, [script, "--check"], { cwd: root })
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The manifest checks used to be reachable only through a `readdir` that has
 * nothing to do with them: a repository without `packages/` exited 0 before
 * reaching them, so drift passed as success.
 */
test("a repository with no packages still has its manifests checked", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-version-"));
    try {
        await writeFile(
            join(root, "package.json"),
            JSON.stringify({ name: "root", version: "9.9.9" }, null, 4)
        );
        await writeFile(
            join(root, "server.json"),
            JSON.stringify({ version: "0.0.1" }, null, 4)
        );
        const refused = await execute(process.execPath, [script, "--check"], {
            cwd: root
        }).then(
            () => null,
            (error: { code: number }) => error
        );
        assert.ok(refused, "no packages/ is not the same as nothing to check");
        assert.equal(refused.code, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/** Staging is the hook's business; a maintainer aligning versions by hand
 *  should get the edits and an untouched index. */
test("aligning versions by hand does not write the index", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-version-"));
    try {
        await execute("git", ["init", "-q"], { cwd: root });
        await mkdir(join(root, "packages/thing"), { recursive: true });
        await writeFile(
            join(root, "package.json"),
            JSON.stringify({ name: "root", version: "9.9.9" }, null, 4)
        );
        await writeFile(
            join(root, "packages/thing/package.json"),
            JSON.stringify({ name: "thing", version: "0.0.1" }, null, 4)
        );

        await execute(process.execPath, [script], { cwd: root });

        const { stdout } = await execute(
            "git",
            ["diff", "--cached", "--name-only"],
            { cwd: root }
        );
        assert.equal(stdout.trim(), "");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
