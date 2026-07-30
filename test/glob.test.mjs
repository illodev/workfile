import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { discoverFiles, globToRegExp, matchesAnyGlob } from "../dist/src/index.js";
import { canDescendInto } from "../dist/src/core/glob.js";

// A tree with the shapes that used to defeat the walk: a file at the root
// (whose pattern has no `/` at all), fixed-depth wildcards, `**` in the middle
// and at the end, hidden directories, and a deep branch that no pattern here
// can reach.
const TREE = [
    "README.md",
    "CHANGELOG.md",
    "docs/index.md",
    "docs/guide/setup.md",
    "docs/guide/deep/nested/topic.md",
    "docs/guide/deep/nested/notes.txt",
    "apps/api/README.md",
    "apps/api/src/README.md",
    "apps/api/src/deep/deeper/file.md",
    "apps/web/README.md",
    "packages/ui/README.md",
    ".project/specs/one.md",
    ".project/specs/sub/two.md",
    ".project/cards/T-0001.md",
    ".hidden/secret.md",
    "vendor/lib/README.md",
    "node_modules/pkg/README.md",
    "apps/api/node_modules/pkg/docs/x.md"
];

async function buildTree() {
    const root = await mkdtemp(join(tmpdir(), "workfile-glob-"));
    for (const relativePath of TREE) {
        const absolute = join(root, relativePath);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, `# ${relativePath}\n`);
    }
    return root;
}

/** What `discoverFiles` must return, computed without any pruning at all:
 * every file in the tree, filtered by the very same matcher the walk uses on
 * files. Pruning is an optimisation, so this is the definition of correct. */
function bruteForce(include, exclude) {
    return TREE.filter((path) => {
        if (matchesAnyGlob(path, exclude)) return false;
        // A directory-level exclusion removes everything under it.
        const segments = path.split("/");
        for (let index = 1; index < segments.length; index += 1) {
            if (matchesAnyGlob(`${segments.slice(0, index).join("/")}/`, exclude)) {
                return false;
            }
        }
        return matchesAnyGlob(path, include);
    }).sort();
}

const CASES = [
    // The shipped default. `README.md` has no `/`, which is what used to switch
    // pruning off for the whole walk.
    { include: ["README.md", "docs/**/*.md", ".project/specs/**/*.md"] },
    { include: ["README.md"] },
    { include: ["*.md"] },
    // Fixed-depth wildcard: must not authorise all of `apps/**`.
    { include: ["apps/*/README.md"] },
    { include: ["apps/*/*/README.md"] },
    { include: ["**/README.md"] },
    { include: ["**/*.md"] },
    { include: ["docs/**"] },
    { include: ["docs/**/*"] },
    // `**` glued to text compiles to a bare `.*`, which crosses `/`.
    { include: ["docs/**.md"] },
    { include: ["**docs/**"] },
    { include: ["docs/g*/setup.md"] },
    { include: ["docs/?ndex.md"] },
    { include: [".hidden/**/*.md"] },
    { include: ["**/deep/**/*.md"] },
    { include: ["apps/**/src/**/*.md"] },
    // Pattern longer than any path in the tree.
    { include: ["docs/a/b/c/d/e.md"] },
    // No match anywhere.
    { include: ["nope/**/*.md"] },
    { include: ["docs/**/*.md", "apps/*/README.md", "packages/*/README.md"] },
    {
        include: ["**/*.md"],
        exclude: ["**/node_modules/**", "**/vendor/**", ".hidden/**"]
    },
    { include: ["**/*.md"], exclude: ["docs/guide/**"] }
];

test("pruning the walk never changes which files are found", async () => {
    const root = await buildTree();
    try {
        for (const { include, exclude = [] } of CASES) {
            const found = (await discoverFiles(root, { include, exclude })).sort();
            assert.deepEqual(
                found,
                bruteForce(include, exclude),
                `include=${JSON.stringify(include)} exclude=${JSON.stringify(exclude)}`
            );
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a root-level pattern does not authorise walking the whole tree", () => {
    // The regression this guards: `README.md` carries no `/`, and the old
    // prefix test reduced it to the empty string, which every directory starts
    // with. Pruning was therefore off for the entire walk whenever a root-level
    // pattern appeared — and one ships in the default config, so this was every
    // installation. On Fube it meant reading 20 289 directories to return 196
    // files, roughly six seconds.
    //
    // Note the result stays identical either way: the broken walk found the
    // same files, just after reading everything. Only the pruning decision
    // itself distinguishes them, which is why the assertion is here and not on
    // `discoverFiles`.
    for (const directory of ["docs", "apps", "apps/api", ".project", "vendor"]) {
        assert.equal(
            canDescendInto(directory, ["README.md"]),
            false,
            `README.md must not authorise descending into ${directory}`
        );
    }
});

test("a fixed-depth wildcard stops at its own depth", () => {
    // `apps/*/README.md` matches at depth two and nowhere else, so `apps` and
    // `apps/api` are worth entering and everything below them is not. Prefix
    // matching could not express this: the literal prefix is `apps/`, which
    // authorises all of `apps/**` — on Fube that is the bulk of the tree.
    assert.equal(canDescendInto("apps", ["apps/*/README.md"]), true);
    assert.equal(canDescendInto("apps/api", ["apps/*/README.md"]), true);
    assert.equal(canDescendInto("apps/api/src", ["apps/*/README.md"]), false);
    assert.equal(canDescendInto("packages", ["apps/*/README.md"]), false);
});

test("`**` keeps a branch open at any depth", () => {
    for (const directory of ["docs", "docs/guide", "docs/guide/deep/nested"]) {
        assert.equal(canDescendInto(directory, ["docs/**/*.md"]), true);
    }
    assert.equal(canDescendInto("apps", ["docs/**/*.md"]), false);
    // `**` also matches zero directories, so the pattern still applies to a
    // file sitting directly in `docs/`.
    assert.equal(matchesAnyGlob("docs/index.md", ["docs/**/*.md"]), true);
});

test("`**` glued to text keeps deep branches reachable", () => {
    // `docs/**.md` compiles to `^docs/.*\.md$`, and that `.*` crosses `/`: the
    // match may sit any number of directories down. A segment automaton cannot
    // bound that, so such a pattern is marked unbounded and every candidate
    // directory is entered.
    //
    // This is documentation, not a regression guard — over-walking is the safe
    // error, and it is the differential test above that proves no file is lost.
    assert.equal(canDescendInto("docs/guide/deep/nested", ["docs/**.md"]), true);
    assert.equal(canDescendInto("docs/guide/deep/nested", ["**docs/**"]), true);
});

test("globToRegExp returns a shared instance per pattern", () => {
    // Callers compile the same handful of patterns once per directory entry.
    assert.equal(globToRegExp("docs/**/*.md"), globToRegExp("docs/**/*.md"));
    assert.notEqual(globToRegExp("docs/**/*.md"), globToRegExp("apps/*/README.md"));
});

test("a cached RegExp cannot leak lastIndex between calls", () => {
    // Sharing instances is only safe because the pattern carries no `g` flag;
    // with one, `test()` would advance `lastIndex` and alternate true/false.
    const expression = globToRegExp("docs/**/*.md");
    assert.equal(expression.global, false);
    assert.equal(expression.test("docs/a.md"), true);
    assert.equal(expression.test("docs/a.md"), true);
});

// `readdir` reports a symlink as neither a file nor a directory, so every
// branch of the walk missed it: `followSymlinks: true` indexed nothing, with
// any configuration. In a pnpm monorepo — where links are the norm — a
// `docs.sources` glob that reaches its files through one found an empty
// workspace and said nothing.
test("symlinks are followed when asked, reported when not, and never loop", async () => {
    const base = await mkdtemp(join(tmpdir(), "workfile-symlink-"));
    const root = join(base, "root");
    await mkdir(join(base, "real"), { recursive: true });
    await mkdir(root, { recursive: true });
    await writeFile(join(base, "real", "linked.md"), "# linked");
    await writeFile(join(root, "plain.md"), "# plain");
    await symlink(join(base, "real", "linked.md"), join(root, "file-link.md"));
    await symlink(join(base, "real"), join(root, "dir-link"));
    await symlink(root, join(root, "loop"));
    await symlink(join(base, "missing.md"), join(root, "broken.md"));

    try {
        const skipped = [];
        const ignored = await discoverFiles(root, {
            include: ["**/*.md"],
            onSkippedLink: (paths) => skipped.push(...paths)
        });
        assert.deepEqual(ignored, ["plain.md"]);
        // Silence here is what made this invisible: the caller has to be able
        // to tell "no matches" from "matches behind a link I did not follow".
        assert.deepEqual(skipped.sort(), [
            "broken.md",
            "dir-link",
            "file-link.md",
            "loop"
        ]);

        const followed = await discoverFiles(root, {
            include: ["**/*.md"],
            followSymlinks: true
        });
        assert.ok(followed.includes("file-link.md"), "a link to a file");
        assert.ok(followed.includes("dir-link/linked.md"), "a link to a directory");
        assert.ok(followed.includes("plain.md"));
        // A broken link is nothing to index, not a crash.
        assert.equal(followed.includes("broken.md"), false);
        // The self-referential link terminates instead of walking forever.
        assert.equal(
            followed.some((path) => path.startsWith("loop/loop/")),
            false
        );
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
