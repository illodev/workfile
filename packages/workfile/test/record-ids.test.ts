import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));
const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

/**
 * Separate processes, never `Promise.all` in this one.
 *
 * `cards.test.ts` already had a two-way in-process concurrency test and it
 * passed throughout: within one process the second allocation almost always
 * attempts the reservation while the first still holds it, so it takes the
 * EEXIST path and retries correctly. The failure needs real processes, enough
 * of them, and — critically — **distinct titles**. Identical titles collide on
 * the path, and that accidental collision masks the bug entirely.
 */
function spawnCreate(root: string, title: string) {
    return execute(process.execPath, [cli, "card", "create", "--title", title, "--root", root])
        .then(() => "ok")
        .catch((error: any) => String(error?.stderr || error));
}

/**
 * A corpus, written directly. The window widens with the number of records.
 *
 * The fixture's own cards are cleared first: seeding a fresh contiguous range
 * over them would collide by construction and the assertion below could not
 * tell that apart from the failure it exists to catch.
 */
async function seedCards(root: string, count: number) {
    const directory = join(root, ".project/cards");
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const writes: Promise<void>[] = [];
    for (let index = 1; index <= count; index += 1) {
        const id = `T-${String(index).padStart(4, "0")}`;
        writes.push(
            writeFile(
            join(directory, `${id}-seeded-${index}.md`),
            [
                "---",
                `id: ${id}`,
                `title: Seeded ${index}`,
                "status: backlog",
                "type: task",
                "priority: medium",
                "area: api",
                "created: 2026-08-01",
                "updated: 2026-08-01",
                "---",
                "",
                "Seed.",
                ""
            ].join("\n")
            )
        );
    }
    await Promise.all(writes);
}

async function idsIn(directory: string) {
    const files = await readdir(directory);
    return files
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.match(/^([A-Z]+-\d+)/)?.[1])
        .filter(Boolean) as string[];
}

/**
 * The reservation guarded the id; `createFileExclusive` guarded the path; the
 * path carried a title slug. Two different titles were never mutually
 * exclusive, so a process that had read the sequence before someone else's
 * write took a reservation nobody held any more and minted a duplicate.
 *
 * Measured at these parameters before the fix: the assertion trips on roughly
 * half of all rounds, which is why there are five of them. After the fix: never,
 * across every run. Both assertions matter — an over-strict fix trades
 * duplicates for spurious allocation failures, and only the count catches that.
 */
test("concurrent card creation across processes never mints a duplicate id", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-ids-"));
    try {
        await cp(fixture, root, { recursive: true });
        await seedCards(root, 500);
        const cards = join(root, ".project/cards");
        const before = (await idsIn(cards)).length;

        // Four concurrent writers, sixteen times over — not thirty-two at
        // once. `node --test` runs test FILES in parallel, so whatever this
        // spawns competes with a watcher test that has a three second delivery
        // budget on a two core Windows runner. Thirty-two processes starved it;
        // so did twelve. The window widens with the corpus as readily as with
        // the process count, so it is bought with files and repetition instead,
        // which costs the rest of the suite nothing. Four still detects the
        // regression in four runs out of four.
        const WRITERS = 4;
        const ROUNDS = 16;
        // Five rounds, not one. Detection per round is roughly even odds even
        // at this corpus size, so a single round would be a coin flip that
        // fails in CI weeks after the regression landed.
        for (let round = 1; round <= ROUNDS; round += 1) {
            const results = await Promise.all(
                Array.from({ length: WRITERS }, (_, index) =>
                    // Distinct titles on purpose: identical ones would collide
                    // on the path and hide exactly what this is testing.
                    spawnCreate(root, `Distinct subject ${index} of round ${round}`)
                )
            );
            const failed = results.filter((result) => result !== "ok");
            assert.deepEqual(failed, [], `round ${round} had failures`);
        }

        const ids = await idsIn(cards);
        const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        assert.deepEqual(duplicates, [], "two files must never carry one id");
        assert.equal(
            ids.length,
            before + WRITERS * ROUNDS,
            "every writer must produce exactly one card: refusing to allocate is not a fix"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * Managed documents nest in folders, so the listing that proves an id is free
 * has to be recursive. A flat `readdir` of the managed root is a half-fix: it
 * would not see `architecture/DOC-0007-…md` and would hand the id out again.
 */
test("document ids account for records nested in folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-doc-ids-"));
    try {
        await cp(fixture, root, { recursive: true });
        const managed = join(root, ".project/docs");
        await mkdir(join(managed, "architecture"), { recursive: true });
        await writeFile(
            join(managed, "architecture", "DOC-0007-buried.md"),
            [
                "---",
                "id: DOC-0007",
                "title: Buried",
                "kind: reference",
                "status: current",
                "created: 2026-08-01",
                "updated: 2026-08-01",
                "---",
                "",
                "Nested.",
                ""
            ].join("\n")
        );

        const results = await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                execute(process.execPath, [
                    cli,
                    "doc",
                    "create",
                    "--title",
                    `Nested neighbour ${index}`,
                    "--json",
                    "--root",
                    root
                ])
                    .then(({ stdout }) => JSON.parse(stdout).id)
                    .catch((error: any) => String(error?.stderr || error))
            )
        );

        assert.ok(
            results.every((id) => /^DOC-\d+$/.test(String(id))),
            `every write must succeed: ${JSON.stringify(results)}`
        );
        assert.equal(
            new Set(results).size,
            results.length,
            "ids handed out concurrently must be distinct"
        );
        assert.ok(
            !results.includes("DOC-0007"),
            "the id of a document nested in a folder is still taken"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
