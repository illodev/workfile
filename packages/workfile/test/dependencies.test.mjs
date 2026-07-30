import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
);

/**
 * The package's central claim: installing it adds nothing to your tree.
 *
 * `@types/node` is the sole entry, and it is there because the published `.d.ts`
 * files reference `node:` types — a consumer type-checking against them needs
 * it, so it is a real dependency rather than an oversight.
 *
 * This exists specifically ahead of the shadcn work. `shadcn add` writes its
 * imports into `dependencies` by default, and a single un-corrected run would
 * publish `radix-ui`, `lucide-react` and `class-variance-authority` into every
 * consumer's `node_modules`. The UI ships precompiled in `dist/ui`, so nothing
 * the interface is built with belongs here — the failure is invisible from the
 * repository and only shows up in somebody else's install.
 */
test("the published package depends on nothing but node types", () => {
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@types/node"]);
    assert.deepEqual(pkg.peerDependencies ?? {}, {});
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

// A `postinstall` would run on every consumer's machine. The package has no
// reason to execute anything at install time, and adding one silently would
// undo the guarantee the entry above is protecting.
test("nothing runs on install", () => {
    for (const hook of ["preinstall", "install", "postinstall"]) {
        assert.equal(
            pkg.scripts?.[hook],
            undefined,
            `${hook} would execute on every consumer's machine`
        );
    }
});
