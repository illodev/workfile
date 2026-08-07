import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    createCard,
    diagnoseCards,
    loadCards,
    patchCard
} from "../dist/src/index.js";

/**
 * A card cannot be its own parent, its own dependency, or its own origin.
 *
 * Two of those three were refused at write time and the third was not, which is
 * how T-0161 was found — in the 0.6.0 smoke test, against the published package.
 * `card create --title X --origin T-0001` on a fresh workspace allocates
 * `T-0001`, writes `origin: [T-0001]`, and exits 0. `doctor` then reports
 * `self-origin` as an error, so a command that said it worked had put the
 * repository into a state the protocol calls broken — and the pre-commit hook
 * runs `doctor --severity error`, so the failure surfaces at the *next commit*,
 * about a card written minutes earlier, with nothing to say which command wrote
 * it.
 *
 * Neither sibling guard had a test either, so all three are pinned here rather
 * than only the one that was missing. A guard nothing exercises is the next one
 * to go quiet.
 */

/**
 * The three fields, the error each refuses itself with on patch, and the one it
 * refuses itself with on create.
 *
 * They differ, and the difference is the finding T-0161 got wrong.
 * `validateCardCandidate` runs before the id is allocated — it sees
 * `id: "pending"` — so no self-reference check up there can fire on a create,
 * whatever the field. `parent` and `depends` are nevertheless refused, by their
 * *existence* rules: the id is not among the loaded cards either. The right
 * outcome for the wrong reason, and `origin` has no existence rule to borrow,
 * because an origin may legitimately name a record not written yet. Which is why
 * nothing caught it and why the fix for it sits at the allocation instead.
 */
const SELF_REFERENCE = [
    { field: "parent", onPatch: "CARD_SELF_PARENT", onCreate: "CARD_PARENT_NOT_FOUND" },
    {
        field: "depends",
        onPatch: "CARD_SELF_DEPENDENCY",
        onCreate: "CARD_DEPENDENCY_NOT_FOUND"
    },
    { field: "origin", onPatch: "CARD_SELF_ORIGIN", onCreate: "CARD_SELF_ORIGIN" }
] as const;

const asList = (field: string, id: string) =>
    field === "parent" ? id : [id];

test("a card cannot name itself in any of the three relationship fields", async () => {
    for (const { field, onPatch, onCreate } of SELF_REFERENCE) {
        const { workspace, cleanup } = await createTestWorkspace();
        try {
            // On creation, which is the case the card was filed about: the
            // caller names the id the allocation is about to hand out, so it
            // looks like somebody else's card right up until it is theirs.
            await assert.rejects(
                () =>
                    createCard(workspace, {
                        title: `Self ${field}`,
                        area: "api",
                        [field]: asList(field, "T-0003")
                    }),
                (error: any) => {
                    assert.equal(
                        error.code,
                        onCreate,
                        `create --${field} naming the allocated id gave ${error.code}`
                    );
                    return true;
                },
                `create --${field} naming the id being allocated was accepted`
            );

            // And on patch, where the id is plainly the card's own and every
            // field is refused by its own name.
            const { cards } = await loadCards(workspace);
            const existing = cards[0].id;
            await assert.rejects(
                () => patchCard(workspace, existing, { [field]: asList(field, existing) }),
                (error: any) => {
                    assert.equal(error.code, onPatch, `patch --${field} gave ${error.code}`);
                    return true;
                },
                `patch setting its own id as ${field} was accepted`
            );
        } finally {
            await cleanup();
        }
    }
});

/**
 * The allocated id is the one that gets refused, which is the whole subtlety.
 *
 * `T-0003` above is not a card that exists — it is the id the *next* create will
 * be given in that fixture. So this is not "refuse an id you already hold"; it is
 * "refuse the id you are about to be given", and it only works because
 * `candidate.id` is set by the time validation runs.
 */
test("the id being allocated is the id that is refused", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        const before = await loadCards(workspace);
        const next = await createCard(workspace, { title: "Allocates one", area: "api" });
        assert.ok(
            !before.cards.some((card: any) => card.id === next.card.id),
            "the fixture already held the id this test assumes is free"
        );
        // Which is the id the refused create above was naming.
        assert.equal(next.card.id, "T-0003");
    } finally {
        await cleanup();
    }
});

/**
 * The three codes read alike, which is criterion 3 of the card and not
 * decoration: an agent reading `CARD_SELF_ORIGIN` after having met
 * `CARD_SELF_PARENT` should not have to check whether it means the same shape of
 * thing.
 */
test("the three refusals are named the same way", async () => {
    const source = await readFile(
        new URL("../src/modules/cards/validation.ts", import.meta.url),
        "utf8"
    );
    const codes = [...source.matchAll(/"(CARD_SELF_[A-Z_]+)"/g)].map((match) => match[1]);
    assert.deepEqual(
        [...new Set(codes)].sort(),
        ["CARD_SELF_DEPENDENCY", "CARD_SELF_ORIGIN", "CARD_SELF_PARENT"],
        "a self-reference guard was added or renamed out of the family"
    );
});

/**
 * And the `doctor` rule stays, because the write-time guard only protects writes
 * that go through it.
 *
 * Every record written before this landed came through a version that allowed it,
 * and a workspace is edited by hand and by other tools. So the file is written
 * directly here — bypassing validation, the way history did — and `doctor` still
 * has to report it.
 */
test("doctor still reports a self-origin written outside the protocol", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        const directory = join(root, workspace.config.cards.path);
        const name = (await readdir(directory)).find((entry) => entry.endsWith(".md"));
        assert.ok(name, "the fixture has no cards");
        const path = join(directory, name);
        const original = await readFile(path, "utf8");
        const id = /^id:\s*(\S+)/m.exec(original)?.[1];
        assert.ok(id, "the fixture card has no id");
        await writeFile(
            path,
            original.replace(/^updated:.*$/m, (line) => `${line}\norigin: [${id}]`)
        );

        const loaded = await loadCards(workspace);
        const report = await diagnoseCards({ ...loaded, workspace, checkPaths: false });
        const found = report.issues.filter((issue: any) => issue.code === "self-origin");
        assert.equal(
            found.length,
            1,
            `expected one self-origin error, got ${JSON.stringify(
                report.issues.map((issue: any) => issue.code)
            )}`
        );
        assert.equal(found[0].severity, "error");
    } finally {
        await cleanup();
    }
});

/**
 * A refused create leaves nothing behind.
 *
 * The card's complaint was not only that the write was accepted — it was that a
 * command reporting success had put the repository into a state `doctor` calls an
 * error. So the refusal has to happen before the file exists, not by writing and
 * then complaining. The check sits inside the allocation callback, ahead of
 * `createFileExclusive`, and a `ValidationError` is not create contention, so it
 * leaves the retry loop instead of being read as a collision and retried onto the
 * next id.
 */
test("a refused create writes no card and consumes no id", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        const before = await loadCards(workspace);
        await assert.rejects(
            () =>
                createCard(workspace, {
                    title: "Came out of the release",
                    area: "api",
                    origin: ["T-0003"]
                }),
            (error: any) => {
                assert.equal(error.code, "CARD_SELF_ORIGIN");
                return true;
            }
        );
        const after = await loadCards(workspace);
        assert.equal(
            after.cards.length,
            before.cards.length,
            "the refused create wrote a card anyway"
        );
        // And the id it would have taken is still free, so the next create gets
        // it rather than skipping to T-0004.
        const next = await createCard(workspace, { title: "The next one", area: "api" });
        assert.equal(next.card.id, "T-0003");
    } finally {
        await cleanup();
    }
});
