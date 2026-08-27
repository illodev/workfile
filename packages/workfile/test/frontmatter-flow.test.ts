import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { card, createTestWorkspace } from "./support/workspace.ts";

import {
    claimCard,
    loadCards,
    parseFrontmatter,
    patchFrontmatter,
    runDoctor
} from "../dist/src/index.js";
import { CARD_LIST_KEYS } from "../dist/src/modules/cards/index.js";

/**
 * A formatter reformats the YAML header along with the Markdown around it, and
 * a flow sequence wider than its print width comes back spread over lines. The
 * codec read that as `opaque` and refused to rewrite the key — so `card claim`,
 * whose whole job is to write `scope`, died on the first command of the
 * protocol for every card a formatter had reached. 135 of 1 811 on the
 * repository where this surfaced, each one unstartable.
 */

/** Exactly what Prettier emits for a `scope:` too wide for `printWidth: 80`. */
const REWRAPPED = [
    "scope:",
    "  [",
    "    apps/api/src/FubeCore/Domain/Billing/TaxModel/State/Provider/Model349StateProvider.php,",
    "    packages/sdk/src/generated,",
    "  ]"
].join("\n");

const PATHS = [
    "apps/api/src/FubeCore/Domain/Billing/TaxModel/State/Provider/Model349StateProvider.php",
    "packages/sdk/src/generated"
];

function header(block: string) {
    return `---\nid: T-1573\ntitle: Something\n${block}\nupdated: 2026-08-24\n---\n\nBody.\n`;
}

test("a flow sequence broken across lines is the list it was before", () => {
    const parsed = parseFrontmatter(header(REWRAPPED), {
        listKeys: CARD_LIST_KEYS
    });
    assert.equal(parsed.styles.scope, "flow");
    assert.deepEqual(parsed.metadata.scope, PATHS);

    // The trailing comma the formatter leaves behind is not a fourteenth entry,
    // and the surrounding keys are untouched.
    assert.equal(parsed.metadata.title, "Something");
    assert.equal(parsed.metadata.updated, "2026-08-24");

    // A bracket that opens on the key line is the same value written another
    // way, and reads the same.
    const inline = parseFrontmatter(
        header(`scope: [${PATHS[0]},\n  ${PATHS[1]}]`),
        { listKeys: CARD_LIST_KEYS }
    );
    assert.equal(inline.styles.scope, "flow");
    assert.deepEqual(inline.metadata.scope, PATHS);
});

// The one place reading is deliberately lossy. Re-deriving a formatter's line
// breaks would mean knowing its print width, which this codec does not — so the
// key goes back canonical, on the line it would have been written on. It only
// ever happens to a key the patch is already rewriting, and if the formatter
// breaks it again the reader takes it again.
test("a patch writes a re-wrapped key back on one line, and only that key", async () => {
    const source = header(REWRAPPED);
    const patched = patchFrontmatter(
        source,
        { scope: [...PATHS, "apps/client"] },
        { listKeys: CARD_LIST_KEYS, touchUpdated: false }
    );
    assert.match(
        patched,
        new RegExp(`\\nscope: \\[${PATHS[0]}, ${PATHS[1]}, apps/client\\]\\n`)
    );
    assert.equal(patched.includes("  [\n"), false);
    assert.ok(patched.endsWith("---\n\nBody.\n"));

    // Patching a different key leaves the re-wrapped one exactly as written,
    // which is what every one of the 135 cards needed on the way to being read.
    const untouched = patchFrontmatter(
        source,
        { title: "Renamed" },
        { listKeys: CARD_LIST_KEYS, touchUpdated: false }
    );
    assert.ok(untouched.includes(REWRAPPED), "the key nobody patched is verbatim");
});

test("quoting survives the join, and nesting is still refused", () => {
    // A comma inside a quoted item is text, not a separator, however the lines
    // fall — the join must not turn one entry into two.
    const quoted = parseFrontmatter(
        header('tags:\n  [\n    "one, with comma",\n    plain\n  ]'),
        { listKeys: CARD_LIST_KEYS }
    );
    assert.deepEqual(quoted.metadata.tags, ["one, with comma", "plain"]);

    // A list of lists and a list of mappings are lists this codec has no scalar
    // reading of. Guessing one would rewrite the file into something nobody
    // wrote, so they stay opaque exactly as they were.
    for (const inner of ["[a], [b]", "{ id: a }", '"ok", [b]']) {
        const parsed = parseFrontmatter(header(`scope:\n  [\n    ${inner}\n  ]`), {
            listKeys: CARD_LIST_KEYS
        });
        assert.equal(parsed.styles.scope, "opaque", inner);
    }

    // An unterminated sequence is not a sequence.
    assert.equal(
        parseFrontmatter(header("scope:\n  [\n    a,"), {
            listKeys: CARD_LIST_KEYS
        }).styles.scope,
        "opaque"
    );
});

// Only a declared list key. `[a, b]` is the only shape this codec writes and it
// writes it only for those, so those are the only values a re-wrap can reach;
// reading an array out of any other key would send it back through
// `serializeValue`, which has no list rule for it, as the scalar `a,b`.
test("an undeclared key keeps its refusal, and the refusal names the repair", () => {
    const source = header("notes:\n  [\n    alpha,\n    beta\n  ]");
    const parsed = parseFrontmatter(source, { listKeys: CARD_LIST_KEYS });
    assert.equal(parsed.styles.notes, "opaque");

    assert.throws(
        () =>
            patchFrontmatter(
                source,
                { notes: ["gamma"] },
                { listKeys: CARD_LIST_KEYS, touchUpdated: false }
            ),
        (error: any) => {
            assert.equal(error.code, "RECORD_FRONTMATTER_OPAQUE");
            // The old message sent everyone who hit this hunting for nesting
            // that was not there. It has to name the repair for the shape in
            // front of them.
            assert.match(error.message, /on one line/);
            assert.match(error.message, /notes: \[a, b\]/);
            assert.equal(error.details.found, "[");
            return true;
        }
    );
});

test("a card a formatter re-wrapped can be claimed", async () => {
    const { workspace, root, cleanup } = await createTestWorkspace({
        prefix: "workfile-flow-claim-"
    });
    try {
        const file = join(root, ".project", "cards", "T-9001-rewrapped.md");
        await writeFile(
            file,
            card("T-9001", { status: "next" }).replace(
                "\ncreated:",
                `\n${REWRAPPED}\ncreated:`
            )
        );

        const claimed = await claimCard(workspace, "T-9001", {
            actor: "agent-flow"
        });
        assert.equal(claimed.card.status, "doing");
        // The scope survives the claim rather than being dropped or flattened:
        // `claimCard` reuses the card's own scope when none is given, so this is
        // the value that came back out of the re-wrapped header.
        assert.deepEqual(claimed.card.scope, PATHS);

        const written = await readFile(file, "utf8");
        assert.match(written, /\nscope: \[/);
        assert.equal(written.includes("  [\n"), false);

        const { cards } = await loadCards(workspace);
        const reloaded = cards.find((entry) => entry.id === "T-9001");
        assert.deepEqual(reloaded.scope, PATHS);
        assert.equal(reloaded.frontmatterOpaque, undefined);
    } finally {
        await cleanup();
    }
});

// The second half of the fix: what is still opaque has to be findable by
// looking, not by an agent crashing into it on the first command it runs.
test("doctor names the records whose header no write can touch", async () => {
    const { workspace, root, cleanup } = await createTestWorkspace({
        prefix: "workfile-flow-doctor-"
    });
    try {
        await writeFile(
            join(root, ".project", "cards", "T-9002-nested.md"),
            card("T-9002").replace(
                "\ncreated:",
                "\nnotes:\n  a: 1\n  b:\n    c: 2\ncreated:"
            )
        );
        await writeFile(
            join(root, ".project", "cards", "T-9003-rewrapped.md"),
            card("T-9003").replace("\ncreated:", `\n${REWRAPPED}\ncreated:`)
        );

        const report = await runDoctor(workspace, {
            checkPaths: false,
            checkGit: false
        });
        const opaque = report.issues.filter(
            (issue) => issue.code === "frontmatter-opaque"
        );

        // One finding, on the card that is genuinely nested. The re-wrapped one
        // reads now, so it is not a finding — reporting it would be reporting a
        // problem that no longer exists.
        assert.equal(opaque.length, 1);
        assert.equal(opaque[0].id, "T-9002");
        assert.match(String(opaque[0].file), /T-9002-nested\.md$/);
        assert.deepEqual(opaque[0].details.keys, ["notes"]);
        assert.match(opaque[0].message, /RECORD_FRONTMATTER_OPAQUE/);
        assert.match(opaque[0].message, /card claim/);

        // A warning, not an error: the record reads, lists and searches
        // perfectly, and what is broken is a write nobody has attempted yet.
        // Erroring would take the pipeline down over a file that is fine until
        // somebody edits it.
        assert.equal(opaque[0].severity, "warning");
        assert.equal(report.ok, true);
    } finally {
        await cleanup();
    }
});
