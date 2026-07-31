import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
    createChangeFragment,
    createRelease,
    loadWorkspace
} from "../packages/workfile/dist/src/index.js";

/**
 * The workspace the screenshots are taken of.
 *
 * The bench fixture is deterministic but lifeless: five hundred cards named
 * "Synthetic card N" photograph like a placeholder mock. This corpus is
 * curated instead — it retells Workfile's own development (the 0.1.0 release,
 * the Windows watcher abort, the scalar-scope crash, the roadmap epics), so
 * every frame shows plausible titles, populated columns, scheduled spans,
 * cut releases and typed memory. Dates are relative to the day the pictures
 * are taken, which keeps the timeline centered without freezing a calendar.
 */

const DAY = 86_400_000;

function iso(offsetDays) {
    return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

/**
 * The ledger the Overview reads.
 *
 * Cards used to be written with a one-line body, which was enough for every
 * view that photographs metadata — but the Overview renders the `## Activity`
 * section, so on the old corpus its busiest block came out empty and every
 * open card was labelled "never claimed". The trail below is generated, not
 * transcribed: deterministic from the card index so two runs on two machines
 * produce the same picture, and shaped like real work — a claim precedes the
 * transition it explains, and a `done` card releases its lock afterwards.
 *
 * Cards that never left the backlog get no lines at all. That is the honest
 * state and it is also the interesting one: it is what puts a real "never
 * claimed" marker in frame instead of a synthetic one on every row.
 */
const TRAIL_ACTORS = ["agent:claude", "maria", "agent:codex", "priya"];

/** Statuses that mean nobody has ever picked the card up. */
const UNTOUCHED = ["backlog", "next", "deferred"];

function stamp(dayOffset, hour, minute) {
    return `${iso(dayOffset)} ${String(hour).padStart(2, "0")}:${String(
        minute
    ).padStart(2, "0")}Z`;
}

function activityLines(index, status) {
    if (UNTOUCHED.includes(status)) return [];
    const actor = TRAIL_ACTORS[index % TRAIL_ACTORS.length];
    const closedDay = -(index % 9);
    const openedDay = closedDay - 1 - (index % 3);
    const hour = 9 + (index % 9);
    const minute = (index * 7) % 60;

    // One deliberate burst: three cards closed by the same actor in the same
    // minute, so the Overview's collapse-by-minute is visible in frame rather
    // than merely implemented.
    const burst = index >= 9 && index <= 11;
    const closeAt = burst
        ? stamp(-2, 14, 53)
        : stamp(closedDay, hour, (minute + 26) % 60);
    const claimAt = stamp(openedDay, (hour + 20) % 24, minute);
    const claimActor = burst ? TRAIL_ACTORS[0] : actor;

    const lines = [`- ${claimAt} ${claimActor} · claimed`];
    if (status === "doing") return lines;
    if (status === "discarded") {
        lines.push(`- ${closeAt} ${claimActor} · doing → discarded`);
        lines.push(`- ${closeAt} ${claimActor} · released`);
        return lines;
    }
    lines.push(`- ${closeAt} ${claimActor} · doing → ${status}`);
    if (status === "done") lines.push(`- ${closeAt} ${claimActor} · released`);
    return lines;
}

function slugify(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 50);
}

// [title, status, type, priority, area, extra]
// `parent` and `depends` reference other rows by title; IDs are assigned in
// listed order, so the epics come first and stay T-0001..T-0005.
const CARDS = [
    ["0.1.0 — repository-native Work, Docs, History and Memory", "done", "epic", "critical", "core", { start: -75, due: -12 }],
    ["0.2.0 — search integrations GA", "doing", "epic", "high", "search", { start: -20, due: 45 }],
    ["Agent coordination v2 — presence, leases, handoff", "doing", "epic", "high", "mcp", { start: -10, due: 60 }],
    ["Multi-workspace and monorepo support", "next", "epic", "medium", "infra", { start: 20, due: 90 }],
    ["Keyboard-first navigation", "review", "epic", "medium", "ui", { start: -30, due: 5 }],

    // The 0.1.0 story, as it actually happened.
    ["One non-recursive watch per directory", "done", "task", "high", "core", { parent: 0 }],
    ["The watcher resolves the canonical root before watching", "done", "bug", "high", "core", { parent: 0, tags: ["windows"] }],
    ["Releasing a claim keeps the status the card reached", "done", "bug", "medium", "core", { parent: 0 }],
    ["List-typed card fields accept the scalar clients send", "done", "bug", "high", "core", { parent: 0 }],
    ["Package smoke: install, init, four domains, MCP, UI", "done", "task", "medium", "infra", { parent: 0 }],
    ["Trusted publishing: OIDC release workflow, no stored tokens", "done", "feature", "high", "infra", { parent: 0 }],
    ["CI matrix: three platforms, two node lines", "done", "task", "medium", "infra", { parent: 0 }],
    ["CodeQL pass over the HTTP surface", "done", "audit", "low", "infra", { parent: 0 }],
    ["MCP server: 30 tools over the shared core", "done", "feature", "critical", "mcp", { parent: 0 }],
    ["Read-only MCP mode for untrusted contexts", "done", "feature", "high", "mcp", { parent: 0 }],
    ["Claude Code plugin: commands, skill, claim guard hooks", "done", "feature", "high", "mcp", { parent: 0 }],
    ["Precompiled UI ships inside the package", "done", "task", "high", "ui", { parent: 0 }],
    ["The changelog derives from typed fragments", "done", "feature", "high", "core", { parent: 0 }],
    ["Doctor: configuration-driven diagnosis", "done", "feature", "medium", "core", { parent: 0 }],
    ["One query grammar across every surface", "done", "feature", "high", "search", { parent: 0 }],
    ["Frontmatter codec preserves author style", "done", "feature", "critical", "core", { parent: 0 }],
    ["Revision tokens reject stale writes", "done", "feature", "critical", "core", { parent: 0 }],
    ["Claim and transition are one atomic operation", "done", "feature", "high", "core", { parent: 0 }],
    ["Session heartbeats tell live work from abandoned claims", "done", "feature", "medium", "mcp", { parent: 0 }],
    ["Gantt timeline with dependency arcs", "done", "feature", "medium", "ui", { parent: 0 }],
    ["Health issues navigate to their records", "done", "task", "low", "ui", { parent: 0 }],
    ["The hosted demo replays the real workspace", "done", "task", "medium", "ui", { parent: 0 }],

    // In flight now. The first one carries the staged live claim.
    ["Incremental index: update postings for one changed file", "doing", "feature", "high", "core", { parent: 1, start: -5, due: 9, claim: ["agent:claude", 20, ["src/modules/records"]], tags: ["performance"] }],
    ["Command palette: claim, transition and release actions", "doing", "feature", "medium", "ui", { parent: 4, start: -8, due: 6, claim: ["maria", 130, ["ui/src"]] }],
    ["Semantic provider contract: pluggable embeddings", "doing", "feature", "high", "search", { parent: 1, start: -12, due: 14 }],
    ["Claim leases: doctor names the takeover procedure", "doing", "task", "medium", "mcp", { parent: 2, start: -4, due: 10 }],
    ["Spec v2.1: the MCP integration contract addendum", "doing", "docs", "medium", "docs", { start: -3, due: 12 }],

    ["Query grammar: negated facets (-status:done)", "next", "feature", "medium", "search", { parent: 1, start: 3, due: 18 }],
    ["Hybrid ranking: lexical score blended with the provider", "next", "feature", "high", "search", { parent: 1, start: 6, due: 30, depends: ["Incremental index: update postings for one changed file", "Semantic provider contract: pluggable embeddings"] }],
    ["project_next respects claim leases and WIP limits", "next", "feature", "medium", "mcp", { parent: 2, start: 2, due: 16, depends: ["Claim leases: doctor names the takeover procedure"] }],
    ["Handoff: release with a note the next actor sees", "next", "feature", "medium", "mcp", { parent: 2, start: 8, due: 24 }],
    ["Inspector: inline body editing with conflict retry", "next", "feature", "medium", "ui", { parent: 4, start: 4, due: 20 }],
    ["Getting started: the agent session walkthrough", "next", "docs", "medium", "docs", { start: 1, due: 10, depends: ["Spec v2.1: the MCP integration contract addendum"] }],
    ["Workspace discovery from nested packages", "next", "feature", "high", "infra", { parent: 3, start: 20, due: 40 }],
    ["Per-package area namespaces", "next", "feature", "medium", "infra", { parent: 3, start: 25, due: 50, depends: ["Workspace discovery from nested packages"] }],

    ["Timeline: drag to reschedule start and due", "review", "feature", "medium", "ui", { parent: 4, start: -15, due: -1 }],
    ["Presence: files touched surface in the inspector", "review", "feature", "medium", "mcp", { parent: 2, start: -9, due: 2 }],
    ["Bench: XL corpus numbers in a nightly run", "review", "task", "low", "infra", { start: -6, due: 1 }],
    ["Docs freshness: review intervals per kind", "review", "feature", "medium", "docs", { start: -18, due: -2 }],

    ["Windows: long paths beyond MAX_PATH", "blocked", "bug", "medium", "core", { tags: ["windows"] }],
    ["Provenance for the plugin marketplace artifact", "blocked", "task", "low", "infra", {}],
    ["GitLab CI template parity", "deferred", "task", "low", "infra", {}],
    ["Themeable accent palette", "deferred", "idea", "low", "ui", {}],
    ["SQLite cache for the index", "discarded", "idea", "medium", "core", {}],
    ["A custom query DSL", "discarded", "idea", "low", "search", {}],

    ["Archive sweep: cards done for ninety days", "backlog", "task", "low", "core", {}],
    ["Doctor rule: orphaned attachments", "backlog", "task", "low", "core", {}],
    ["Bulk transition from the explorer selection", "backlog", "feature", "medium", "ui", {}],
    ["Saved views: URL state as named filters", "backlog", "feature", "medium", "ui", { parent: 4 }],
    ["Docs: broken-anchor detection inside headings", "backlog", "task", "medium", "docs", {}],
    ["Conventional-commit importer for History", "backlog", "feature", "low", "core", {}],
    ["Memory: graduation reminders past expiry", "backlog", "task", "medium", "core", {}],
    ["MCP resource templates per collection", "backlog", "task", "low", "mcp", { parent: 2 }],
    ["Fuzzy ID matching in the palette", "backlog", "task", "low", "search", {}],
    ["Init: detect Bun workspaces", "backlog", "task", "low", "infra", { parent: 3 }],
    ["HTTP API: cursor pagination for large listings", "backlog", "feature", "medium", "core", {}],
    ["Print stylesheet for board reviews", "backlog", "idea", "low", "ui", {}],
    ["Presence: idle timeout configuration", "backlog", "task", "low", "mcp", { parent: 2 }],
    ["Spanish translation of the Spec", "backlog", "idea", "low", "docs", {}],
    ["Draft release notes as a social post", "backlog", "idea", "low", "docs", {}],
    ["GitHub Issues one-way import", "backlog", "idea", "medium", "core", {}],
    ["VS Code activity bar view", "backlog", "idea", "medium", "ui", {}],
    ["Public read-only board hosting", "backlog", "idea", "low", "infra", {}]
];

const DOCS = [
    ["Spec — Repository Workfile", "reference", "The canonical data model: four domains, one frontmatter codec, stable IDs and revision tokens. Everything the CLI, UI, HTTP API and MCP server agree on lives here."],
    ["Getting started", "guide", "From `npx @illodev/workfile init` to the first claimed card. Covers the scaffold, the local board and what an agent session reads before it touches anything."],
    ["MCP integration contract", "reference", "The 30 tools, four resources and three prompts, with read-only, destructive and idempotency annotations. Tracked under T-0003."],
    ["HTTP API", "reference", "The v2 surface: runtime schema, conflict-aware mutations, SSE invalidations. The legacy task API delegates to the same services."],
    ["Security model", "architecture", "Unauthenticated local reads and writes are a feature with a boundary: entry guards refuse cross-origin writes, uploads never execute in the API origin."],
    ["The claims design", "architecture", "Claims live in card frontmatter, heartbeats live in the cache, and the two together tell live work from an abandoned flag. Guard rails ask — they never deny."],
    ["Watcher design notes", "architecture", "One non-recursive watch per directory instead of a recursive one: the recursive call blocks the event loop for most of a second on a large corpus."],
    ["CLI reference", "reference", "Every subcommand with its stable error codes and exit statuses. Flags the CLI reads are flags the CLI accepts — a test enforces it."],
    ["Release runbook", "runbook", "Tag, verify, publish with provenance via OIDC. The tarball smoke installs the package in a clean consumer before anything reaches the registry."],
    ["Search integrations", "guide", "The lexical index is always there; a semantic provider is a plug, not a dependency. Part of T-0002."],
    ["The frontmatter codec", "architecture", "Flow lists, block sequences and block scalars round-trip byte-identically. A patch re-emits the key the way the author wrote it."],
    ["Demo pipeline", "runbook", "The hosted demo replays this repository's own workspace: build-demo-data captures the API surface, and mutations stay per browser session."],
    ["UI guide", "guide", "Explorer, Triage, Flow, Epics, Timeline, Docs, Memory, History and Health — nine views over one store, loaded on demand."],
    ["Roadmap", "product", "0.2.0 concentrates on search (T-0002); agent coordination v2 follows (T-0003). Multi-workspace support is scoped but not committed (T-0004)."]
];

const MEMORY = [
    ["decisions", "Markdown is canonical; there is no database", "accepted", "Every record is a reviewable file. Indexes are caches, never sources of truth — a corrupted cache costs latency, not data."],
    ["decisions", "Claims ask, never deny", "accepted", "A guard rail that blocks too much gets switched off, and then it protects nothing. Editing another actor's scope prompts a question instead of an error."],
    ["decisions", "Releasing a claim keeps the card's status", "accepted", "The natural order of finishing — transition to done, then let go — must not demote the card it just closed. Only `doing` cannot survive a release."],
    ["decisions", "One stylesheet, one pill", "accepted", "The audit found eight independent implementations of the same element. Each pattern is declared exactly once; no view carries a stylesheet of its own."],
    ["learnings", "Windows short paths abort libuv watchers", "active", "A watched root reached through an 8.3 name (RUNNER~1) kills the process when an event arrives. Resolve the canonical root before placing watches."],
    ["learnings", "A .length guard admits strings", "active", "A non-empty string passes `value?.length` and dies on `.join`. List-typed fields are normalized at every mutation boundary now."],
    ["learnings", "npx inside the package's own repo resolves locally", "active", "`npx @illodev/workfile` in this checkout matches the local package.json and runs the unbuilt tree. The protocol workflow builds from source instead."],
    ["incidents", "Demo board crash on a scalar scope", "resolved", "A task reached the client with `scope` as a string and the Flow board unmounted. Fixed by normalizing list keys and hardening the three renders that iterate scope."],
    ["incidents", "Shared checkout: in-flight work swept into a push", "resolved", "A broad `git add` carried another actor's half-finished feature onto main. Commits now name explicit paths; claims exist for exactly this."],
    ["conventions", "Protocol records change through the CLI or MCP", "active", "A raw write skips the lock, the revision check and validation, and silently corrupts the record for everyone else."],
    ["conventions", "Protocol records are written in English", "active", "The hosted demo replays this repository's workspace, so record titles are public-facing content."],
    ["context", "0.1.1 pending: unreleased fragments ride the next tag", "active", "Four fixes are sitting in unreleased/. Cut the release when the search work lands or sooner if a consumer hits the scalar-scope crash."]
];

const RELEASED = [
    ["The repository is the database: Work, Docs, History and Memory as Markdown", "added", "core"],
    ["Local UI over the live workspace, precompiled into the package", "added", "ui"],
    ["MCP server with 30 tools, resources and prompts", "added", "mcp"],
    ["Claude Code plugin: commands, skill and claim-aware guard rails", "added", "mcp"],
    ["Unified search with one query grammar across surfaces", "added", "search"],
    ["Claims, session heartbeats and the activity snapshot", "added", "core"],
    ["Trusted publishing: releases carry provenance", "added", "infra"],
    ["Doctor: configuration-driven diagnosis with stable codes", "added", "core"]
];

const UNRELEASED = [
    ["The watcher survives Windows 8.3 short paths and idle processes", "fixed", "core"],
    ["Releasing a claim keeps the card's status; only doing returns to next", "fixed", "core"],
    ["A scalar scope no longer crashes the board", "fixed", "ui"],
    ["The README documents the plugin and the full MCP inventory", "changed", "docs"],
    ["Incremental postings update behind a flag", "added", "core"],
    ["Claim leases appear in doctor output with the takeover procedure", "added", "mcp"],
    ["Query grammar: negated facets in preview", "added", "search"],
    ["The inspector shows files touched by live sessions", "added", "ui"],
    ["Timeline: drag to reschedule (beta)", "added", "ui"],
    ["Getting started rewritten around the agent session", "changed", "docs"],
    ["Demo build halved by capturing the API once", "changed", "infra"],
    ["Bench numbers published from a nightly run", "added", "infra"]
];

export async function buildScreenshotWorkspace(root) {
    await rm(root, { recursive: true, force: true });
    for (const directory of [
        ".project/cards",
        ".project/docs/reference",
        ".project/changelog/unreleased",
        ".project/changelog/releases",
        ".project/memory/learnings",
        ".project/memory/decisions",
        ".project/memory/incidents",
        ".project/memory/conventions",
        ".project/memory/context",
        ".project/agents"
    ]) {
        await mkdir(join(root, directory), { recursive: true });
    }

    await writeFile(
        join(root, "project.config.mjs"),
        `export default {\n    schemaVersion: 2,\n    name: "Workfile",\n    cards: { areas: ["core", "ui", "docs", "infra", "mcp", "search"] },\n    docs: { sources: ["docs/**/*.md"] }\n};\n`
    );
    await writeFile(
        join(root, ".project/VERSION"),
        `${JSON.stringify({ schemaVersion: 2, createdWith: "screenshots" }, null, 2)}\n`
    );

    const idByTitle = new Map(
        CARDS.map(([title], index) => [
            title,
            `T-${String(index + 1).padStart(4, "0")}`
        ])
    );
    let signalCardId = "";
    let inspectCardId = "";

    const writes = [];
    CARDS.forEach(([title, status, type, priority, area, extra], index) => {
        const id = `T-${String(index + 1).padStart(4, "0")}`;
        const created = iso(extra.start !== undefined ? Math.min(extra.start, -1) - 4 : -30 - (index % 40));
        const lines = [
            "---",
            `id: ${id}`,
            `title: ${title}`,
            `status: ${status}`,
            `type: ${type}`,
            `priority: ${priority}`,
            `area: ${area}`
        ];
        if (extra.parent !== undefined) {
            lines.push(`parent: ${idByTitle.get(CARDS[extra.parent][0])}`);
        }
        if (extra.depends) {
            lines.push(
                `depends: [${extra.depends.map((dep) => idByTitle.get(dep)).join(", ")}]`
            );
        }
        if (extra.tags) lines.push(`tags: [${extra.tags.join(", ")}]`);
        if (extra.start !== undefined) {
            lines.push(`start: ${iso(extra.start)}`, `due: ${iso(extra.due)}`);
        }
        if (extra.claim) {
            const [actor, minutesAgo, scope] = extra.claim;
            lines.push(
                `claimed_by: ${actor}`,
                `claimed_at: "${new Date(Date.now() - minutesAgo * 60_000).toISOString()}"`,
                `scope: [${scope.join(", ")}]`
            );
            if (actor === "agent:claude") signalCardId = id;
            else inspectCardId = id;
        }
        lines.push(`created: ${created}`, `updated: ${iso(-(index % 9))}`, "---", "");
        const parentRef =
            extra.parent !== undefined
                ? ` Part of ${idByTitle.get(CARDS[extra.parent][0])}.`
                : "";
        const trail = activityLines(index, status);
        const body = trail.length
            ? `${title}.${parentRef}\n\n## Activity\n\n${trail.join("\n")}\n`
            : `${title}.${parentRef}\n`;
        writes.push(
            writeFile(
                join(root, ".project/cards", `${id}-${slugify(title)}.md`),
                `${lines.join("\n")}${body}`
            )
        );
    });

    DOCS.forEach(([title, kind, text], index) => {
        const id = `DOC-${String(index + 1).padStart(4, "0")}`;
        writes.push(
            writeFile(
                join(root, ".project/docs/reference", `${id}-${slugify(title)}.md`),
                [
                    "---",
                    `id: ${id}`,
                    `title: ${title}`,
                    `kind: ${kind}`,
                    "status: current",
                    `created: ${iso(-80 + index * 3)}`,
                    `updated: ${iso(-(index % 21))}`,
                    "---",
                    "",
                    text,
                    ""
                ].join("\n")
            )
        );
    });

    const PREFIX = {
        learnings: "LRN",
        decisions: "ADR",
        incidents: "INC",
        conventions: "CONV",
        context: "CTX"
    };
    const counters = {};
    MEMORY.forEach(([collection, title, status, text]) => {
        counters[collection] = (counters[collection] || 0) + 1;
        const id = `${PREFIX[collection]}-${String(counters[collection]).padStart(4, "0")}`;
        writes.push(
            writeFile(
                join(root, ".project/memory", collection, `${id}-${slugify(title)}.md`),
                [
                    "---",
                    `id: ${id}`,
                    `title: ${title}`,
                    `status: ${status}`,
                    ...(collection === "incidents"
                        ? ["severity: medium", `resolved_at: ${iso(-1)}`]
                        : []),
                    ...(collection === "context" ? [`expires: ${iso(30)}`] : []),
                    `created: ${iso(-40)}`,
                    `updated: ${iso(-2)}`,
                    "---",
                    "",
                    text,
                    ""
                ].join("\n")
            )
        );
    });

    await Promise.all(writes);

    // History goes through the real APIs: the cut-release layout (staged
    // fragment moves, the release record, the rendered groups) is intricate
    // enough that a hand-written copy would drift from the real thing.
    const workspace = await loadWorkspace({ root });
    for (const [title, type, area] of RELEASED) {
        await createChangeFragment(workspace, { title, type, area });
    }
    await createRelease(workspace, {
        version: "0.1.0",
        date: iso(-12),
        title: "Workfile 0.1.0"
    });
    for (const [title, type, area] of UNRELEASED) {
        await createChangeFragment(workspace, { title, type, area });
    }

    return { root, signalCardId, inspectCardId };
}
