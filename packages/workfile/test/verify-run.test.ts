import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    createCard,
    criterionDigest,
    loadCards,
    loadWorkspace,
    patchCard,
    runCardVerification,
    setCardAcceptance,
    transitionCard,
    validateProjectConfig
} from "../dist/src/index.js";
import { DEFAULT_CONFIG } from "../dist/src/config/defaults.js";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));

/**
 * The only command every machine this suite runs on can start without a shell.
 *
 * Not `pnpm`, and the reason is the same one the docs give: `pnpm` is a `.cmd`
 * shim on Windows and `spawn` without a shell cannot start one, so a suite
 * written against it would prove the runner works on two of the three
 * platforms CI uses. `process.execPath` is an executable on all three, and the
 * scripts below carry no spaces so that Windows argument quoting has nothing to
 * do to them either.
 */
const NODE = process.execPath;

/** A node invocation, as the argv a card would declare. */
const script = (source: string) => [NODE, "-e", source];

const EXITS_ZERO = script("process.exit(0)");
const EXITS_ONE = script("process.exit(1)");
const NEVER_EXITS = script("setInterval(()=>{},1000)");
/** Leaves proof that it ran, for the refusals that must happen first. */
const LEAVES_A_MARK = script("require('fs').writeFileSync('ran.txt','x')");

const CRITERIA = [
    "The gate refuses done while a criterion is unproven.",
    "A forced move names the gate it walked past.",
    "The docs say what the flag does."
];
const BODY = [
    "## Acceptance criteria",
    "",
    ...CRITERIA.map((text) => `- [ ] ${text}`),
    ""
].join("\n");

/**
 * The golden fixture, told which commands it permits and how long they get.
 *
 * Written to disk and loaded through the real loader rather than assembled in
 * memory, for the reason `verify-allowlist.test.ts` gives: every rule under test
 * reads what the *project declares*, and a hand-built config object would prove
 * it against something this suite made up.
 */
async function workspaceAllowing(
    commands: unknown[],
    { timeoutSeconds = undefined as number | undefined, root = null as string | null } = {}
) {
    const created = root ? null : await createTestWorkspace();
    const at = root || created!.root;
    await writeFile(
        join(at, "project.config.mjs"),
        `export default ${JSON.stringify(
            {
                schemaVersion: 2,
                name: "Golden workspace",
                cards: {
                    areas: ["api", "web", "infra", "docs"],
                    verification: {
                        commands,
                        ...(timeoutSeconds === undefined ? {} : { timeoutSeconds })
                    }
                }
            },
            null,
            4
        )};\n`
    );
    return {
        root: at,
        cleanup: created ? created.cleanup : async () => {},
        workspace: await loadWorkspace({ root: at })
    };
}

async function cardBody(workspace, id: string): Promise<string> {
    const { cards } = await loadCards(workspace);
    return cards.find((card: any) => card.id === id).body;
}

/** The card's trail lines that a verify run wrote. */
async function verifyTrail(workspace, id: string): Promise<string[]> {
    return (await cardBody(workspace, id))
        .split("\n")
        .filter((line) => /^- \d{4}-\d{2}-\d{2} .* · verify /.test(line));
}

const boxes = (body: string) =>
    body
        .split("\n")
        .filter((line) => /^- \[[ x]\]/.test(line))
        .map((line) => line[3] === "x");

test("an entry that expects an absence is proved by the command NOT finding it", async () => {
    // The trap this removes, measured before it existed: a criterion asserting
    // that a literal is gone was bound to a search, the literal was present in
    // two files, and the gate answered `checked`. A search exits 0 when it
    // FINDS, so the binding marked the criterion satisfied exactly while it was
    // false — and there was no way to invert it, because the allowlist demands
    // the command start with a search and it is spawned without a shell.
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card whose criterion claims something is gone",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                // Stands for a search that finds nothing: exit 1 is the success.
                {
                    id: "gone",
                    run: EXITS_ONE,
                    expect: "absent",
                    criteria: [criterionDigest(CRITERIA[0])]
                },
                // And its mirror: a search that still finds it is the failure,
                // which under the old polarity would have been the pass.
                {
                    id: "still-there",
                    run: EXITS_ZERO,
                    expect: "absent",
                    criteria: [criterionDigest(CRITERIA[2])]
                }
            ]
        });

        const report = await runCardVerification(workspace, created.id, {
            actor: "runner@test"
        });

        const [gone, still] = report.entries;
        // The exit codes are the opposite of the verdicts, which is the point.
        assert.equal(gone.outcome, "failed");
        assert.equal(gone.code, 1);
        assert.equal(gone.satisfied, true, "finding nothing proves an absence");
        assert.deepEqual(gone.checked, [1]);

        assert.equal(still.outcome, "passed");
        assert.equal(still.code, 0);
        assert.equal(still.satisfied, false, "finding it disproves the absence");
        assert.deepEqual(still.checked, []);

        // `ok` reads `satisfied`, never the exit code: reading the outcome here
        // would call a proved entry a failed run and a false one a pass.
        assert.equal(report.ok, false, "one of the two absences is not true");

        // And the card says what was proved, not how the process ended.
        const trail = await verifyTrail(workspace, created.id);
        assert.ok(
            trail.some((line) => /found nothing, as expected/.test(line)),
            `the trail does not say what the entry proved: ${trail.join(" | ")}`
        );
        // The disproved entry writes NO trail line, and that is right rather
        // than missing: its criterion was already unchecked, so the write is a
        // no-op and a no-op does not earn a line. What records the failure is
        // `satisfied: false` above and the criterion staying unmarked below.
        assert.doesNotMatch(trail.join(" | "), /still-there/);
        // Criteria are 1-based, so `checked: [1]` is the first box.
        assert.deepEqual(boxes(await cardBody(workspace, created.id)), [
            true,
            false,
            false
        ]);
    } finally {
        await cleanup();
    }
});

test("a passing entry checks exactly the criteria bound to it, and no others", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card whose criteria two commands prove",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] },
                { id: "docs", run: EXITS_ONE, criteria: [criterionDigest(CRITERIA[2])] }
            ]
        });

        const report = await runCardVerification(workspace, created.id, {
            actor: "runner@test"
        });
        assert.equal(report.ok, false, "one entry failed, so the run did not pass");
        const [gate, docs] = report.entries;
        assert.equal(gate.outcome, "passed");
        assert.equal(gate.code, 0);
        assert.deepEqual(gate.checked, [1]);
        assert.equal(docs.outcome, "failed");
        assert.equal(docs.code, 1);
        assert.deepEqual(docs.checked, []);

        // The whole of the rule, read off the card: the entry that passed wrote
        // its own criterion, the entry that failed wrote nothing, and the
        // criterion neither of them names is untouched by both. A runner that
        // could check anything would be the same hole one rung further in.
        assert.deepEqual(boxes(await cardBody(workspace, created.id)), [
            true,
            false,
            false
        ]);
        assert.deepEqual(report.acceptance.items.map((item: any) => item.checked), [
            true,
            false,
            false
        ]);
    } finally {
        await cleanup();
    }
});

test("a failing run unchecks what a passing one checked, and says so on the trail", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card whose command stops passing",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] }
            ]
        });

        await runCardVerification(workspace, created.id, { actor: "runner@test" });
        assert.equal(boxes(await cardBody(workspace, created.id))[0], true);
        const first = await verifyTrail(workspace, created.id);
        assert.equal(first.length, 1);
        assert.match(first[0], /runner@test · verify gate: /);
        assert.match(first[0], /passed, checked #1$/);

        // The same binding, a command that now says no. The proof does not
        // reproduce, so the box does not stand — and the state change carries
        // the actor and the entry that caused it, which is the whole reason the
        // line exists rather than the change happening silently.
        await patchCard(workspace, created.id, {
            verify: [
                { id: "gate", run: EXITS_ONE, criteria: [criterionDigest(CRITERIA[0])] }
            ]
        });
        const report = await runCardVerification(workspace, created.id, {
            actor: "runner@test"
        });
        assert.equal(report.ok, false);
        assert.deepEqual(report.entries[0].unchecked, [1]);
        assert.equal(boxes(await cardBody(workspace, created.id))[0], false);

        const second = await verifyTrail(workspace, created.id);
        assert.equal(second.length, 2);
        assert.match(second[1], /verify gate: .*failed \(exit 1\), unchecked #1$/);

        // And a re-run that changes nothing writes no third line. The trail is
        // five to fifteen lines over a card's life, not a log of invocations.
        await runCardVerification(workspace, created.id, { actor: "runner@test" });
        assert.equal((await verifyTrail(workspace, created.id)).length, 2);
    } finally {
        await cleanup();
    }
});

test("a run that reached no verdict writes nothing at all", async () => {
    // One second, declared by the project, so this exercises the config key
    // rather than the argument that overrides it. The command that does not
    // exist is declared too: this is about what the runner does with a command
    // it was told to run, and an undeclared one never gets that far.
    const { workspace, cleanup } = await workspaceAllowing(
        [[NODE], ["workfile-no-such-command-anywhere"]],
        { timeoutSeconds: 1 }
    );
    try {
        const digest = criterionDigest(CRITERIA[0]);
        const created = await createCard(workspace, {
            title: "A card whose command hangs",
            type: "task",
            area: "api",
            body: BODY,
            verify: [{ id: "gate", run: EXITS_ZERO, criteria: [digest] }]
        });
        await runCardVerification(workspace, created.id, { actor: "runner@test" });
        assert.equal(boxes(await cardBody(workspace, created.id))[0], true);

        // Killing a command at the timeout is us giving up, not the command
        // deciding; a machine that cannot start the command at all has decided
        // even less. Neither is a fact about the criterion, and unchecking on
        // either would let a run on the wrong machine erase a proof a right one
        // produced — which `card ac --check` could not put back, because the
        // criterion is machine-owned.
        for (const [label, run] of [
            ["timed-out", NEVER_EXITS],
            ["errored", ["workfile-no-such-command-anywhere"]]
        ] as Array<[string, string[]]>) {
            await patchCard(workspace, created.id, {
                verify: [{ id: "gate", run, criteria: [digest] }]
            });
            const report = await runCardVerification(workspace, created.id, {
                actor: "runner@test"
            });
            assert.equal(report.entries[0].outcome, label);
            assert.equal(report.ok, false, label);
            assert.deepEqual(report.entries[0].checked, [], label);
            assert.deepEqual(report.entries[0].unchecked, [], label);
            assert.ok(report.entries[0].reason, `${label} says why there is no verdict`);
            assert.equal(boxes(await cardBody(workspace, created.id))[0], true, label);
            assert.equal((await verifyTrail(workspace, created.id)).length, 1, label);
        }
    } finally {
        await cleanup();
    }
});

test("a command that prints more than the report holds is bounded, not accumulated", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card whose command is noisy",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                {
                    id: "loud",
                    // Written in pieces so the last bytes are identifiable: the
                    // tail is what the report keeps, and a reader looking for a
                    // failure looks at the end.
                    // `process.exitCode` rather than `process.exit`, which
                    // would drop whatever is still buffered — the tail is the
                    // whole point of the assertion below.
                    run: script(
                        "for(let i=0;i<40000;i++)process.stdout.write('line'+i+'\\n');process.exitCode=1"
                    )
                }
            ]
        });
        const report = await runCardVerification(workspace, created.id);
        const [loud] = report.entries;
        assert.equal(loud.outcome, "failed");
        assert.equal(loud.truncated, true);
        // The whole stream is around 470 KiB. What survives is the last 64 KiB,
        // and it has to be the *last* — the head of a test run is a banner and
        // the tail is what failed.
        assert.ok(
            Buffer.byteLength(loud.stdout) <= 64 * 1024,
            `kept ${Buffer.byteLength(loud.stdout)} bytes`
        );
        assert.match(loud.stdout, /line39999\n$/);
    } finally {
        await cleanup();
    }
});

test("a command the project does not permit is refused before anything runs", async () => {
    // Declared while the card is written, withdrawn afterwards. That is the
    // case the read-side check exists for: a card is a Markdown file, so one
    // can arrive in a diff — or outlive the policy that admitted it — without
    // ever calling a mutation.
    const permissive = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(permissive.workspace, {
            title: "A card naming a command the project withdrew",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] },
                { id: "stray", run: LEAVES_A_MARK }
            ]
        });
        const strict = await workspaceAllowing([[NODE, "-e", "process.exit(0)"]], {
            root: permissive.root
        });

        for (const only of [null, ["gate"]]) {
            await assert.rejects(
                () => runCardVerification(strict.workspace, created.id, { only }),
                (error: any) => {
                    assert.equal(error.code, "CARD_VERIFY_COMMAND_NOT_ALLOWED");
                    assert.equal(error.details.entry, "stray");
                    return true;
                },
                // Selecting only the permitted entry does not get the card past
                // the gate. `validateVerify` refuses the whole block on write
                // for the same reason: a card carrying a command the project
                // refuses is refused until the block goes, and a run that
                // executed the permitted half of one would be where that bent.
                JSON.stringify(only)
            );
        }
        await assert.rejects(
            () => readFile(join(permissive.root, "ran.txt"), "utf8"),
            "the refused entry must not have run"
        );
        assert.deepEqual(boxes(await cardBody(strict.workspace, created.id)), [
            false,
            false,
            false
        ]);
    } finally {
        await permissive.cleanup();
    }
});

test("a card declaring nothing, and an entry nobody declared, are both refused", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const bare = await createCard(workspace, {
            title: "A card with criteria and no commands",
            type: "task",
            area: "api",
            body: BODY
        });
        await assert.rejects(
            () => runCardVerification(workspace, bare.id),
            (error: any) => {
                assert.equal(error.code, "CARD_VERIFY_NONE_DECLARED");
                return true;
            }
        );

        const bound = await createCard(workspace, {
            title: "A card with one entry",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] }
            ]
        });
        await assert.rejects(
            () => runCardVerification(workspace, bound.id, { only: ["typo"] }),
            (error: any) => {
                assert.equal(error.code, "CARD_VERIFY_ENTRY_UNKNOWN");
                assert.deepEqual(error.details.declared, ["gate"]);
                return true;
            }
        );
        await assert.rejects(
            () => runCardVerification(workspace, "T-9999"),
            (error: any) => {
                assert.equal(error.code, "CARD_NOT_FOUND");
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

test("a criterion reworded while the commands ran refuses the write rather than moving the wrong line", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card edited between binding and run",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] }
            ]
        });

        // What a rewording does to the binding is already `doctor`'s to report.
        // What it must never do is let the run write whatever criterion moved
        // into that position, which is why the owner map is rebuilt from the
        // card as it reads after the last command exits.
        const path = join(workspace.paths.cards, (await loadCards(workspace)).cards
            .find((card: any) => card.id === created.id).file);
        const content = await readFile(path, "utf8");
        await writeFile(path, content.replace(CRITERIA[0], "Something else entirely."));

        const report = await runCardVerification(workspace, created.id);
        assert.equal(report.entries[0].outcome, "passed");
        assert.deepEqual(report.entries[0].criteria, []);
        assert.deepEqual(report.entries[0].checked, []);
        assert.equal(report.entries[0].writeError, null);
        assert.deepEqual(boxes(await cardBody(workspace, created.id)), [
            false,
            false,
            false
        ]);
    } finally {
        await cleanup();
    }
});

test("a verified run is what lets the card close, and a hand-written check still cannot", async () => {
    const { workspace, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const body = ["## Acceptance criteria", "", `- [ ] ${CRITERIA[0]}`, ""].join("\n");
        const created = await createCard(workspace, {
            title: "A card only its command can close",
            type: "task",
            area: "api",
            body,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] }
            ]
        });

        await assert.rejects(
            () => setCardAcceptance(workspace, created.id, { check: [1] }),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_MACHINE_OWNED");
                return true;
            }
        );
        await assert.rejects(
            () => transitionCard(workspace, created.id, "done"),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_UNMET");
                return true;
            }
        );

        const report = await runCardVerification(workspace, created.id, {
            actor: "runner@test"
        });
        assert.equal(report.ok, true);
        const closed = await transitionCard(workspace, created.id, "done", {
            actor: "runner@test"
        });
        assert.equal(closed.card.status, "done");
        assert.equal(closed.card.verified.method, "local");
    } finally {
        await cleanup();
    }
});

test("cards.verification.timeoutSeconds has to be a number of seconds a command could survive", async () => {
    const codesFor = (timeoutSeconds: unknown) =>
        validateProjectConfig({
            ...DEFAULT_CONFIG,
            name: "x",
            cards: {
                ...DEFAULT_CONFIG.cards,
                verification: {
                    ...DEFAULT_CONFIG.cards.verification,
                    timeoutSeconds
                }
            }
        })
            .filter(
                (found: any) => found.path === "cards.verification.timeoutSeconds"
            )
            .map((found: any) => found.code);

    // Zero and a negative fire before any real command could exit, so every
    // entry would report `timed-out` and the project would read the gate as
    // broken rather than as configured. A day is `Infinity` written in digits,
    // which is the state the default exists to prevent.
    for (const value of [0, -1, 1.5, "600", null, 86_400]) {
        assert.deepEqual(
            codesFor(value),
            ["CONFIG_CARDS_VERIFY_TIMEOUT_INVALID"],
            JSON.stringify(value)
        );
    }
    for (const value of [1, 600, 43_200]) {
        assert.deepEqual(codesFor(value), [], String(value));
    }
});

test("the CLI reports each entry, exits non-zero on a failure, and refuses --dry-run", async () => {
    const { workspace, root, cleanup } = await workspaceAllowing([[NODE]]);
    try {
        const created = await createCard(workspace, {
            title: "A card the binary runs",
            type: "task",
            area: "api",
            body: BODY,
            verify: [
                { id: "gate", run: EXITS_ZERO, criteria: [criterionDigest(CRITERIA[0])] },
                { id: "docs", run: EXITS_ONE, criteria: [criterionDigest(CRITERIA[2])] }
            ]
        });
        const run = async (args: string[]) => {
            try {
                const { stdout, stderr } = await execute(
                    process.execPath,
                    [cli, "card", "verify", created.id, "--root", root, ...args],
                    { encoding: "utf8", maxBuffer: 1 << 20 }
                );
                return { code: 0, stdout, stderr };
            } catch (error: any) {
                return {
                    code: error.code ?? 1,
                    stdout: error.stdout ?? "",
                    stderr: error.stderr ?? ""
                };
            }
        };

        const json = await run(["--json"]);
        assert.equal(json.code, 1, "an entry failed, so the command did not succeed");
        const report = JSON.parse(json.stdout);
        assert.equal(report.ok, false);
        assert.deepEqual(
            report.entries.map((entry: any) => [entry.id, entry.outcome]),
            [
                ["gate", "passed"],
                ["docs", "failed"]
            ]
        );
        assert.equal(report.timeoutSeconds, 600);

        const only = await run(["--only", "gate"]);
        assert.equal(only.code, 0, "the selected entry passed");
        assert.match(only.stdout, /PASSED\s+gate/);
        assert.doesNotMatch(only.stdout, /docs/);

        // `--dry-run` previews filesystem changes, and a run that spawns every
        // declared command and only skips the write-back has already done the
        // part worth previewing. Refused by the flag's own rule rather than by
        // a special case here.
        const dry = await run(["--dry-run"]);
        assert.equal(dry.code, 1);
        assert.match(`${dry.stdout}${dry.stderr}`, /CLI_FLAG_UNSUPPORTED/);
        assert.match(`${dry.stdout}${dry.stderr}`, /card show/);
    } finally {
        await cleanup();
    }
});
