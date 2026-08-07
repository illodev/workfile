// A plain object on purpose, not `defineProject(...)`. That call would need
// `import { defineProject } from "@illodev/workfile"` — a bare specifier Node
// resolves from this file, so the config would only load with `node_modules`
// present. Two consumers run without one: a workspace initialized via
// `pnpm dlx` before the package is installed locally, and the generated CI
// job, which runs `npx --yes @illodev/workfile@X doctor` on a clean clone.
// The loader applies `defineProject` to whatever this file exports, so
// wrapping here adds nothing but that boot-time dependency. The JSDoc
// annotation keeps the typing: it is type-only, no runtime import.

/** @type {import("@illodev/workfile").ProjectConfigInput} */
export default {
    schemaVersion: 2,
    name: "Example project",
    language: "es",
    cards: {
        areas: ["api", "web", "infra", "docs"],
        // What a card's `verify[].run` may be. Each entry is an argv prefix,
        // matched element by element against the card's own argument vector,
        // which is spawned without a shell — so `["pnpm", "test"]` permits
        // `pnpm test --filter cards` and permits nothing that starts
        // differently. Empty by default: declare a command before a card can
        // name one.
        //
        // It bounds which command a card may name, not what that command does.
        // `pnpm test` dispatches through `package.json`, which the same pull
        // request can edit, so read this as making a declared command
        // reviewable rather than as a boundary against untrusted code.
        verification: {
            commands: [
                ["pnpm", "test"],
                ["pnpm", "lint"]
            ],
            // How long one of those commands gets before `card verify` stops
            // waiting and reports it as timed out, changing nothing. Ten
            // minutes by default; raise it for a suite that honestly takes
            // longer. There is no way to say "no timeout", because a command
            // that never exits would hold an unattended CI job forever.
            timeoutSeconds: 600,
            // Which verification methods each area accepts at `done`. `*`
            // answers for every area not named, including areas added later —
            // without it, the ninth area somebody declares next month escapes
            // the policy in silence.
            //
            // Omit the whole key and every method is accepted, which is what
            // every project did before this existed. Naming an area here is a
            // decision about that area's work: `api` is code, so a person's
            // word for it is not enough; `docs` is prose, and there is nothing
            // for CI to assert about it. A card closed with no `--method` at
            // all records `local`, so it is judged like any other — declaring
            // `["ci"]` means a bare `card transition ID done` is refused too.
            //
            // `forced` is not declarable. It is what the record says when
            // `--force` walked a gate past something, and the reason is on the
            // card's trail: a forced close is never judged here.
            methods: {
                api: ["ci"],
                infra: ["ci"],
                docs: ["ci", "manual"],
                "*": ["ci", "local"]
            }
        }
    },
    docs: {
        managedPath: ".project/docs",
        sources: [
            "README.md",
            "docs/**/*.md",
            "apps/*/README.md",
            ".project/specs/**/*.md"
        ],
        exclude: [
            "**/node_modules/**",
            "**/vendor/**",
            ".git/**",
            ".project/.cache/**"
        ],
        // Trees whose links are site routes rather than paths on disk. Inside
        // one of these, `[text](guides/invoicing)` is resolved from the root
        // named here — not from the linking file — and onto whatever backs that
        // route: `.md`, `.mdx`, or an `index` of either. Without it every link
        // in a published documentation tree reads as broken.
        //
        // Empty by default, and it only ever widens what resolves: outside
        // these roots a link is a path, which is what a README's links are.
        routeRoots: [],
        kinds: [
            "architecture",
            "product",
            "runbook",
            "guide",
            "reference",
            "research",
            "spec",
            "handoff"
        ],
        statuses: ["draft", "current", "stale", "superseded", "archived"],
        defaultKind: "reference",
        defaultStatus: "draft",
        reviewIntervalDays: 180
    },
    changelog: {
        fragmentsPath: ".project/changelog/unreleased",
        releasesPath: ".project/changelog/releases",
        output: "CHANGELOG.md",
        releaseStrategy: "semver",
        types: [
            "added",
            "changed",
            "fixed",
            "deprecated",
            "removed",
            "security",
            "internal"
        ],
        visibilities: ["public", "internal"],
        defaultType: "changed",
        defaultVisibility: "public"
    },
    memory: {
        path: ".project/memory",
        collections: [
            "learnings",
            "decisions",
            "incidents",
            "conventions",
            "context"
        ]
    },
    agents: {
        canonicalInstructions: ".project/agents/protocol.md",
        workflowsPath: ".project/agents/workflows",
        targets: ["agents-md", "claude", "cursor", "copilot"]
    },
    ci: {
        targets: ["github"],
        nodeVersion: "22"
    },
    mcp: {
        enabled: true,
        transport: "stdio",
        allowMutations: true,
        resourcePageSize: 100
    },
    search: {
        // Preferred integration id for semantic search; null picks the first
        // declared integration that offers one.
        provider: null,
        semanticWeight: 0.35,
        maxProviderRecords: 500
    }
};

// Integrations are declared as a named export because they can carry
// functions, which do not survive the config merge. Each entry is a
// `defineProjectIntegration`-compatible object; a semantic search provider
// makes `workfile search`, the HTTP API, the UI and MCP rank hybrid results.
//
// The first-party provider runs embeddings on-device — repository content
// never leaves the machine. Guard the import for the same reason this file is
// a plain object: the config must load where the package cannot resolve.
//
// export const integrations = await (async () => {
//     try {
//         const { localSearchIntegration } = await import(
//             "@illodev/workfile-search-local"
//         );
//         return [localSearchIntegration()];
//     } catch {
//         return []; // package absent: search stays lexical
//     }
// })();
// // …and set search.provider above to "local-embeddings".
//
// Or bring your own:
//
// import { createSemanticSearchProvider } from "@illodev/workfile";
//
// export const integrations = [
//     {
//         id: "my-embeddings",
//         title: "My embeddings provider",
//         semanticSearchProvider: createSemanticSearchProvider({
//             id: "my-embeddings",
//             async search({ query, records }) {
//                 return records.map(({ id }) => ({ id, score: 0 }));
//             }
//         })
//     }
// ];
