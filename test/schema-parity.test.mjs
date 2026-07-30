import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// UI modules import each other without a file extension, which the bundler
// resolves and Node's ESM loader does not. Teaching the loader that rule here
// keeps the production code free of build-tool-specific import syntax.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith(".") || /\.[a-z]+$/.test(specifier)) {
            return nextResolve(specifier, context);
        }
        try {
            return nextResolve(specifier, context);
        } catch {
            return nextResolve(`${specifier}.ts`, context);
        }
    }
});

import {
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES,
    CHANGE_TYPES,
    CHANGE_VISIBILITIES,
    DEFAULT_CONFIG,
    DOC_KINDS,
    DOC_STATUSES,
    MEMORY_DEFINITIONS
} from "../dist/src/config/defaults.js";

// The UI carries its own copy of the runtime vocabularies for the first render
// and for when the server is unreachable. Both are reachable in production, and
// the copy had drifted: it offered a document status the server rejects
// ("deprecated") and hid five kinds and two statuses that are valid. Nothing
// caught it because nothing compared them.
//
// Same reasoning as the tree-model suite: skipping locally is fine, skipping in
// CI would report green with zero coverage.
const canLoadTypeScript = Boolean(process.features.typescript);
if (!canLoadTypeScript && process.env.CI) {
    throw new Error(
        "This runtime cannot strip TypeScript types, so UI/core schema drift would go "
        + "undetected while CI still reported green. Run CI on Node >= 22.18."
    );
}

const suite = canLoadTypeScript
    ? test
    : (name) => test(name, { skip: "runtime cannot strip TypeScript types" }, () => {});

const types = canLoadTypeScript ? await import("../ui/src/types.ts") : null;

suite("the UI card vocabularies match the core ones exactly", () => {
    assert.deepEqual([...types.STATUSES], [...CARD_STATUSES]);
    assert.deepEqual([...types.TYPES], [...CARD_TYPES]);
    assert.deepEqual([...types.PRIORITIES], [...CARD_PRIORITIES]);
});

suite("the UI fallback schema matches the effective schema", async () => {
    // Parsed out of the source rather than imported: main.tsx pulls in React
    // and mounts on import, and this constant is the thing under test.
    const source = await readFile(
        fileURLToPath(new URL("../ui/src/main.tsx", import.meta.url)),
        "utf8"
    );
    const literal = (key, block) => {
        const match = block.match(
            new RegExp(`${key}:\\s*(\\[[\\s\\S]*?\\]|"[^"]*")`)
        );
        assert.ok(match, `${key} not found in the fallback schema`);
        return JSON.parse(match[1].replace(/,(\s*[\]}])/g, "$1"));
    };
    const section = (name) => {
        const start = source.indexOf(`    ${name}: {`);
        assert.notEqual(start, -1, `${name} section not found`);
        return source.slice(start, source.indexOf("\n    },", start));
    };

    const docs = section("docs");
    assert.deepEqual(literal("kinds", docs), [...DOC_KINDS]);
    assert.deepEqual(literal("statuses", docs), [...DOC_STATUSES]);
    assert.equal(
        literal("kind", docs.slice(docs.indexOf("defaults"))),
        DEFAULT_CONFIG.docs.defaultKind
    );
    assert.equal(
        literal("status", docs.slice(docs.indexOf("defaults"))),
        DEFAULT_CONFIG.docs.defaultStatus
    );

    const changelog = section("changelog");
    assert.deepEqual(literal("types", changelog), [...CHANGE_TYPES]);
    assert.deepEqual(literal("visibilities", changelog), [...CHANGE_VISIBILITIES]);

    const cards = section("cards");
    assert.deepEqual(literal("efforts", cards), [...CARD_EFFORTS]);

    // Memory collections, including the order of their statuses: the UI listed
    // the decision statuses in a different order, which is the kind of drift
    // that silently reorders a select.
    for (const [id, definition] of Object.entries(MEMORY_DEFINITIONS)) {
        const entry = source.match(
            new RegExp(`\\{ id: "${id}",[^}]*\\}`)
        );
        assert.ok(entry, `memory collection ${id} missing from the fallback`);
        assert.match(entry[0], new RegExp(`idPrefix: "${definition.idPrefix}"`));
        assert.match(entry[0], new RegExp(`singular: "${definition.singular}"`));
        assert.deepEqual(
            JSON.parse(entry[0].match(/statuses: (\[[^\]]*\])/)[1]),
            [...definition.statuses],
            `${id} statuses`
        );
    }
});

// Navigation used to be invisible to the browser: every state change went
// through `replaceState`, so the history never grew and Back left the app.
suite("URL state distinguishes navigation from filtering", async () => {
    const query = await import("../ui/src/query.ts");
    const calls = [];
    const filters = {
        search: "",
        status: "",
        area: "",
        type: "",
        priority: "",
        milestone: "",
        showIdeas: false,
        showClosed: false
    };

    globalThis.location = { pathname: "/", search: "" };
    globalThis.history = {
        pushState: (_state, _title, url) => {
            calls.push(["push", url]);
            globalThis.location.search = url.includes("?")
                ? url.slice(url.indexOf("?"))
                : "";
        },
        replaceState: (_state, _title, url) => {
            calls.push(["replace", url]);
            globalThis.location.search = url.includes("?")
                ? url.slice(url.indexOf("?"))
                : "";
        }
    };

    try {
        // A filter change rewrites the entry: one per keystroke would bury the
        // page the user came from.
        query.writeUrlState("explorer", { ...filters, search: "bill" }, null);
        assert.deepEqual(calls.at(-1), ["replace", "/?q=bill"]);

        // Switching view is navigation.
        query.writeUrlState("flow", filters, null, { push: true });
        assert.deepEqual(calls.at(-1), ["push", "/?view=flow"]);

        // Opening a record is navigation too.
        query.writeUrlState("flow", filters, "T-0042", { push: true });
        assert.deepEqual(calls.at(-1), ["push", "/?view=flow&record=T-0042"]);

        // Asking to push the URL that is already current would make Back a
        // no-op, so it degrades to a replace.
        query.writeUrlState("flow", filters, "T-0042", { push: true });
        assert.deepEqual(calls.at(-1), [
            "replace",
            "/?view=flow&record=T-0042"
        ]);

        // And what was written can be read back.
        const restored = query.readUrlState();
        assert.equal(restored.view, "flow");
        assert.equal(restored.selectedId, "T-0042");
    } finally {
        delete globalThis.location;
        delete globalThis.history;
    }
});

// Frontmatter carries whatever its author put there — Obsidian writes its own
// keys, an earlier tool wrote others — and the codec preserves all of it. A
// property panel that rendered only the keys it recognised would show a record
// as having less in it than it does.
suite("property inference covers keys the schema does not describe", async () => {
    const { inferKind, cardProperties } = await import(
        "../ui/src/components/property-model.ts"
    );

    assert.equal(inferKind("tags", ["a", "b"]), "list");
    assert.equal(inferKind("created", "2026-07-30"), "date");
    assert.equal(inferKind("parent", "T-0042"), "reference");
    assert.equal(inferKind("description", "free text"), "text");
    // A date-shaped string that is not a date must not become a date control.
    assert.equal(inferKind("slug", "2026-07-3"), "text");
    // Nor an id-shaped one with too few digits.
    assert.equal(inferKind("code", "AB-123"), "text");

    // The controls come from the runtime schema, not from constants: statuses,
    // types and areas are configuration and differ per repository.
    const definitions = cardProperties({
        cards: {
            statuses: ["backlog", "doing"],
            types: ["task"],
            priorities: ["high"],
            efforts: ["S"],
            areas: ["core", "web"]
        }
    });
    const byKey = new Map(definitions.map((entry) => [entry.key, entry]));
    assert.deepEqual(byKey.get("area").options, ["core", "web"]);
    assert.equal(byKey.get("status").kind, "enum");
    assert.equal(byKey.get("tags").kind, "list");
    assert.equal(byKey.get("parent").kind, "reference");

    // The protocol owns these; showing them as editable would promise a write
    // the server refuses.
    for (const key of ["id", "created", "updated", "claimed_by", "claimed_at"]) {
        assert.equal(byKey.get(key).readOnly, true, key);
    }
    assert.equal(byKey.get("title").readOnly, undefined);
});

// Free text used to include the entire Markdown body, so every keystroke
// lower-cased the whole corpus. `body:` still reaches the prose; it just has to
// be asked for.
suite("free text searches identity and metadata, not prose", async () => {
    const { filterTasks } = await import("../ui/src/query.ts");
    const base = {
        status: "backlog",
        type: "task",
        priority: "medium",
        area: "core",
        tags: []
    };
    const tasks = [
        { ...base, id: "T-0001", title: "Billing retries", body: "unrelated" },
        { ...base, id: "T-0002", title: "Unrelated", body: "mentions billing" },
        { ...base, id: "T-0003", title: "Tagged", body: "", tags: ["billing"] }
    ];
    const filters = {
        search: "",
        status: "",
        area: "",
        type: "",
        priority: "",
        milestone: "",
        showIdeas: true,
        showClosed: true
    };
    const ids = (search) =>
        filterTasks(tasks, { ...filters, search }).map((task) => task.id);

    assert.deepEqual(ids("billing"), ["T-0001", "T-0003"], "title and tags");
    assert.deepEqual(ids("body:billing"), ["T-0002"], "prose on request");
    assert.deepEqual(ids("T-0002"), ["T-0002"], "by id");
    assert.deepEqual(ids("-billing"), ["T-0002"], "negation");
    assert.deepEqual(ids("area:core").length, 3, "field filter");
});
