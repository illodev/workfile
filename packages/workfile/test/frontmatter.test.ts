import assert from "node:assert/strict";
import test from "node:test";

import {
    parseFrontmatter,
    parseValue,
    patchFrontmatter,
    requireFrontmatter,
    serializeValue
} from "../dist/src/index.js";

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

test("block scalars round-trip and nested mappings are refused, not mangled", () => {
    const source = [
        "---",
        "id: DOC-0001",
        "summary: |",
        "  first line",
        "  second line",
        "nested:",
        "  a: 1",
        "  b: 2",
        "title: Kept",
        "---",
        "Body.",
        ""
    ].join("\n");

    const parsed = parseFrontmatter(source);
    assert.equal(parsed.metadata.summary, "first line\nsecond line");
    assert.equal(parsed.styles.summary, "literal");
    assert.equal(parsed.styles.nested, "opaque");

    const patched = patchFrontmatter(
        source,
        { title: "Changed" },
        { today: "2026-07-30" }
    );
    // The keys this codec does not model are carried through untouched.
    assert.match(patched, /nested:\n {2}a: 1\n {2}b: 2\n/);
    assert.equal(parseFrontmatter(patched).metadata.summary, "first line\nsecond line");

    // Rewriting one of them would silently destroy structure, so it errors.
    assert.throws(
        () => patchFrontmatter(source, { nested: "flat" }),
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
