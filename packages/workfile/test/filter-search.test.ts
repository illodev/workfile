import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

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

// Same reasoning as the schema-parity suite: skipping locally is fine,
// skipping in CI would report green with zero coverage.
const canLoadTypeScript = Boolean(process.features.typescript);
if (!canLoadTypeScript && process.env.CI) {
    throw new Error(
        "This runtime cannot strip TypeScript types, so the filter-bar contract would go "
        + "unchecked while CI still reported green. Run CI on Node >= 22.18."
    );
}

const suite = canLoadTypeScript
    ? test
    : (name) => test(name, { skip: "runtime cannot strip TypeScript types" }, () => {});

const uiRoot = new URL("../ui/src/", import.meta.url);

const read = (path: string) => readFile(new URL(path, uiRoot), "utf8");

/** Every ui/src source file, path → content. */
async function sources() {
    const result = new Map<string, string>();
    async function walk(dir: string) {
        for (const entry of await readdir(new URL(dir, uiRoot), {
            withFileTypes: true
        })) {
            const path = `${dir}${entry.name}`;
            if (entry.isDirectory()) await walk(`${path}/`);
            else if (/\.(ts|tsx)$/.test(entry.name))
                result.set(path, await read(path));
        }
    }
    await walk("");
    return result;
}

/** The views whose free text searches the record collections on the server. */
const RECORD_VIEWS = [
    "components/Docs.tsx",
    "components/History.tsx",
    "components/Memory.tsx"
];

/**
 * The record search is a filter like the axes beside it, so it outlives the
 * view it was typed in.
 *
 * Docs, History and Memory each held their term in a `useState("")` that died
 * on reload and on every view switch, while every chip next to it survived
 * both through `query.ts`. `find` is the parameter that fixes that, and it is
 * deliberately not `q`: `q` is card-shaped, read by `filterTasks` without
 * prose, and one parameter for both grammars would let a phrase typed in
 * Memory narrow the Explorer table by a rule nothing there states.
 */
suite("free text round-trips through the URL beside the card query", async () => {
    const query = await import("../ui/src/query.ts");
    const calls: Array<[string, string]> = [];
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
    const wrote = (kind: string, url: string) => {
        calls.push([kind, url]);
        globalThis.location.search = url.includes("?")
            ? url.slice(url.indexOf("?"))
            : "";
    };

    globalThis.location = { pathname: "/", search: "" };
    globalThis.history = {
        pushState: (_state, _title, url) => wrote("push", url),
        replaceState: (_state, _title, url) => wrote("replace", url)
    };

    try {
        // Absent when empty, so every URL the app wrote before this parameter
        // existed is the URL it writes now.
        query.writeUrlState("docs", filters, null);
        assert.deepEqual(calls.at(-1), ["replace", "/?view=docs"]);

        query.writeUrlState("docs", filters, null, { find: "verifactu" });
        assert.deepEqual(calls.at(-1), [
            "replace",
            "/?view=docs&find=verifactu"
        ]);
        assert.equal(query.readUrlState().recordSearch, "verifactu");

        // The two text parameters are independent in both directions, and the
        // record search is not a card filter: dropping it into `Filters` would
        // put it behind the work strip's reset chip, which belongs to a view
        // that never renders it.
        query.writeUrlState(
            "explorer",
            { ...filters, search: "T-0195" },
            null,
            { find: "verifactu" }
        );
        assert.deepEqual(calls.at(-1), [
            "replace",
            "/?view=explorer&q=T-0195&find=verifactu"
        ]);
        const restored = query.readUrlState();
        assert.equal(restored.filters.search, "T-0195");
        assert.equal(restored.recordSearch, "verifactu");
        assert.ok(
            !("recordSearch" in restored.filters),
            "the record search must not be reachable as a card filter"
        );

        // Clearing it takes it out of the address bar rather than leaving an
        // empty `find=` for the next reader to inherit.
        query.writeUrlState("docs", filters, null, { find: "" });
        assert.deepEqual(calls.at(-1), ["replace", "/?view=docs"]);
        assert.equal(query.readUrlState().recordSearch, "");
    } finally {
        delete globalThis.location;
        delete globalThis.history;
    }
});

/**
 * One control, and one sentence per corpus saying what it matches.
 *
 * The three record views each rolled their own field and each promised
 * something different — "decisions, incidents, learnings", "documentation",
 * "fragments and releases" — while all three call the same server helper, and
 * the work views had no field at all. A view that grows its own box grows its
 * own promise with it, which is how they drifted the first time.
 */
suite("one free-text control, and its promise stated once", async () => {
    const all = await sources();
    const control = all.get("components/FilterSearch.tsx");
    assert.ok(control, "ui/src/components/FilterSearch.tsx is gone");

    for (const path of [...RECORD_VIEWS, "main.tsx"]) {
        const source = all.get(path);
        assert.ok(source, `${path} is gone`);
        assert.match(
            source,
            /import \{ FilterSearch \} from "\.\/(components\/)?FilterSearch"/,
            `${path} does not use the shared control`
        );
        assert.match(source, /<FilterSearch\b/, `${path} renders no field`);
    }

    // The work views search cards in the browser; the record views search the
    // collections on the server. Two corpora, and each view says which it is.
    for (const path of RECORD_VIEWS) {
        assert.match(all.get(path) ?? "", /scope="records"/, path);
    }
    assert.match(all.get("main.tsx") ?? "", /scope="cards"/);

    // No view keeps a field of its own beside the shared one.
    for (const [path, source] of all) {
        if (path === "components/FilterSearch.tsx") continue;
        assert.doesNotMatch(
            source,
            /type="search"/,
            `${path} declares its own search input`
        );
    }

    // Each placeholder is written in exactly one place, which is the whole of
    // "decided once": a second copy is a second promise waiting to diverge.
    for (const promise of [...control.matchAll(/"(Search [^"]+…)"/g)]) {
        const owners = [...all]
            .filter(([, source]) => source.includes(promise[1]))
            .map(([path]) => path);
        assert.deepEqual(
            owners,
            ["components/FilterSearch.tsx"],
            `"${promise[1]}" is written in more than one file`
        );
    }
});
