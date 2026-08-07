import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createTestWorkspace } from "./support/workspace.ts";

import { createCard, diagnoseCards, loadCards, patchCard } from "../dist/src/index.js";

/**
 * A card says whether a person asked for it or an agent inferred it.
 *
 * Asked where one of eight cards came from, the record could not answer. The
 * commit message that filed them was read, the grouping of its paragraphs was
 * taken as evidence the card was the agent\'s own, and that was wrong — it was
 * item six of a list the owner had written out. The inference was wrong and the
 * record could not correct it, because it did not carry the fact at all (T-0210).
 *
 * `origin` and `source` both look like they should and are something else:
 * `origin` takes record ids, which is the provenance of *discovered* work, and
 * `source` is a repository path checked on disk, so a report made in conversation
 * has nothing to put there.
 */

test("the vocabulary is two values and anything else is refused", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        for (const raised of ["reported", "derived"]) {
            const created = await createCard(workspace, {
                title: `Filed as ${raised}`,
                area: "api",
                raised
            });
            assert.equal(created.card.raised, raised);
        }
        // Two, and the smallness is the decision: more than two and nobody picks
        // correctly, while this is the distinction that changes what you do — a
        // reported card is a commitment to somebody and a derived one is a
        // proposal that costs nothing to discard.
        await assert.rejects(
            () => createCard(workspace, { title: "Guessed", area: "api", raised: "guessed" }),
            (error: any) => {
                assert.equal(error.code, "CARD_RAISED_INVALID");
                assert.match(error.message, /reported, derived/);
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

test("it can be set after the fact, on a card that was filed without it", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        const created = await createCard(workspace, { title: "Filed blank", area: "api" });
        assert.equal(created.card.raised, undefined, "a card gets no default");
        // No default, deliberately: a value nobody chose would be the same wrong
        // answer the card was filed about, written by the tool instead of guessed
        // by a reader.
        await patchCard(workspace, created.card.id, { raised: "reported" });
        const { cards } = await loadCards(workspace);
        assert.equal(
            cards.find((card: any) => card.id === created.card.id)?.raised,
            "reported"
        );
    } finally {
        await cleanup();
    }
});

/**
 * The rule is bounded by date, and that bound is the part the card left open.
 *
 * Every card written before the field existed carries none — 223 in this
 * repository alone — so reporting all of them would drown the doctor on the day
 * it shipped and teach everyone to ignore the rule. Backfilling is not available
 * either: guessing which of them were reported reproduces the exact error that
 * prompted the card. So the rule speaks about cards filed from the day it could
 * be answered and says nothing about the ones that could not.
 */
test("doctor asks only about cards filed since the field existed", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace();
    try {
        const report = async () => {
            const loaded = await loadCards(workspace);
            const result = await diagnoseCards({
                ...loaded,
                workspace,
                checkPaths: false,
                checkGit: false
            });
            return result.issues.filter((issue: any) => issue.code === "raised-missing");
        };

        // The fixture predates the field, so it is left alone.
        assert.deepEqual(await report(), [], "an old card was asked about");

        const created = await createCard(workspace, { title: "Filed blank", area: "api" });
        const path = join(root, workspace.config.cards.path, created.card.file);
        const before = await readFile(path, "utf8");

        // Dated after the cutoff by hand rather than by waiting for the clock,
        // which is the only way to test a date boundary without owning time.
        await writeFile(path, before.replace(/^created:.*$/m, "created: 2099-01-01"));
        const flagged = await report();
        assert.deepEqual(
            flagged.map((issue: any) => issue.id),
            [created.card.id],
            "a card filed after the field existed was not asked about"
        );
        assert.equal(flagged[0].severity, "warning");

        // And answering it silences the rule.
        await patchCard(workspace, created.card.id, { raised: "derived" });
        assert.deepEqual(await report(), []);
    } finally {
        await cleanup();
    }
});
