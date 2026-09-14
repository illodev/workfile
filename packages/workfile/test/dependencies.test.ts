import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
);

/**
 * The package's central claim: installing it adds nothing to your tree.
 *
 * `dependencies` is empty. `@types/node` sat in it, pinned, until 0.13.0, and a
 * consuming repository moving to 0.13.0 saw 79 lockfile entries re-keyed to the
 * version this package pinned (T-0251). The need behind it is real but narrow:
 * `server/http.d.ts` and `upgrade/update-check.d.ts` name Node types, which is
 * 3 errors for a consumer type-checking with `skipLibCheck: false` and no node
 * types, and none otherwise. So it is declared as an optional peer — nothing
 * installed, nothing pinned, and a strict TypeScript consumer told what to bring.
 *
 * This exists specifically ahead of the shadcn work. `shadcn add` writes its
 * imports into `dependencies` by default, and a single un-corrected run would
 * publish `radix-ui`, `lucide-react` and `class-variance-authority` into every
 * consumer's `node_modules`. The UI ships precompiled in `dist/ui`, so nothing
 * the interface is built with belongs here — the failure is invisible from the
 * repository and only shows up in somebody else's install.
 */
test("the published package installs nothing and asks only for node types", () => {
    assert.deepEqual(pkg.dependencies ?? {}, {});
    // Unpinned and optional: a peer the consumer resolves to its own version,
    // or leaves out, rather than one this package chooses for it.
    assert.deepEqual(pkg.peerDependencies ?? {}, { "@types/node": "*" });
    assert.deepEqual(pkg.peerDependenciesMeta ?? {}, {
        "@types/node": { optional: true }
    });
    assert.deepEqual(pkg.optionalDependencies ?? {}, {});
    // `bundleDependencies` would smuggle a tree in past the check above.
    assert.deepEqual(pkg.bundleDependencies ?? [], []);
});

// `files` is an allowlist, and everything the UI is built from must stay out of
// it: sources, configs, the design-system manifest and the strict baseline are
// repository furniture, not payload.
test("only build output and documentation are published", () => {
    assert.deepEqual(pkg.files, [
        "dist",
        "docs",
        "README.md",
        "project.config.example.mjs"
    ]);
});

// A `postinstall` would run on every consumer's machine. No published package
// has any reason to execute anything at install time, and adding one silently
// would undo the guarantee the entry above is protecting. `prepare` is on the
// list too: it fires when someone installs a package straight from git.
test("nothing runs on install", async () => {
    const packagesRoot = new URL("../../", import.meta.url);
    for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifest = JSON.parse(
            await readFile(
                new URL(`${entry.name}/package.json`, packagesRoot),
                "utf8"
            )
        );
        for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
            assert.equal(
                manifest.scripts?.[hook],
                undefined,
                `${manifest.name}: ${hook} would execute on every consumer's machine`
            );
        }
    }
});

// The workspace root is the one manifest allowed an install-time script —
// `prepare: husky` wires the git hooks — and that is acceptable precisely
// because `private: true` keeps it off the registry forever.
test("the workspace root can never reach a consumer", async () => {
    const root = JSON.parse(
        await readFile(new URL("../../../package.json", import.meta.url), "utf8")
    );
    assert.equal(root.private, true);
});
