import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
    classifyDuplicates,
    duplicateIssueMessage,
    healDuplicateCardIds,
    healDuplicateRecordIds,
    renumberRecord,
    runDoctor
} from "../dist/src/index.js";
import { card, createTestWorkspace } from "./support/workspace.ts";

/**
 * Two branches allocating one ID is not a card-shaped accident.
 *
 * A card is created once, by whoever picks up the work. A changelog fragment is
 * created by *every* branch that changes anything user-visible, and the ID is
 * allocated by scanning the local maximum — so parallel branches collide by
 * construction. These cases are the kinds that were dead ends: the doctor named
 * a repair, and the repair only ever moved cards.
 */

/** Frontmatter plus a body, for records this suite writes by hand. */
function record(fields: Record<string, any>, body = "Body.") {
    const lines = Object.entries(fields).map(([key, value]) =>
        Array.isArray(value) ? `${key}: [${value.join(", ")}]` : `${key}: ${value}`
    );
    return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

function fragment(id: string, fields: Record<string, any> = {}, body = "Body.") {
    return record({
        id,
        title: `Fragment ${id}`,
        type: "changed",
        area: "api",
        visibility: "public",
        created: "2026-07-20",
        updated: "2026-07-20",
        ...fields
    }, body);
}

function managedDoc(id: string, fields: Record<string, any> = {}, body = "Body.") {
    return record({
        id,
        title: `Document ${id}`,
        kind: "reference",
        status: "draft",
        created: "2026-07-20",
        updated: "2026-07-20",
        ...fields
    }, body);
}

function learning(id: string, fields: Record<string, any> = {}, body = "Body.") {
    return record({
        id,
        title: `Learning ${id}`,
        status: "active",
        created: "2026-07-20",
        updated: "2026-07-20",
        ...fields
    }, body);
}

/** Writes a record at a repository path, creating the folders it needs. */
async function put(root: string, repoPath: string, content: string) {
    const absolute = join(root, ...repoPath.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
    return absolute;
}

const UNRELEASED = ".project/changelog/unreleased";
const RELEASES = ".project/changelog/releases";

function duplicateIssues(report: any) {
    return report.issues.filter(
        (issue: any) => issue.code === "duplicate-record-id"
    );
}

test("a duplicate changelog ID heals end to end and the doctor comes back clean", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await put(
            root,
            `${UNRELEASED}/CHG-0001-first-branch.md`,
            fragment("CHG-0001", { created: "2026-07-20", updated: "2026-07-20" })
        );
        await put(
            root,
            `${UNRELEASED}/CHG-0001-second-branch.md`,
            fragment("CHG-0001", { created: "2026-07-28", updated: "2026-07-28" })
        );
        await writeFile(
            join(root, ".project", "cards", "T-0003-referrer.md"),
            card("T-0003", {}, "Shipped in CHG-0001.")
        );

        const healed = await healDuplicateRecordIds(workspace, {
            actor: "tester",
            now: "2026-08-05T10:00:00.000Z"
        });
        assert.equal(healed.moves.length, 1);
        const [move] = healed.moves;
        assert.equal(move.kind, "change");
        assert.equal(move.from, "CHG-0001");
        assert.equal(move.to, "CHG-0002");
        assert.equal(move.file, "CHG-0002-second-branch.md");
        assert.equal(move.path, `${UNRELEASED}/CHG-0002-second-branch.md`);
        // The reference is ambiguous by construction — it was written on one of
        // the two branches and nothing can say which — so it is reported.
        assert.deepEqual(move.review, [".project/cards/T-0003-referrer.md"]);

        const survivor = await readFile(
            join(root, ...`${UNRELEASED}/CHG-0001-first-branch.md`.split("/")),
            "utf8"
        );
        assert.match(survivor, /^id: CHG-0001$/m);
        const moved = await readFile(
            join(root, ...`${UNRELEASED}/CHG-0002-second-branch.md`.split("/")),
            "utf8"
        );
        assert.match(moved, /^id: CHG-0002$/m);
        assert.match(moved, /^updated: 2026-08-05$/m);
        // A fragment carries no activity trail, and the renumber must not
        // invent one.
        assert.ok(!moved.includes("## Activity"));

        assert.deepEqual(duplicateIssues(await runDoctor(workspace)), []);
        const again = await healDuplicateRecordIds(workspace, { actor: "tester" });
        assert.equal(again.moves.length, 0);
    } finally {
        await cleanup();
    }
});

test("a released fragment keeps the ID and the unreleased side moves", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        const releasedPath = `${RELEASES}/0-1-0/fragments/CHG-0001-shipped.md`;
        // Deliberately the *younger* of the two: frozen outranks `created`, so
        // the rule the card asks for cannot be read off the dates alone.
        await put(
            root,
            releasedPath,
            fragment("CHG-0001", { created: "2026-07-30", updated: "2026-07-30" })
        );
        await put(
            root,
            `${RELEASES}/0-1-0/REL-0001-0-1-0.md`,
            record({
                id: "REL-0001",
                title: "Version 0.1.0",
                version: "0.1.0",
                date: "2026-07-31",
                fragments: ["CHG-0001"]
            })
        );
        await put(
            root,
            `${UNRELEASED}/CHG-0001-on-a-branch.md`,
            fragment("CHG-0001", { created: "2026-07-01", updated: "2026-07-01" })
        );
        const before = await readFile(join(root, ...releasedPath.split("/")), "utf8");

        const healed = await healDuplicateRecordIds(workspace, {
            actor: "tester"
        });
        assert.equal(healed.moves.length, 1);
        assert.equal(healed.moves[0].path, `${UNRELEASED}/CHG-0002-on-a-branch.md`);
        assert.equal(
            await readFile(join(root, ...releasedPath.split("/")), "utf8"),
            before,
            "a released fragment must not be rewritten"
        );
        // The release record still lists the ID it consumed, and the heal
        // reports it rather than repointing shipped history.
        const release = await readFile(
            join(root, ...`${RELEASES}/0-1-0/REL-0001-0-1-0.md`.split("/")),
            "utf8"
        );
        assert.match(release, /fragments: \[CHG-0001\]/);
        assert.ok(
            healed.moves[0].review.includes(`${RELEASES}/0-1-0/REL-0001-0-1-0.md`)
        );
        assert.deepEqual(duplicateIssues(await runDoctor(workspace)), []);
    } finally {
        await cleanup();
    }
});

test("two released fragments carrying one ID are refused, not half healed", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        for (const version of ["0-1-0", "0-2-0"]) {
            await put(
                root,
                `${RELEASES}/${version}/fragments/CHG-0001-${version}.md`,
                fragment("CHG-0001")
            );
            await put(
                root,
                `${RELEASES}/${version}/REL-000${version === "0-1-0" ? 1 : 2}-${version}.md`,
                record({
                    id: `REL-000${version === "0-1-0" ? 1 : 2}`,
                    title: `Version ${version}`,
                    version: version.replaceAll("-", "."),
                    date: "2026-07-31",
                    fragments: ["CHG-0001"]
                })
            );
        }

        const healed = await healDuplicateRecordIds(workspace, {
            actor: "tester"
        });
        assert.equal(healed.moves.length, 0);
        assert.equal(healed.skipped.length, 1);
        assert.equal(healed.skipped[0].id, "CHG-0001");
        assert.equal(healed.skipped[0].reason, "multiple-released");

        const [issue] = duplicateIssues(await runDoctor(workspace));
        assert.equal(issue.details.healable, false);
        assert.ok(
            !issue.message.includes("--fix"),
            `a refused collision must not name a command: ${issue.message}`
        );
        assert.match(issue.message, /frozen/);
    } finally {
        await cleanup();
    }
});

test("the survivor is the same whichever order the two files were written in", async () => {
    // Same `created` on both sides, so the tie-break is the path — the half of
    // the rule a filesystem's listing order could otherwise decide.
    const results: string[][] = [];
    for (const reversed of [false, true]) {
        const { root, workspace, cleanup } = await createTestWorkspace();
        try {
            const names = ["CHG-0001-alpha.md", "CHG-0001-omega.md"];
            for (const name of reversed ? [...names].reverse() : names) {
                await put(root, `${UNRELEASED}/${name}`, fragment("CHG-0001"));
            }
            const healed = await healDuplicateRecordIds(workspace, {
                actor: "tester"
            });
            results.push(healed.moves.map((move) => move.path));
        } finally {
            await cleanup();
        }
    }
    assert.deepEqual(results[0], [`${UNRELEASED}/CHG-0002-omega.md`]);
    assert.deepEqual(results[0], results[1]);
});

test("managed documents and memory records heal inside their own folder", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        // Same ID *and* the same filename in two folders: the case a basename
        // cannot resolve, which is why the sweep addresses records by path.
        await put(
            root,
            ".project/docs/architecture/DOC-0001-billing.md",
            managedDoc("DOC-0001", { created: "2026-07-20" })
        );
        await put(
            root,
            ".project/docs/guide/DOC-0001-billing.md",
            managedDoc("DOC-0001", { created: "2026-07-24" })
        );
        // A higher sequence already spent in the collection: the replacement ID
        // must come from that sequence, not from the colliding number.
        await put(root, ".project/memory/learnings/LRN-0007-taken.md", learning("LRN-0007"));
        await put(
            root,
            ".project/memory/learnings/LRN-0003-first.md",
            learning("LRN-0003", { created: "2026-07-20" })
        );
        await put(
            root,
            ".project/memory/learnings/LRN-0003-second.md",
            learning("LRN-0003", { created: "2026-07-24" })
        );

        const healed = await healDuplicateRecordIds(workspace, {
            actor: "tester",
            now: "2026-08-05T10:00:00.000Z"
        });
        assert.deepEqual(healed.skipped, []);
        const moves = Object.fromEntries(
            healed.moves.map((move) => [move.from, move])
        );
        assert.equal(moves["DOC-0001"].kind, "doc");
        assert.equal(moves["DOC-0001"].to, "DOC-0002");
        // Still in `guide/`: a document's folder is organization, and healing
        // an ID is not a move.
        assert.equal(
            moves["DOC-0001"].path,
            ".project/docs/guide/DOC-0002-billing.md"
        );
        assert.equal(moves["LRN-0003"].kind, "memory");
        assert.equal(moves["LRN-0003"].to, "LRN-0008");
        assert.equal(
            moves["LRN-0003"].path,
            ".project/memory/learnings/LRN-0008-second.md"
        );

        const moved = await readFile(
            join(root, ".project", "docs", "guide", "DOC-0002-billing.md"),
            "utf8"
        );
        assert.match(moved, /^id: DOC-0002$/m);
        assert.match(moved, /^updated: 2026-08-05$/m);
        assert.deepEqual(duplicateIssues(await runDoctor(workspace)), []);
    } finally {
        await cleanup();
    }
});

test("collisions nothing can repair are refused with the reason, and nothing moves", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await put(
            root,
            ".project/docs/reference/DOC-0001-managed.md",
            managedDoc("DOC-0001")
        );
        // An indexed file outside `docs.managedPath` declaring a managed ID.
        await put(root, "docs/legacy.md", managedDoc("DOC-0001"));
        // One ID across two kinds: no single sequence owns it.
        await put(root, ".project/docs/reference/DOC-0002-clash.md", managedDoc("T-0001"));

        const healed = await healDuplicateRecordIds(workspace, {
            actor: "tester"
        });
        assert.equal(healed.moves.length, 0);
        const reasons = Object.fromEntries(
            healed.skipped.map((skip) => [skip.id, skip])
        );
        assert.equal(reasons["DOC-0001"].reason, "indexed-document");
        assert.equal(reasons["DOC-0001"].kind, "doc");
        assert.equal(reasons["T-0001"].reason, "mixed-kinds");
        assert.equal(reasons["T-0001"].kind, null);
        for (const skip of healed.skipped) {
            assert.ok(
                skip.reasonText && !skip.reasonText.includes("workfile "),
                `a refusal states the fact and names no command: ${skip.reasonText}`
            );
        }

        // Untouched: both files are still where they were, with their IDs.
        assert.match(
            await readFile(join(root, "docs", "legacy.md"), "utf8"),
            /^id: DOC-0001$/m
        );
        assert.match(
            await readFile(
                join(root, ".project", "docs", "reference", "DOC-0001-managed.md"),
                "utf8"
            ),
            /^id: DOC-0001$/m
        );
    } finally {
        await cleanup();
    }
});

test("every duplicate the doctor reports names a repair it can actually perform", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await put(root, `${UNRELEASED}/CHG-0001-one.md`, fragment("CHG-0001"));
        await put(root, `${UNRELEASED}/CHG-0001-two.md`, fragment("CHG-0001"));
        await put(
            root,
            ".project/memory/learnings/LRN-0001-one.md",
            learning("LRN-0001")
        );
        await put(
            root,
            ".project/memory/learnings/LRN-0001-two.md",
            learning("LRN-0001")
        );

        const issues = duplicateIssues(await runDoctor(workspace));
        // One line per collision, not one per module: the changelog and memory
        // reports each raise their own, and neither can name a repair.
        assert.equal(issues.length, 2);
        for (const issue of issues) {
            assert.equal(issue.details.healable, true);
            assert.match(issue.message, /workfile doctor --fix/);
            assert.ok(
                !issue.message.includes("card renumber"),
                `only a card collision may name the card sweep: ${issue.message}`
            );
        }
        assert.equal(issues[0].file, `${UNRELEASED}/CHG-0001-one.md`);
    } finally {
        await cleanup();
    }
});

test("the card sweep leaves other kinds alone and says which command owns them", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await writeFile(
            join(root, ".project", "cards", "T-0001-collision.md"),
            card("T-0001", { created: "2026-07-28" }, "Born on a branch.")
        );
        await put(root, `${UNRELEASED}/CHG-0001-one.md`, fragment("CHG-0001"));
        await put(root, `${UNRELEASED}/CHG-0001-two.md`, fragment("CHG-0001"));

        const healed = await healDuplicateCardIds(workspace, { actor: "tester" });
        assert.equal(healed.moves.length, 1);
        assert.equal(healed.moves[0].kind, "card");
        assert.equal(healed.skipped.length, 1);
        assert.equal(healed.skipped[0].id, "CHG-0001");
        assert.equal(healed.skipped[0].reason, "out-of-scope");
        assert.match(healed.skipped[0].reasonText, /doctor --fix/);
        // Still there, untouched by a sweep that was asked for cards.
        assert.match(
            await readFile(join(root, ...`${UNRELEASED}/CHG-0001-two.md`.split("/")), "utf8"),
            /^id: CHG-0001$/m
        );
    } finally {
        await cleanup();
    }
});

test("renumbering refuses the records that are written once", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await put(
            root,
            `${RELEASES}/0-1-0/fragments/CHG-0001-shipped.md`,
            fragment("CHG-0001")
        );
        await put(
            root,
            `${RELEASES}/0-1-0/REL-0001-0-1-0.md`,
            record({
                id: "REL-0001",
                title: "Version 0.1.0",
                version: "0.1.0",
                date: "2026-07-31",
                fragments: ["CHG-0001"]
            })
        );
        await put(root, "docs/legacy.md", managedDoc("DOC-0500"));

        await assert.rejects(
            () => renumberRecord(workspace, "CHG-0001", { kind: "change" }),
            (error: any) => error.code === "CHANGE_FRAGMENT_RELEASED"
        );
        await assert.rejects(
            () => renumberRecord(workspace, "REL-0001", {}),
            (error: any) => error.code === "RECORD_KIND_NOT_RENUMBERABLE"
        );
        await assert.rejects(
            () => renumberRecord(workspace, "DOC-0500", { kind: "doc" }),
            (error: any) => error.code === "DOC_NOT_MANAGED"
        );
        // Nothing was written before any of those refusals.
        assert.match(
            await readFile(
                join(root, ...`${RELEASES}/0-1-0/fragments/CHG-0001-shipped.md`.split("/")),
                "utf8"
            ),
            /^id: CHG-0001$/m
        );
    } finally {
        await cleanup();
    }
});

/**
 * Records with no `id:` line group under one empty key, and `renumberRecord`
 * would then rewrite `\bundefined\b` across the protocol root — a repair worse
 * than the collision. Driven through the classifier rather than through a
 * workspace because the loaders sort on `id` and throw on the way in, so no
 * corpus can currently reach the healer with one of these in it.
 */
test("a duplicate with no ID at all is refused rather than rewritten", () => {
    const [classification] = classifyDuplicates({
        records: [
            { id: undefined, kind: "change", path: `${UNRELEASED}/one.md` },
            { id: undefined, kind: "change", path: `${UNRELEASED}/two.md` }
        ]
    });
    assert.equal(classification.healable, false);
    assert.equal(classification.reason, "missing-id");
    assert.deepEqual(classification.movers, []);
    assert.equal(classification.survivor, null);
    assert.match(
        duplicateIssueMessage(classification),
        /2 changelog records carry no ID/
    );
});
