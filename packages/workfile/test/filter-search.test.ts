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

// Normalised in the reader, not per assertion, per LRN-0026: a regex here that
// anchors on `\n` matches nothing on a Windows checkout and reports the code it
// was looking at as missing. The next regex added to this file inherits the fix,
// which is the point — its author will be on a machine where the bug cannot
// reproduce.
const read = async (path: string) =>
    (await readFile(new URL(path, uiRoot), "utf8")).replaceAll("\r\n", "\n");

/**
 * The address bar, stubbed, and every URL written through it.
 *
 * `query.ts` reads `location.search` and writes through `history`, so a round
 * trip needs both. Shared by the suites below rather than set up twice: two
 * copies of a stub is two chances for one of them to drift into testing a
 * browser neither suite is running in.
 */
function addressBar() {
    const calls: Array<[string, string]> = [];
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
    return {
        calls,
        /** The parameter names the last write put in the URL, in order. */
        names: () => [
            ...new URLSearchParams(globalThis.location.search).keys()
        ],
        restore: () => {
            delete globalThis.location;
            delete globalThis.history;
        }
    };
}

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
    const bar = addressBar();
    const { calls } = bar;

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
        bar.restore();
    }
});

/** The card filters, all empty, which is the base every write below starts from. */
const NO_CARD_FILTERS = {
    search: "",
    status: "",
    area: "",
    type: "",
    priority: "",
    milestone: "",
    showIdeas: false,
    showClosed: false
};

/**
 * And the axis filters beside the free text, which is the rest of the same job.
 *
 * T-0195 moved the three boxes into the URL and left the five chips where they
 * were: Docs' `managed` toggle, History's state and visibility, Memory's
 * collection and status. Narrowing Memory to open incidents, opening one to read
 * it and coming back handed you every record in the workspace, with nothing in
 * the interface saying the narrowing had ever been there.
 *
 * The names are the part worth pinning. Every one of them is prefixed by its
 * view, and the reason is that the obvious name for Memory's is `status`, which
 * the card filter already owns — a clash `readUrlState` would not report but
 * quietly resolve, because it validates the card `status` against `STATUSES` and
 * answers `""` for anything that is not one. So the loser of the clash filters
 * by nothing, in silence. The disjointness assertion below is that trap, and it
 * derives both sets from what `writeUrlState` actually emits rather than
 * restating them, so a new axis on either side is covered the day it is added.
 */
suite("every record filter round-trips, in a namespace of its own", async () => {
    const query = await import("../ui/src/query.ts");
    const bar = addressBar();
    const { calls } = bar;
    const everyRecordFilter = {
        docs: { managedOnly: true },
        history: { state: "unreleased", visibility: "internal" },
        memory: { collection: "incidents", status: "open" }
    };

    try {
        // Absent when nothing is narrowed, so every URL the app wrote before
        // these parameters existed is the URL it writes now.
        query.writeUrlState("memory", NO_CARD_FILTERS, null, {
            recordFilters: query.NO_RECORD_FILTERS
        });
        assert.deepEqual(calls.at(-1), ["replace", "/?view=memory"]);
        // And omitting the bag entirely is the same as passing an empty one:
        // the views with no record filters to reflect pass neither it nor `find`.
        query.writeUrlState("memory", NO_CARD_FILTERS, null);
        assert.deepEqual(calls.at(-1), ["replace", "/?view=memory"]);

        query.writeUrlState("docs", NO_CARD_FILTERS, null, {
            recordFilters: everyRecordFilter
        });
        const recordNames = bar.names().filter((name) => name !== "view");

        query.writeUrlState(
            "explorer",
            {
                search: "T-0201",
                status: "doing",
                area: "ui",
                type: "bug",
                priority: "medium",
                milestone: "0.9.0",
                showIdeas: true,
                showClosed: true
            },
            null,
            { find: "filters" }
        );
        const cardNames = bar.names().filter((name) => name !== "view");

        // Checked before the names themselves, so a clash is reported as a clash
        // rather than as the renamed parameter it also is.
        const clashes = recordNames.filter((name) => cardNames.includes(name));
        assert.deepEqual(
            clashes,
            [],
            "claimed by both a card filter and a record filter, so one of them " +
                `will silently filter by nothing: ${clashes.join(", ")}`
        );
        assert.deepEqual(
            recordNames,
            [
                "docs-managed",
                "history-state",
                "history-visibility",
                "memory-collection",
                "memory-status"
            ],
            "a record filter is missing from the URL, or its parameter was renamed"
        );

        // Each view's round trip, one at a time, so a failure names the view.
        for (const [view, narrowed] of [
            ["docs", { docs: everyRecordFilter.docs }],
            ["history", { history: everyRecordFilter.history }],
            ["memory", { memory: everyRecordFilter.memory }]
        ] as const) {
            const recordFilters = { ...query.NO_RECORD_FILTERS, ...narrowed };
            query.writeUrlState(view, NO_CARD_FILTERS, null, { recordFilters });
            assert.deepEqual(
                query.readUrlState().recordFilters,
                recordFilters,
                `${view} does not restore its filters from the address bar`
            );
        }

        // A view switch is what actually broke: the filters ride the URL whatever
        // the current view is, so leaving Memory for a card and coming back finds
        // the narrowing still there rather than silently widened.
        query.writeUrlState("explorer", NO_CARD_FILTERS, "T-0201", {
            recordFilters: everyRecordFilter
        });
        assert.deepEqual(
            query.readUrlState().recordFilters,
            everyRecordFilter,
            "the record filters do not survive a view that does not render them"
        );

        // Clearing one takes its parameter out rather than leaving an empty
        // `memory-status=` behind for the next reader to wonder about.
        query.writeUrlState("memory", NO_CARD_FILTERS, null, {
            recordFilters: {
                ...query.NO_RECORD_FILTERS,
                memory: { collection: "incidents", status: "" }
            }
        });
        assert.deepEqual(calls.at(-1), [
            "replace",
            "/?view=memory&memory-collection=incidents"
        ]);
        assert.equal(query.readUrlState().recordFilters.memory.status, "");

        // The card filters and these are two bags, and neither reaches into the
        // other: dropping a record axis into `Filters` would put it behind the
        // work strip's reset chip, in a view that never renders it.
        const restored = query.readUrlState();
        for (const key of ["docs", "history", "memory"]) {
            assert.ok(
                !(key in restored.filters),
                `${key} filters are reachable as a card filter`
            );
        }
    } finally {
        bar.restore();
    }
});

/**
 * And the shell owns all five, which is what makes the round trip above reach
 * the interface at all.
 *
 * A view that keeps its own `useState` for one of these serialises nothing: the
 * URL would carry a value the chip never reads. The pair shape is the tell —
 * `const [collection, setCollection] = useState("")` — so it is what this looks
 * for, in the three views that used to have five of them between them.
 */
suite("no record view owns its own axis filter", async () => {
    const all = await sources();
    const owners: Array<[string, string[], string]> = [
        ["components/Docs.tsx", ["managedOnly"], "DocsFilters"],
        ["components/History.tsx", ["state", "visibility"], "HistoryFilters"],
        ["components/Memory.tsx", ["collection", "status"], "MemoryFilters"]
    ];

    for (const [path, fields, type] of owners) {
        const source = all.get(path);
        assert.ok(source, `${path} is gone`);
        for (const field of fields) {
            assert.doesNotMatch(
                source,
                new RegExp(`\\[\\s*${field}\\s*,\\s*set[A-Z]\\w*\\s*\\]`),
                `${path} holds ${field} in local state, so it dies on reload`
            );
        }
        assert.match(
            source,
            new RegExp(`filters: ${type};`),
            `${path} does not take its filters from the shell`
        );
        assert.match(
            source,
            /onFiltersChange: \(patch: Partial</,
            `${path} takes no patch callback, so a coupled pair cannot clear atomically`
        );
    }

    // And the shell holds them, one bag per view, in the state that reaches the
    // address bar.
    const shell = all.get("main.tsx") ?? "";
    assert.match(shell, /useState<RecordFilters>\(/);
    for (const view of ["docs", "history", "memory"]) {
        assert.match(
            shell,
            new RegExp(`filters=\\{recordFilters\\.${view}\\}`),
            `main.tsx does not pass ${view} its filters`
        );
    }
    assert.match(shell, /writeUrlState\([\s\S]{0,200}recordFilters/);
    // Both directions. Writing without restoring on `popstate` means Back walks
    // the address bar over a narrowing the chips never come off.
    assert.match(
        shell,
        /setRecordFilters\(next\.recordFilters\)/,
        "main.tsx does not restore the record filters when the user goes Back"
    );
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
