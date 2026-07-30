import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
    healDuplicateCardIds,
    loadCards,
    renumberCard,
    runDoctor
} from "../dist/src/index.js";
import { card, createTestWorkspace } from "./support/workspace.mjs";

test("renumbering a unique card rewrites every reference inside the protocol root", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await writeFile(
            join(root, ".project", "cards", "T-0003-referrer.md"),
            card(
                "T-0003",
                { depends: ["T-0001"], related: ["T-0001"] },
                "Blocked by [[T-0001]], see also T-0001 in prose."
            )
        );
        const result = await renumberCard(workspace, "T-0001", {
            to: "T-0042",
            actor: "tester"
        });
        assert.equal(result.from, "T-0001");
        assert.equal(result.id, "T-0042");
        assert.deepEqual(result.rewritten, [
            ".project/cards/T-0003-referrer.md"
        ]);
        assert.deepEqual(result.review, []);

        const moved = await readFile(
            join(root, ".project", "cards", "T-0042-example.md"),
            "utf8"
        );
        assert.match(moved, /^id: T-0042$/m);
        assert.match(moved, /renumbered from T-0001/);

        const referrer = await readFile(
            join(root, ".project", "cards", "T-0003-referrer.md"),
            "utf8"
        );
        assert.match(referrer, /depends: \[T-0042\]/);
        assert.match(referrer, /related: \[T-0042\]/);
        assert.match(referrer, /\[\[T-0042\]\]/);
        assert.match(referrer, /T-0042 in prose/);
        assert.ok(!referrer.includes("T-0001"));

        const { cards } = await loadCards(workspace);
        assert.ok(!cards.some((entry) => entry.id === "T-0001"));

        const report = await runDoctor(workspace);
        assert.ok(
            !report.issues.some((issue) => issue.code === "duplicate-record-id")
        );
    } finally {
        await cleanup();
    }
});

test("healing duplicates keeps the older card and reports ambiguous references", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        // Same ID as the fixture's T-0001 (created 2026-07-25), younger, and
        // a different slug — exactly what a merge of two clones produces.
        await writeFile(
            join(root, ".project", "cards", "T-0001-collision.md"),
            card("T-0001", { created: "2026-07-28" }, "Born on a branch.")
        );
        await writeFile(
            join(root, ".project", "cards", "T-0004-referrer.md"),
            card("T-0004", { depends: ["T-0001"] }, "Depends on one of them.")
        );

        const healed = await healDuplicateCardIds(workspace, {
            actor: "tester"
        });
        assert.equal(healed.moves.length, 1);
        const [move] = healed.moves;
        assert.equal(move.from, "T-0001");
        assert.equal(move.to, "T-0005");
        assert.equal(move.file, "T-0005-collision.md");
        // The reference stayed on T-0001: it is ambiguous, so it is reported
        // for review rather than silently repointed.
        assert.deepEqual(move.review, [".project/cards/T-0004-referrer.md"]);
        const referrer = await readFile(
            join(root, ".project", "cards", "T-0004-referrer.md"),
            "utf8"
        );
        assert.match(referrer, /depends: \[T-0001\]/);

        // The older card keeps its ID and its file.
        const original = await readFile(
            join(root, ".project", "cards", "T-0001-example.md"),
            "utf8"
        );
        assert.match(original, /^id: T-0001$/m);

        const report = await runDoctor(workspace);
        assert.ok(
            !report.issues.some((issue) => issue.code === "duplicate-record-id")
        );

        const again = await healDuplicateCardIds(workspace, { actor: "tester" });
        assert.equal(again.moves.length, 0);
    } finally {
        await cleanup();
    }
});

test("renumber refuses taken targets and ambiguous IDs without a filename", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        await assert.rejects(
            () => renumberCard(workspace, "T-0001", { to: "T-0002" }),
            (error) => error.code === "CARD_ID_TAKEN"
        );
        await assert.rejects(
            () => renumberCard(workspace, "T-0001", { to: "X-1" }),
            (error) => error.code === "CARD_ID_INVALID"
        );

        await writeFile(
            join(root, ".project", "cards", "T-0001-collision.md"),
            card("T-0001", { created: "2026-07-28" })
        );
        await assert.rejects(
            () => renumberCard(workspace, "T-0001", {}),
            (error) => error.code === "CARD_ID_AMBIGUOUS"
        );

        // Targeting the file settles it.
        const result = await renumberCard(workspace, "T-0001-collision.md", {
            actor: "tester"
        });
        assert.equal(result.from, "T-0001");
        assert.equal(result.id, "T-0003");
    } finally {
        await cleanup();
    }
});
