import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    applyAcceptance,
    criterionDigest,
    criterionOwners,
    normalizeCriterion,
    parseAcceptance,
    staleBindings
} from "../dist/src/modules/cards/acceptance.js";
import {
    createCard,
    diagnoseCards,
    loadCards,
    loadWorkspace,
    patchCardBody,
    patchCard,
    setCardAcceptance,
    transitionCard
} from "../dist/src/index.js";

/**
 * The golden fixture plus a declared command allowlist.
 *
 * The fixture declares none, which is the default and is what
 * `verify-allowlist.test.ts` exercises. Every test here is about the binding
 * rather than the allowlist, so each one has to say which commands its cards
 * are allowed to name — that is the whole content of "empty by default".
 */
async function workspaceAllowing(commands: string[][]) {
    const { root, cleanup } = await createTestWorkspace();
    await writeFile(
        join(root, "project.config.mjs"),
        `export default ${JSON.stringify(
            {
                schemaVersion: 2,
                name: "Golden workspace",
                cards: {
                    areas: ["api", "web", "infra", "docs"],
                    verification: { commands }
                }
            },
            null,
            4
        )};\n`
    );
    return { root, cleanup, workspace: await loadWorkspace({ root }) };
}

const BODY = [
    "## Acceptance criteria",
    "",
    "- [ ] The gate refuses done while a criterion is unproven.",
    "- [ ] A forced move names the gate it walked past.",
    "- [ ] The docs say what the flag does.",
    ""
].join("\n");

test("normalisation survives reflow and nothing else", () => {
    // Rewrapping a paragraph and re-indenting a list are not changes to what a
    // criterion says, so a binding has to survive both.
    assert.equal(
        normalizeCriterion("  The gate   refuses\n  done.  "),
        "The gate refuses done."
    );
    assert.equal(
        criterionDigest("The gate refuses done."),
        criterionDigest("The  gate\trefuses\n done.")
    );

    // Case and punctuation are meaning. A binding that survived these would be
    // asserting that somebody proved a claim they did not.
    for (const other of [
        "the gate refuses done.",
        "The gate refuses done?",
        "The gate refuses done"
    ]) {
        assert.notEqual(
            criterionDigest("The gate refuses done."),
            criterionDigest(other),
            other
        );
    }
    assert.match(criterionDigest("x"), /^sha256:[0-9a-f]{64}$/);
});

test("a binding survives a reorder and breaks on an edit", () => {
    const reading = parseAcceptance(BODY);
    const verify = [
        {
            id: "gate-test",
            run: ["pnpm", "test", "acceptance"],
            criteria: [criterionDigest("A forced move names the gate it walked past.")]
        }
    ];
    assert.deepEqual([...criterionOwners(reading, verify).keys()], [2]);

    // The same three criteria, in a different order. An index-based binding
    // would now point at the wrong line; a text hash follows the text.
    const reordered = parseAcceptance(
        [
            "## Acceptance criteria",
            "",
            "- [ ] The docs say what the flag does.",
            "- [ ] A forced move names the gate it walked past.",
            "- [ ] The gate refuses done while a criterion is unproven.",
            ""
        ].join("\n")
    );
    assert.deepEqual([...criterionOwners(reordered, verify).keys()], [2]);
    assert.deepEqual(staleBindings(reordered, verify), []);

    // Editing the criterion breaks the binding rather than quietly following
    // it: the claim that was proved is not the claim that now stands.
    const edited = parseAcceptance(
        BODY.replace("names the gate", "names every gate")
    );
    assert.equal(criterionOwners(edited, verify).size, 0);
    assert.deepEqual(staleBindings(edited, verify), [
        { entry: "gate-test", digest: verify[0].criteria[0] }
    ]);
});

test("a bound criterion refuses a hand-written check", () => {
    const owners = criterionOwners(parseAcceptance(BODY), [
        {
            id: "gate-test",
            run: ["pnpm", "test", "acceptance"],
            criteria: [criterionDigest("The gate refuses done while a criterion is unproven.")]
        }
    ]);

    assert.throws(
        () => applyAcceptance(BODY, { check: [1], owners }),
        (error: any) => {
            assert.equal(error.code, "CARD_ACCEPTANCE_MACHINE_OWNED");
            assert.match(error.message, /pnpm test acceptance/);
            assert.match(error.message, /gate-test/);
            return true;
        }
    );

    // Unbound criteria on the same card are unaffected — the refusal is per
    // criterion, not a card-wide lock.
    assert.equal(applyAcceptance(BODY, { check: [3], owners }).changed.length, 1);
});

test("a run may check the criteria it proves and no others", () => {
    const owners = criterionOwners(parseAcceptance(BODY), [
        {
            id: "gate-test",
            run: ["pnpm", "test", "acceptance"],
            criteria: [criterionDigest("The gate refuses done while a criterion is unproven.")]
        },
        {
            id: "docs",
            run: ["pnpm", "test", "documentation"],
            criteria: [criterionDigest("The docs say what the flag does.")]
        }
    ]);

    const applied = applyAcceptance(BODY, {
        check: [1],
        owners,
        runner: "gate-test"
    });
    assert.equal(applied.changed.length, 1);
    assert.match(applied.body, /- \[x\] The gate refuses done/);

    // A runner allowed to check anything would be the same hole one rung in,
    // reached by declaring a verify entry instead of by typing --check.
    for (const [index, label] of [
        [3, "a criterion another entry proves"],
        [2, "a criterion nothing proves"]
    ] as Array<[number, string]>) {
        assert.throws(
            () => applyAcceptance(BODY, { check: [index], owners, runner: "gate-test" }),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_NOT_BOUND");
                return true;
            },
            label
        );
    }
});

test("a verify block is refused at write time when the runner could not act on it", async () => {
    const { workspace, cleanup } = await workspaceAllowing([["pnpm", "test"], ["x"], ["y"]]);
    try {
        const body = [
            "## Acceptance criteria",
            "",
            "- [ ] The gate refuses done while a criterion is unproven.",
            ""
        ].join("\n");
        const good = criterionDigest("The gate refuses done while a criterion is unproven.");
        const created = await createCard(workspace, {
            title: "A card with a bound criterion",
            type: "task",
            area: "api",
            body,
            verify: [{ id: "gate", run: ["pnpm", "test", "acceptance"], criteria: [good] }]
        });

        // The block survives a round trip through the file, which is the whole
        // reason T-0200 had to move the codec's boundary first.
        const { cards } = await loadCards(workspace);
        const saved = cards.find((card: any) => card.id === created.id);
        assert.deepEqual(saved.verify, [
            { id: "gate", run: ["pnpm", "test", "acceptance"], criteria: [good] }
        ]);

        const refusals: Array<[string, unknown]> = [
            ["CARD_VERIFY_KEY_UNKNOWN", [{ id: "gate", run: ["x"], stage: "unit" }]],
            ["CARD_VERIFY_ID_INVALID", [{ id: "Gate Test", run: ["x"] }]],
            [
                "CARD_VERIFY_ID_DUPLICATE",
                [{ id: "gate", run: ["x"] }, { id: "gate", run: ["y"] }]
            ],
            ["CARD_VERIFY_RUN_REQUIRED", [{ id: "gate", run: [] }]],
            // A shell string is the shape ADR-0016 drew and the one the runner
            // cannot take: nothing here parses it, so it is refused rather than
            // guessed at.
            ["CARD_VERIFY_RUN_INVALID", [{ id: "gate", run: "pnpm test" }]],
            [
                "CARD_VERIFY_DIGEST_INVALID",
                [{ id: "gate", run: ["x"], criteria: ["sha256:nope"] }]
            ],
            [
                "CARD_VERIFY_CRITERION_UNKNOWN",
                [
                    {
                        id: "gate",
                        run: ["x"],
                        criteria: [criterionDigest("Something nobody wrote.")]
                    }
                ]
            ]
        ];
        for (const [code, verify] of refusals) {
            await assert.rejects(
                () => patchCard(workspace, created.id, { verify }),
                (error: any) => {
                    assert.equal(error.code, code);
                    return true;
                },
                code
            );
        }
    } finally {
        await cleanup();
    }
});

test("card ac refuses a criterion a command owns", async () => {
    const { workspace, cleanup } = await workspaceAllowing([["pnpm", "test"]]);
    try {
        const body = [
            "## Acceptance criteria",
            "",
            "- [ ] The gate refuses done while a criterion is unproven.",
            "- [ ] The docs say what the flag does.",
            ""
        ].join("\n");
        const created = await createCard(workspace, {
            title: "A card whose first criterion is machine-owned",
            type: "task",
            area: "api",
            body,
            verify: [
                {
                    id: "gate",
                    run: ["pnpm", "test", "acceptance"],
                    criteria: [
                        criterionDigest("The gate refuses done while a criterion is unproven.")
                    ]
                }
            ]
        });

        await assert.rejects(
            () => setCardAcceptance(workspace, created.id, { check: [1] }),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_MACHINE_OWNED");
                assert.match(error.message, /pnpm test acceptance/);
                return true;
            }
        );

        // The refusal is per criterion. The unbound one beside it still moves,
        // which is what keeps a partly-automated card usable.
        const applied = await setCardAcceptance(workspace, created.id, { check: [2] });
        assert.equal(applied.changed.length, 1);
        assert.equal(applied.acceptance.items[1].checked, true);
        assert.equal(applied.acceptance.items[0].checked, false);

        // And `done` is still refused, because the criterion nothing has proved
        // is exactly the one the binding put out of reach.
        await assert.rejects(
            () => transitionCard(workspace, created.id, "done"),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_UNMET");
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

test("doctor reports a binding whose criterion was reworded", async () => {
    const { workspace, cleanup } = await workspaceAllowing([["pnpm", "test"]]);
    try {
        const criterion = "The gate refuses done while a criterion is unproven.";
        const created = await createCard(workspace, {
            title: "A card whose criterion is about to change",
            type: "task",
            area: "api",
            body: ["## Acceptance criteria", "", `- [ ] ${criterion}`, ""].join("\n"),
            verify: [
                { id: "gate", run: ["pnpm", "test", "acceptance"], criteria: [criterionDigest(criterion)] }
            ]
        });
        const diagnose = async () => {
            const loaded = await loadCards(workspace);
            return await diagnoseCards({ ...loaded, workspace });
        };
        assert.equal(
            (await diagnose()).issues.filter(
                (found: any) => found.code === "verify-binding-stale"
            ).length,
            0
        );

        // The body is not the field validator's to see — `card write` goes
        // through `bodyOnly`, so the write succeeds and the binding is left
        // pointing at text nobody carries. That is exactly what doctor is for.
        await patchCardBody(
            workspace,
            created.id,
            {
                body: [
                    "## Acceptance criteria",
                    "",
                    "- [ ] The gate refuses done, always.",
                    ""
                ].join("\n")
            }
        );
        const issues = (await diagnose()).issues.filter(
            (found: any) => found.code === "verify-binding-stale"
        );
        assert.equal(issues.length, 1);
        const [stale] = issues as any[];
        assert.equal(stale.severity, "warning");
        assert.match(stale.message, /gate/);
        assert.deepEqual(
            stale.details.bindings.map((binding: any) => binding.entry),
            ["gate"]
        );
    } finally {
        await cleanup();
    }
});
