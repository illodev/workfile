import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    DEFAULT_LIST_KEYS,
    parseFrontmatter,
    parseValue,
    patchFrontmatter,
    requireFrontmatter,
    serializeValue
} from "../dist/src/index.js";
import { renderFrontmatterEntry } from "../dist/src/core/frontmatter.js";
import { CARD_LIST_KEYS } from "../dist/src/modules/cards/index.js";
import { CHANGE_LIST_KEYS } from "../dist/src/modules/changelog/index.js";
import { DOC_LIST_KEYS } from "../dist/src/modules/docs/index.js";
import { MEMORY_LIST_KEYS } from "../dist/src/modules/memory/index.js";

test("serializeValue and parseValue are exact inverses", () => {
    const scalars = [
        "Plain title",
        'Sweep RSC: reducir la herencia laxa de "use client"',
        '"Totales" a cero en el 390',
        "Incluir los plazos en 'Sincronizar ahora'",
        "Casillas [62/63] y {74}",
        "#hash-leading",
        "a: b # c"
    ];
    for (const value of scalars) {
        const written = serializeValue("title", value);
        assert.equal(parseValue("title", written), value);
        assert.equal(serializeValue("title", parseValue("title", written)), written);
    }
    const lists = [
        ["apps/api/src/Billing", "packages/sdk"],
        ["one, with comma", 'quoted "tag"', "plain"]
    ];
    for (const value of lists) {
        const written = serializeValue("scope", value);
        assert.deepEqual(parseValue("scope", written), value);
        assert.equal(serializeValue("scope", parseValue("scope", written)), written);
    }
});

test("patchFrontmatter preserves unknown fields and body bytes", () => {
    const content = `---\nid: T-0001\ntitle: Old\nacme.risk: high\ntags: [one]\nupdated: 2026-07-25\n---\n\nBody with trailing spaces.  \n`;
    const patched = patchFrontmatter(
        content,
        { title: "New", tags: ["one", "two"] },
        { today: "2026-07-28" }
    );
    const parsed = parseFrontmatter(patched);
    assert.equal(parsed.metadata.title, "New");
    assert.equal(parsed.metadata["acme.risk"], "high");
    assert.deepEqual(parsed.metadata.tags, ["one", "two"]);
    assert.equal(parsed.metadata.updated, "2026-07-28");
    assert.ok(patched.endsWith("\nBody with trailing spaces.  \n"));
});

// Obsidian, `yaml.dump` and most models write sequences as block lists. The
// line-oriented codec read them as empty and, on the first patch, replaced only
// the `key:` line — leaving the items orphaned and the document invalid YAML.
test("block sequences survive reading, patching and deletion", () => {
    const source = [
        "---",
        "id: T-0042",
        "tags:",
        "  - alpha",
        "  - beta",
        "depends:",
        "  - T-0001",
        "status: backlog",
        "---",
        "Body stays put.",
        ""
    ].join("\n");

    const parsed = parseFrontmatter(source);
    assert.deepEqual(parsed.metadata.tags, ["alpha", "beta"]);
    assert.deepEqual(parsed.metadata.depends, ["T-0001"]);
    assert.equal(parsed.styles.tags, "block");
    assert.equal(parsed.styles.status, "flow");

    const patched = patchFrontmatter(
        source,
        { tags: ["gamma", "delta"], status: "doing" },
        { today: "2026-07-30" }
    );

    // No orphans: what comes back out is what went in.
    const reparsed = parseFrontmatter(patched);
    assert.deepEqual(reparsed.metadata.tags, ["gamma", "delta"]);
    assert.deepEqual(reparsed.metadata.depends, ["T-0001"]);
    assert.equal(reparsed.metadata.status, "doing");
    assert.equal(reparsed.body, "Body stays put.\n");

    // The block style is kept, so the tool does not rewrite the author's file
    // into its own dialect on every touch.
    assert.match(patched, /tags:\n {2}- gamma\n {2}- delta\n/);
    assert.equal(reparsed.styles.tags, "block");

    // Removing a block key removes all of its lines.
    const removed = parseFrontmatter(
        patchFrontmatter(source, { tags: [] }, { today: "2026-07-30" })
    );
    assert.equal("tags" in removed.metadata, false);
    assert.deepEqual(removed.metadata.depends, ["T-0001"]);
    assert.equal(removed.metadata.status, "backlog");
});

// The boundary this asserts moved once: a mapping one level deep used to be
// opaque and is now modelled, because ADR-0016 needs one. Everything past that
// level is still refused rather than mangled, which is the property that
// mattered here and still does.
test("block scalars round-trip and deeper nesting is refused, not mangled", () => {
    const source = [
        "---",
        "id: DOC-0001",
        "summary: |",
        "  first line",
        "  second line",
        "deep:",
        "  a: 1",
        "  b:",
        "    c: 2",
        "title: Kept",
        "---",
        "Body.",
        ""
    ].join("\n");

    const parsed = parseFrontmatter(source);
    assert.equal(parsed.metadata.summary, "first line\nsecond line");
    assert.equal(parsed.styles.summary, "literal");
    assert.equal(parsed.styles.deep, "opaque");

    const patched = patchFrontmatter(
        source,
        { title: "Changed" },
        { today: "2026-07-30" }
    );
    // The keys this codec does not model are carried through untouched.
    assert.match(patched, /deep:\n {2}a: 1\n {2}b:\n {4}c: 2\n/);
    assert.equal(parseFrontmatter(patched).metadata.summary, "first line\nsecond line");

    // Rewriting one of them would silently destroy structure, so it errors.
    assert.throws(
        () => patchFrontmatter(source, { deep: "flat" }),
        /nested structure/
    );
});

test("patching keeps the document's line endings", () => {
    const crlf = [
        "---",
        "id: T-0001",
        "status: backlog",
        "---",
        "Body with CRLF.",
        ""
    ].join("\r\n");

    const patched = patchFrontmatter(
        crlf,
        { status: "doing" },
        { today: "2026-07-30" }
    );
    assert.equal(/(?<!\r)\n/.test(patched.split("---")[1]), false);
    assert.equal(parseFrontmatter(patched).metadata.status, "doing");
});

// `parseFrontmatter` answers null for a file with no `---` block, and six
// mutation paths read `.prefixLength` straight off it. The condition is rare —
// an interrupted write, a merge that ate the header — but it surfaced as
// `Cannot read properties of null` from inside a mutation, with a write lock
// already taken and no mention of the offending file.
test("requireFrontmatter reports a missing header as a protocol error", () => {
    const parsed = requireFrontmatter("---\ntitle: Present\n---\n\nBody.\n");
    assert.equal(parsed.metadata.title, "Present");

    let failure;
    try {
        requireFrontmatter("No header at all.\n", {
            path: ".project/cards/T-0001.md"
        });
    } catch (error) {
        failure = error;
    }
    assert.ok(failure, "a record with no header must not parse silently");
    assert.equal(failure.code, "RECORD_FRONTMATTER_MISSING");
    assert.match(failure.message, /T-0001\.md/);
    assert.equal(failure.status, 400);
    assert.deepEqual(failure.details, { path: ".project/cards/T-0001.md" });
    assert.notEqual(failure.name, "TypeError");
});

// ADR-0016 draws the done gate's two new fields as nested YAML — `verify:` as a
// sequence of mappings, `verified:` as a mapping. Both parsed back as raw
// indented text and threw a bare `Error` on the first write, so the design of
// record was not writable by the codec it was designed for.
test("a sequence of mappings parses as records and survives a write", () => {
    const content = `---\nid: T-0185\nverify:\n  - id: gate-test\n    run: pnpm test acceptance\n    criteria: ["sha256:ab12", "sha256:cd34"]\n  - id: lint\n    run: pnpm lint\ntags: [protocol]\n---\n\nBody.\n`;
    const parsed = parseFrontmatter(content, { listKeys: new Set(["tags"]) });

    assert.equal(parsed.styles.verify, "records");
    assert.deepEqual(parsed.metadata.verify, [
        {
            id: "gate-test",
            run: "pnpm test acceptance",
            criteria: ["sha256:ab12", "sha256:cd34"]
        },
        { id: "lint", run: "pnpm lint" }
    ]);
    // The list one level down is a list because it is written as one. Deciding
    // by key name would write `criteria` back out as the scalar "sha256:ab12".
    assert.ok(Array.isArray(parsed.metadata.verify[0].criteria));

    const rewritten = patchFrontmatter(
        content,
        { verify: parsed.metadata.verify },
        { listKeys: new Set(["tags"]), touchUpdated: false }
    );
    assert.equal(rewritten, content);
});

test("a mapping one level deep parses as one and survives a write", () => {
    const content = `---\nid: T-0186\nverified:\n  at: "2026-08-05T10:12:00Z"\n  method: ci\n  commit: 4b939fd\n---\n\nBody.\n`;
    const parsed = parseFrontmatter(content);

    assert.equal(parsed.styles.verified, "mapping");
    assert.deepEqual(parsed.metadata.verified, {
        at: "2026-08-05T10:12:00Z",
        method: "ci",
        commit: "4b939fd"
    });
    assert.equal(
        patchFrontmatter(
            content,
            { verified: parsed.metadata.verified },
            { touchUpdated: false }
        ),
        content
    );
});

test("a key written for the first time takes its style from the value", () => {
    const content = "---\nid: T-0001\n---\n\nBody.\n";
    const written = patchFrontmatter(
        content,
        { verified: { method: "ci", commit: "4b939fd" } },
        { touchUpdated: false }
    );
    assert.equal(
        written,
        "---\nid: T-0001\nverified:\n  method: ci\n  commit: 4b939fd\n---\n\nBody.\n"
    );
    // And a value that changes shape changes style with it, rather than being
    // written into the one it happened to be read in.
    assert.match(
        patchFrontmatter(written, { verified: "manual" }, { touchUpdated: false }),
        /\nverified: manual\n/
    );
});

// The shapes below are all legal YAML and all one step outside what the codec
// holds. Reading them as something else would rewrite somebody's file into
// something they did not write, so each stays opaque — the behaviour every
// nested value had before this.
test("a nested shape the codec cannot hold stays opaque", () => {
    const cases: Array<[string, string]> = [
        ["a sequence under a field", "x:\n  - id: g\n    criteria:\n      - sha256:ab"],
        ["a field indented past its record", "x:\n  - id: g\n      run: y"],
        ["a key repeated inside one record", "x:\n  - id: g\n    id: h"],
        ["a mapping two levels deep", "x:\n  a: 1\n  b:\n    c: 2"],
        ["a field that opens a block", "x:\n  a:"]
    ];
    for (const [label, block] of cases) {
        const parsed = parseFrontmatter(`---\nid: T-1\n${block}\n---\n\nBody.\n`);
        assert.equal(parsed.styles.x, "opaque", label);
        assert.equal(typeof parsed.metadata.x, "string", label);
    }
});

test("a declared list key is never read as a structure", () => {
    const listKeys = new Set(["tags"]);
    const parsed = parseFrontmatter(
        '---\nid: T-1\ntags:\n  - id: one\n  - id: two\n---\n\nBody.\n',
        { listKeys }
    );
    assert.equal(parsed.styles.tags, "block");
    assert.deepEqual(parsed.metadata.tags, ["id: one", "id: two"]);

    // A sequence of bare items is a list of strings whether or not they contain
    // a colon, which is what keeps `records` disjoint from `block`.
    const bare = parseFrontmatter("---\nid: T-1\nx:\n  - id: one\n  - id: two\n---\n\nBody.\n");
    assert.equal(bare.styles.x, "block");
    assert.deepEqual(bare.metadata.x, ["id: one", "id: two"]);
});

test("writing a structure the codec cannot hold is refused with a code", () => {
    const opaque = "---\nid: T-1\nx:\n  a: 1\n  b:\n    c: 2\n---\n\nBody.\n";
    assert.throws(
        () => patchFrontmatter(opaque, { x: [{ id: "g" }] }, { touchUpdated: false }),
        (error: any) => {
            assert.equal(error.code, "RECORD_FRONTMATTER_OPAQUE");
            assert.equal(error.status, 400);
            assert.notEqual(error.constructor.name, "Error");
            return true;
        }
    );
    for (const value of [{ a: { b: 1 } }, [["a"], ["b"]], [{ a: [{ b: 1 }] }]]) {
        assert.throws(
            () =>
                patchFrontmatter("---\nid: T-1\n---\n\nBody.\n", { x: value }, {
                    touchUpdated: false
                }),
            (error: any) => {
                assert.equal(error.code, "RECORD_FRONTMATTER_UNREPRESENTABLE");
                return true;
            },
            JSON.stringify(value)
        );
    }
});

// The corpus this repository keeps is the only test that can prove the classifier
// did not quietly start reading an existing record as something else: 400-odd
// files that predate the change, re-rendered from what they parsed to and
// compared byte for byte.
test("every record in this repository re-renders byte for byte", async () => {
    const protocolRoot = fileURLToPath(new URL("../../../.project", import.meta.url));
    if (!existsSync(protocolRoot)) return;

    const listKeys = new Set([
        ...DEFAULT_LIST_KEYS,
        ...CARD_LIST_KEYS,
        ...CHANGE_LIST_KEYS,
        ...DOC_LIST_KEYS,
        ...MEMORY_LIST_KEYS
    ]);

    const files: string[] = [];
    const walk = async (directory: string) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== ".cache") await walk(path);
            } else if (entry.name.endsWith(".md")) files.push(path);
        }
    };
    await walk(protocolRoot);
    assert.ok(files.length > 100, "the corpus is the point of this test");

    let entries = 0;
    for (const file of files) {
        const parsed = parseFrontmatter(await readFile(file, "utf8"), { listKeys });
        if (!parsed) continue;
        const lines = parsed.frontmatter.split(/\r?\n/);
        for (const [key, [start, end]] of Object.entries(parsed.ranges)) {
            entries += 1;
            assert.equal(
                renderFrontmatterEntry(key, parsed.metadata[key], {
                    listKeys,
                    style: parsed.styles[key],
                    indent: "  "
                }).join("\n"),
                lines.slice(start, end).join("\n"),
                `${key} in ${file}`
            );
        }
    }
    assert.ok(entries > 1000, `only ${entries} entries were compared`);
});
