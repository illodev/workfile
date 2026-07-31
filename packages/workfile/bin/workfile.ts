#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";

import {
    AGENT_TARGETS,
    CI_TARGETS,
    appendCardNote,
    applyLegacyMigration,
    applySchemaMigration,
    archiveCard,
    buildAgentContext,
    checkAgentInstructions,
    checkCiTemplates,
    checkClaudeSurface,
    claimState,
    clearIndexCache,
    buildProjectIndex,
    claimCard,
    createCard,
    createChangeFragment,
    createIntegrationRegistry,
    createManagedDocument,
    createMemoryRecord,
    createRelease,
    graduateLearning,
    healDuplicateCardIds,
    inspectRepository,
    loadCards,
    readAgentSessions,
    loadChangelog,
    loadMemory,
    loadWorkspace,
    inspectMcpServer,
    mcpClientConfiguration,
    moveManagedDocument,
    normalizeError,
    NotFoundError,
    baselineMissing,
    diffAgainstBaseline,
    readDoctorBaseline,
    writeDoctorBaseline,
    NEXT_DEFAULT_LIMIT,
    NEXT_MAXIMUM_LIMIT,
    rankNextCards,
    patchCard,
    patchCardBody,
    patchChangeFragment,
    patchManagedDocument,
    patchMemoryRecord,
    planInitialization,
    planLegacyMigration,
    planSchemaMigration,
    previewRelease,
    releaseCard,
    renderChangelog,
    renumberCard,
    reslugStaleCardFiles,
    reopenCard,
    runUpgrade,
    runDoctor,
    searchProjectRecords,
    searchProjectRecordsHybrid,
    startProjectServer,
    startMcpStdioServer,
    syncAgentInstructions,
    syncCiTemplates,
    syncClaudeSurface,
    supersedeMemoryRecord,
    transitionCard,
    writeRenderedChangelog,
    applyInitialization,
    ValidationError
} from "../src/index.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8")
).version;

/**
 * The name this process was actually invoked under.
 *
 * `workfile` and `wf` are two bins pointing at this one file, so the usage
 * block cannot be written in a single vocabulary: answering `wf card --help`
 * with a page of `workfile …` teaches a name the caller did not type. Node
 * leaves `process.argv[1]` as the path that was executed rather than resolving
 * it, so a POSIX install reads back `node_modules/.bin/wf` and the invoked name
 * is simply its basename.
 *
 * Anything unrecognised falls back to `workfile`, which covers Windows — npm
 * writes a `.cmd` shim there that passes this file's real path, so the
 * basename is `workfile.js`. Falling back is not merely safe: `workfile` is the
 * canonical bin and always resolves, while `wf` is the alias that might not.
 */
const INVOKED_AS = (() => {
    const executed = (process.argv[1] || "").split(/[\\/]/).pop() || "";
    const name = executed.replace(/\.(?:js|cjs|mjs|ts|cmd|ps1|exe)$/, "");
    return name === "wf" ? "wf" : "workfile";
})();

/** A usage or hint line, spoken in the name the caller used. */
function spoken(line: string): string {
    return INVOKED_AS === "workfile"
        ? line
        : line.replace(/(^|`)workfile\b/g, `$1${INVOKED_AS}`);
}

// Usage lines grouped by their command word, so `workfile card --help` can show
// the card section instead of the whole manual — and so a new subcommand is
// documented in exactly one place.
const USAGE: Record<string, string[]> = {
    init: [
        "workfile init [--root PATH] [--yes] [--dry-run] [--name NAME] [--language LANG]"
    ],
    schema: ["workfile schema [--root PATH] [--json]"],
    doctor: [
        "workfile doctor [--json] [--severity error|warning] [--max-issues N] [--rebuild-cache] [--fix]",
        "workfile doctor --new   # only what appeared since the baseline; exits 1 on anything new",
        "workfile doctor --accept-baseline   # record the current state as known"
    ],
    upgrade: [
        "workfile upgrade [--dry-run] [--json]   # resync every owned surface after a version bump"
    ],
    version: ["workfile version"],
    ui: ["workfile ui [--host HOST] [--port PORT] [--verbose]"],
    card: [
        "workfile card list [--json]",
        "workfile card show ID [--json]",
        "workfile card create --title TITLE [--area AREA] [--type TYPE] [--priority PRIORITY]",
        "workfile card create --json-input FILE   # recommended: body, parent, source, tags in one call",
        "workfile card patch ID --json-input FILE [--expected-revision REV]",
        "workfile card claim ID --actor ACTOR [--scope PATH,PATH] [--force --reason TEXT]",
        "workfile card release ID [--actor ACTOR] [--status next]",
        "workfile card transition ID STATUS [--actor ACTOR]",
        "workfile card archive ID",
        "workfile card reopen ID [--status backlog]",
        "workfile card reap [--dry-run] [--older-than HOURS] [--json]",
        "workfile card note ID --text TEXT [--section NAME] [--actor ACTOR]",
        "workfile card write ID [--body-file FILE]   # or pipe the body on stdin",
        "workfile card renumber ID|FILE [--to T-0123] [--actor ACTOR]",
        "workfile card renumber --duplicates [--actor ACTOR]   # heal after a merge"
    ],
    doc: [
        "workfile doc list [--query TEXT] [--managed] [--json]",
        "workfile doc show ID [--json]",
        "workfile doc create --title TITLE [--kind KIND] [--status STATUS] [--folder PATH]",
        "workfile doc move ID --folder PATH [--expected-revision REV]",
        "workfile doc patch ID --json-input FILE [--expected-revision REV]"
    ],
    changelog: [
        "workfile changelog list [--unreleased] [--visibility public|internal] [--json]",
        "workfile changelog show ID [--json]",
        "workfile changelog add --title TITLE [--type fixed] [--area AREA]",
        "workfile changelog patch ID --json-input FILE [--expected-revision REV]",
        "workfile changelog preview [--fragments CHG-0001,CHG-0002]",
        "workfile changelog release VERSION [--title TITLE] [--date YYYY-MM-DD] [--fragments CHG-0001,CHG-0002]",
        "workfile changelog render [--visibility public|internal] [--write]",
        "workfile changelog verify [--json]"
    ],
    memory: [
        "workfile memory list [--collection learnings] [--status active] [--json]",
        "workfile memory show ID [--json]",
        "workfile memory add COLLECTION --title TITLE [--status STATUS]",
        "workfile memory patch ID --json-input FILE [--expected-revision REV]",
        "workfile memory graduate ID --to CONV-0001,DOC-0001",
        "workfile memory supersede ID --by ID",
        "workfile memory verify [--json]"
    ],
    agents: [
        "workfile agents sync [--targets agents-md,claude,cursor,copilot]",
        "workfile agents check [--targets ...]",
        "workfile agents context --card T-0001 [--limit 20]"
    ],
    ci: [
        "workfile ci sync [--targets github,gitlab,generic]",
        "workfile ci check [--targets ...]"
    ],
    claude: [
        "workfile claude install [--dry-run] [--force]",
        "workfile claude check [--json]"
    ],
    migrate: [
        "workfile migrate plan [--source .planning] [--mode copy|move]",
        "workfile migrate apply [--source .planning] [--mode copy|move] [--force]",
        "workfile migrate schema [--dry-run] [--json]"
    ],
    mcp: [
        "workfile mcp [serve] [--read-only]",
        "workfile mcp inspect [--json]",
        "workfile mcp config [--read-only] [--json]"
    ],
    search: [
        "workfile search QUERY [--kind card,doc,change,release,memory] [--limit N] [--mode auto|lexical|hybrid] [--json]"
    ],
    next: [
        "workfile next [--actor ACTOR] [--area AREA,AREA] [--limit N] [--json]   # what to pick up now, and why"
    ]
};

const USAGE_ALIASES: Record<string, string> = {
    docs: "doc",
    history: "changelog"
};

const GLOBAL_FLAGS = [
    "--root",
    "--json",
    "--folder",
    "--expected-revision",
    "--json-input",
    "--dry-run",
    "--force",
    "--read-only",
    "--yes",
    "--allow-new",
    "--help",
    "-h"
];

// Flags each command word accepts, on top of the global ones. Unknown flags are
// refused rather than ignored: `card list --status doing` used to silently
// return the whole backlog, which is worse than failing because the caller
// believes the filter was applied.
const COMMAND_FLAGS: Record<string, string[]> = {
    // Kept in step with `askInitOptions`, which reads every one of these. The
    // list started as the subset named in `USAGE` and left `--areas`, `--docs`
    // and `--no-scripts` unlisted though the code read them, so the initializer
    // rejected its own documented flags — caught by the package smoke test
    // rather than by anything in the unit suite.
    init: [
        "--name",
        "--language",
        "--areas",
        "--docs",
        "--agents",
        "--ci",
        "--package-manager",
        "--no-scripts"
    ],
    schema: [],
    doctor: [
        "--rebuild-cache",
        "--severity",
        "--max-issues",
        "--fix",
        "--actor",
        "--new",
        "--accept-baseline"
    ],
    upgrade: [],
    version: [],
    ui: ["--host", "--port", "--verbose"],
    card: [
        "--title",
        "--area",
        "--type",
        "--priority",
        "--status",
        "--body",
        "--scope",
        "--tags",
        "--tag",
        "--parent",
        "--source",
        "--depends",
        "--milestone",
        "--effort",
        "--related",
        "--start",
        "--due",
        "--claimed-by",
        "--unclaimed",
        "--updated-since",
        "--limit",
        "--offset",
        "--fields",
        "--with-body",
        "--actor",
        "--reason",
        "--older-than",
        "--text",
        "--section",
        "--body-file",
        "--to",
        "--duplicates"
    ],
    doc: [
        "--query",
        "--managed",
        "--title",
        "--kind",
        "--status",
        "--body",
        "--owners",
        "--related",
        "--scope",
        "--tags",
        "--limit"
    ],
    changelog: [
        "--title",
        "--type",
        "--area",
        "--body",
        "--visibility",
        "--cards",
        "--issues",
        "--decisions",
        "--date",
        "--commit",
        "--tags",
        "--unreleased",
        "--state",
        "--fragments",
        "--write",
        "--limit",
        "--query"
    ],
    memory: [
        "--collection",
        "--title",
        "--status",
        "--body",
        "--category",
        "--confidence",
        "--occurrences",
        "--severity",
        "--started-at",
        "--resolved-at",
        "--expires",
        "--review-after",
        "--related",
        "--supersedes",
        "--deciders",
        "--scope",
        "--actions",
        "--tags",
        "--to",
        "--by",
        "--limit",
        "--query"
    ],
    agents: ["--targets", "--card", "--limit"],
    ci: ["--targets"],
    claude: [],
    migrate: ["--source", "--mode"],
    mcp: [],
    search: ["--kind", "--limit", "--query", "--mode"],
    next: ["--actor", "--area", "--limit"]
};

/**
 * Refuses flags the command does not know, instead of ignoring them.
 *
 * Values are skipped by position, so `--title --json` is read as a title of
 * "--json" exactly the way `option()` reads it — this validates the shape the
 * parser actually sees, not an idealized one.
 */
/**
 * Commands that actually implement `--dry-run`.
 *
 * The flag is global, so `assertKnownFlags` accepted it everywhere and the
 * commands that never read it simply went ahead and did the thing. Running
 * `changelog release 0.7.0 --dry-run` printed what looked like a preview and
 * had already moved 73 fragments out of `unreleased/`. A preview flag that
 * silently performs the action is worse than no flag at all, so anywhere it is
 * not implemented it is now an error that names the real preview command.
 */
const DRY_RUN_COMMANDS = new Set([
    "init",
    "agents",
    "ci",
    "claude",
    "migrate",
    "upgrade"
]);

const DRY_RUN_ALTERNATIVE = {
    changelog: "`workfile changelog preview`",
    card: "`workfile card show`",
    doc: "`workfile doc list`",
    memory: "`workfile memory list`"
};

function assertDryRunSupported(command) {
    const key = USAGE_ALIASES[command] || command;
    if (!has("--dry-run") || DRY_RUN_COMMANDS.has(key)) return;
    const alternative = DRY_RUN_ALTERNATIVE[key];
    throw new ValidationError(
        "CLI_FLAG_UNSUPPORTED",
        `\`project ${key}\` does not implement --dry-run, and would have made the change anyway.` +
            (alternative ? ` Use ${alternative} to look first.` : "")
    );
}

function assertKnownFlags(command) {
    const key = USAGE_ALIASES[command] || command;
    const known = new Set([...GLOBAL_FLAGS, ...(COMMAND_FLAGS[key] || [])]);
    if (!COMMAND_FLAGS[key]) return;
    // Flags that take no value. Anything not listed here is assumed to consume
    // the next token, which is how a boolean left off the list silently swallows
    // the flag after it: `doctor --fix --bogus` accepted `--bogus` and ran the
    // repair, while `doctor --bogus` correctly refused. Every boolean the
    // commands actually read belongs here.
    const valueFlags = new Set(
        [...known].filter(
            (flag) =>
                ![
                    "--json",
                    "--dry-run",
                    "--force",
                    "--read-only",
                    "--yes",
                    "--help",
                    "-h",
                    "--managed",
                    "--unreleased",
                    "--write",
                    "--with-body",
                    "--unclaimed",
                    "--fix",
                    "--new",
                    "--accept-baseline",
                    "--rebuild-cache",
                    "--duplicates",
                    "--allow-new",
                    "--verbose",
                    "--no-scripts"
                ].includes(flag)
        )
    );
    const argv = process.argv.slice(3);
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("-") || token === "-") continue;
        const name = token.includes("=") ? token.split("=")[0] : token;
        if (!known.has(name)) {
            throw new ValidationError(
                "CLI_ARGUMENT_UNKNOWN",
                `Unknown option for "${key}": ${name}. Run \`${INVOKED_AS} ${key} --help\`.`
            );
        }
        if (valueFlags.has(name) && !token.includes("=")) index += 1;
    }
}

const GLOBAL_OPTIONS = `Global options:
  --root PATH              Workspace root
  --json                   Machine-readable output
  --folder PATH            Document folder below docs.managedPath
  --expected-revision REV  Reject writes when the file has changed
  --dry-run                Preview filesystem changes
  --force                  Replace conflicting generated files
  --read-only              Disable MCP mutation tools
  --allow-new              Accept a directory that is not yet a workspace
  --yes                    Accept initializer defaults without prompting`;

const DOCUMENT_FOLDERS = `Document folders:
  Managed documents are read recursively, so folders can be created by hand.
  New documents follow docs.layout ("kind" groups by document kind, "flat"
  writes to the managed root); --folder PATH overrides it and must stay inside
  docs.managedPath. Use --folder "" to write to (or move back to) the root.`;

/** Help for one command word; falls back to the full manual when unknown. */
function printCommandUsage(command) {
    const key = USAGE_ALIASES[command] || command;
    const lines = USAGE[key];
    if (!lines) return printUsage();
    console.log(
        [
            `Workfile — ${key}`,
            "",
            "Usage:",
            ...lines.map((line) => `  ${spoken(line)}`),
            "",
            ...(key === "doc" ? [DOCUMENT_FOLDERS, ""] : []),
            GLOBAL_OPTIONS
        ].join("\n")
    );
}

function printUsage() {
    console.log(`Workfile

Usage:
${Object.values(USAGE)
    .flat()
    .map((line) => `  ${spoken(line)}`)
    .join("\n")}

${DOCUMENT_FOLDERS}

${GLOBAL_OPTIONS}`);
}

function option(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : process.argv[index + 1];
}

function has(name) {
    return process.argv.includes(name);
}

/**
 * The subcommand word, or undefined when the position holds a flag.
 *
 * Every dispatcher used to read `process.argv[3]` raw, so `workfile mcp
 * --read-only` treated `--read-only` as the action and died with
 * CLI_COMMAND_UNKNOWN — which is exactly what `workfile mcp config` printed for
 * people to paste into their MCP client.
 */
function subcommand() {
    const value = process.argv[3];
    return value && !value.startsWith("-") ? value : undefined;
}

function wantsHelp() {
    return has("--help") || has("-h");
}

/**
 * Filters applied before serialization.
 *
 * `card list` used to ignore every flag it was given — `--status doing`
 * returned the backlog — and then serialized the full body of every card. On a
 * real backlog that is megabytes of JSON, which is the opposite of what a
 * protocol built to save an agent's context should hand it.
 */
function filterCards(cards) {
    const statuses = listOption("--status");
    const areas = listOption("--area");
    const types = listOption("--type");
    const priorities = listOption("--priority");
    const tags = listOption("--tag");
    const parent = option("--parent");
    const claimedBy = option("--claimed-by");
    const unclaimed = has("--unclaimed");
    const updatedSince = option("--updated-since");

    return cards.filter((card) => {
        if (statuses && !statuses.includes(card.status)) return false;
        if (areas && !areas.includes(card.area)) return false;
        if (types && !types.includes(card.type)) return false;
        if (priorities && !priorities.includes(card.priority)) return false;
        if (parent && card.parent !== parent) return false;
        if (claimedBy && card.claimed_by !== claimedBy) return false;
        if (unclaimed && card.claimed_by) return false;
        if (updatedSince && String(card.updated || "") < updatedSince) {
            return false;
        }
        if (tags && !tags.some((tag) => (card.tags || []).includes(tag))) {
            return false;
        }
        return true;
    });
}

function paginate(records) {
    const offset = Math.max(0, Number(option("--offset") || 0));
    const limitValue = option("--limit");
    const limit = limitValue ? Math.max(0, Number(limitValue)) : records.length;
    return {
        page: records.slice(offset, offset + limit),
        total: records.length,
        offset
    };
}

/**
 * The card as serialized by `--json`.
 *
 * The Markdown body is omitted unless asked for: a list is a list, and reading
 * one card's prose is what `card show` is for.
 */
function projectCard(card) {
    const fields = listOption("--fields");
    if (fields) {
        return Object.fromEntries(
            fields.filter((key) => key in card).map((key) => [key, card[key]])
        );
    }
    if (has("--with-body")) return card;
    const { body, ...rest } = card;
    return { ...rest, bodyBytes: Buffer.byteLength(body || "", "utf8") };
}

function listOption(name) {
    const value = option(name);
    return value
        ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
        : undefined;
}

async function readAllStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}

/**
 * Who to attribute a claim or a note to when nobody says.
 *
 * Claims exist to keep two agents out of the same files and were never used,
 * because every invocation had to invent an identifier by hand — the docs
 * suggested things like `agent-56a30d1b`.
 */
function defaultActor() {
    return (
        process.env.CLAUDE_SESSION_ID ||
        (process.env.USER ? `${process.env.USER}@${process.env.HOSTNAME || "local"}` : undefined)
    );
}

async function jsonInput() {
    const path = option("--json-input");
    if (!path) return null;
    if (path === "-") {
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    return JSON.parse(await readFile(resolve(path), "utf8"));
}

function print(value) {
    if (has("--json")) console.log(JSON.stringify(value, null, 2));
    else if (typeof value === "string") console.log(value);
    else console.log(JSON.stringify(value, null, 2));
}

async function askInitOptions(root) {
    const detected = await inspectRepository(root);
    const defaults = {
        name: option("--name") || detected.name,
        language: option("--language") || "en",
        areas: listOption("--areas") || detected.areas,
        docs: listOption("--docs") || detected.docs,
        agents: listOption("--agents") || detected.agents,
        ci: listOption("--ci") || detected.ci,
        addScripts: !has("--no-scripts")
    };
    if (has("--yes") || !process.stdin.isTTY || !process.stdout.isTTY) {
        return defaults;
    }
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = async (label, value) => {
            const result = await prompt.question(`${label} [${value}]: `);
            return result.trim() || value;
        };
        const list = async (label, values) => {
            const result = await answer(label, values.join(","));
            return result.split(",").map((item) => item.trim()).filter(Boolean);
        };
        const chosen = {
            name: await answer("Project name", defaults.name),
            language: await answer("Content language", defaults.language),
            areas: await list("Card areas", defaults.areas),
            docs: await list("Documentation sources", defaults.docs),
            agents: await list("Agent adapters", defaults.agents),
            ci: await list("CI templates", defaults.ci),
            addScripts: (await answer("Add package scripts (yes/no)", defaults.addScripts ? "yes" : "no")).toLowerCase().startsWith("y")
        };
        const confirmed = (await answer("Apply this initialization (yes/no)", "yes"))
            .toLowerCase()
            .startsWith("y");
        if (!confirmed) {
            throw new ValidationError("INIT_CANCELLED", "Initialization cancelled.");
        }
        return chosen;
    } finally {
        prompt.close();
    }
}

async function initCommand(root) {
    const options = await askInitOptions(root);
    for (const target of options.agents) {
        if (!AGENT_TARGETS[target]) {
            throw new ValidationError("AGENT_TARGET_UNSUPPORTED", `Unsupported agent target: ${target}`);
        }
    }
    for (const target of options.ci) {
        if (!CI_TARGETS[target]) {
            throw new ValidationError("CI_TARGET_UNSUPPORTED", `Unsupported CI target: ${target}`);
        }
    }
    const plan = await planInitialization(root, options);
    if (has("--dry-run")) {
        return print({
            root: plan.root,
            detected: plan.detected,
            summary: plan.summary,
            conflicts: plan.conflicts,
            actions: plan.actions.map(({ content, ...action }: any) => action)
        });
    }
    const applied = await applyInitialization(plan, { force: has("--force") });
    if (has("--json")) return print({ plan: plan.summary, applied });
    console.log(`Initialized Workfile at ${root}`);
    console.log(`Areas: ${plan.config.cards.areas.join(", ")}`);
    console.log(`Agent adapters: ${plan.config.agents.targets.join(", ") || "none"}`);
    if (plan.config.ci.targets.length) {
        console.log(`CI templates: ${plan.config.ci.targets.join(", ")}`);
    }
}

async function cardCommand(workspace, action) {
    const id = process.argv[4];
    if (action === "list") {
        const { cards } = await loadCards(workspace);
        const filtered = filterCards(cards);
        const { page, total, offset } = paginate(filtered);
        if (has("--json")) {
            return print({
                records: page.map((card) => projectCard(card)),
                total,
                offset,
                truncated: offset + page.length < total
            });
        }
        for (const card of page) {
            console.log(`${card.id}\t${card.status}\t${card.priority}\t${card.title}`);
        }
        if (offset + page.length < total) {
            console.log(
                `… ${total - offset - page.length} more (use --offset ${offset + page.length})`
            );
        }
        return;
    }
    if (action === "show") {
        const { cards } = await loadCards(workspace);
        const card = cards.find((candidate) => candidate.id === id);
        if (!card) throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
        return print(card);
    }
    if (action === "reap") {
        // A claim held past its lease belongs to a process that is almost
        // certainly gone. Releasing it by hand meant knowing it existed, and
        // nothing reported that it did.
        const { cards } = await loadCards(workspace);
        const sessions = await readAgentSessions(workspace);
        const leaseHours = workspace.config.cards.claimLeaseHours;
        const now = new Date();
        const stale = cards
            .map((card) => ({
                card,
                claim: claimState(card, sessions, { leaseHours, now }) as any
            }))
            .filter(({ claim }) =>
                ["stale", "orphaned"].includes(claim.state)
            )
            .filter(({ claim }) =>
                option("--older-than")
                    ? (claim.ageHours ?? 0) >= Number(option("--older-than"))
                    : true
            );
        if (has("--dry-run")) {
            return print(
                has("--json")
                    ? { records: stale.map(({ card, claim }) => ({ id: card.id, claim })) }
                    : stale
                          .map(
                              ({ card, claim }) =>
                                  `${card.id} ${claim.state} ${claim.by} ${claim.ageHours}h`
                          )
                          .join("\n") || "No claims to reap."
            );
        }
        const released = [];
        for (const { card } of stale) {
            await releaseCard(workspace, card.id, { force: true });
            released.push(card.id);
        }
        return print(
            has("--json")
                ? { released, count: released.length }
                : `Released ${released.length} claim(s)${released.length ? `: ${released.join(", ")}` : ""}.`
        );
    }
    if (action === "create") {
        const fileInput = (await jsonInput()) || {};
        // Every field `createCard` reads gets a flag. `--parent` used to sit in
        // COMMAND_FLAGS without being read here, so it passed the unknown-flag
        // guard and was then dropped in silence — the hierarchy came out flat
        // and the command still exited 0. `cardCreateFlagCoverage` in the CLI
        // suite now fails if that gap reopens for any field.
        const input = {
            ...fileInput,
            ...(option("--title") ? { title: option("--title") } : {}),
            ...(option("--area") ? { area: option("--area") } : {}),
            ...(option("--type") ? { type: option("--type") } : {}),
            ...(option("--priority")
                ? { priority: option("--priority") }
                : {}),
            ...(option("--status") ? { status: option("--status") } : {}),
            ...(option("--body") ? { body: option("--body") } : {}),
            ...(option("--parent") ? { parent: option("--parent") } : {}),
            ...(option("--source") ? { source: option("--source") } : {}),
            ...(option("--milestone")
                ? { milestone: option("--milestone") }
                : {}),
            ...(option("--effort") ? { effort: option("--effort") } : {}),
            ...(option("--start") ? { start: option("--start") } : {}),
            ...(option("--due") ? { due: option("--due") } : {}),
            ...(listOption("--scope") ? { scope: listOption("--scope") } : {}),
            ...(listOption("--tags") ? { tags: listOption("--tags") } : {}),
            ...(listOption("--depends")
                ? { depends: listOption("--depends") }
                : {}),
            ...(listOption("--related")
                ? { related: listOption("--related") }
                : {})
        };
        const result = await createCard(workspace, input);
        return print(has("--json") ? result.card : `${result.id} ${result.file}`);
    }
    if (!id) {
        throw new ValidationError(
            "CLI_ARGUMENT_REQUIRED",
            `card ${action} requires an ID`
        );
    }
    const expectedRevision = option("--expected-revision") || undefined;
    if (action === "note") {
        const result = await appendCardNote(workspace, id, {
            text: option("--text"),
            section: option("--section") || "Notes",
            actor: option("--actor") || defaultActor(),
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} noted`);
    }
    if (action === "renumber") {
        const actor = option("--actor") || defaultActor();
        if (has("--duplicates")) {
            const result = await healDuplicateCardIds(workspace, { actor });
            return print(
                has("--json")
                    ? result
                    : result.moves.length
                      ? result.moves
                            .map((move) => `${move.from} → ${move.to} (${move.file})`)
                            .join("\n")
                      : "no duplicate card IDs"
            );
        }
        const result = await renumberCard(workspace, id, {
            to: option("--to"),
            actor
        });
        return print(
            has("--json")
                ? result
                : `${result.from} → ${result.id}${
                      result.rewritten.length
                          ? ` (${result.rewritten.length} references rewritten)`
                          : ""
                  }${
                      result.review.length
                          ? `\nreview references in: ${result.review.join(", ")}`
                          : ""
                  }`
        );
    }
    if (action === "write") {
        // Body from a file or stdin rather than an argument: a Markdown body
        // does not belong on a command line.
        const body = option("--body-file")
            ? await readFile(resolve(option("--body-file")), "utf8")
            : await readAllStdin();
        const result = await patchCardBody(workspace, id, {
            body,
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} body written`);
    }
    if (action === "patch") {
        const changes = await jsonInput();
        if (!changes) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "card patch requires --json-input FILE"
            );
        }
        const result = await patchCard(workspace, id, changes, {
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} updated`);
    }
    if (action === "claim") {
        const result = await claimCard(workspace, id, {
            actor: option("--actor") || defaultActor(),
            scope: listOption("--scope"),
            force: has("--force"),
            reason: option("--reason"),
            expectedRevision
        });
        return print(
            has("--json")
                ? { record: result.card, warnings: result.warnings }
                : `${id} claimed by ${result.card.claimed_by}${
                      result.warnings.length
                          ? ` (${result.warnings.length} scope warnings)`
                          : ""
                  }`
        );
    }
    if (action === "release") {
        const result = await releaseCard(workspace, id, {
            actor: option("--actor"),
            status: option("--status"),
            force: has("--force"),
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} released to ${result.card.status}`);
    }
    if (action === "transition") {
        const status = process.argv[5];
        if (!status) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "card transition requires a status"
            );
        }
        const result = await transitionCard(workspace, id, status, {
            actor: option("--actor"),
            scope: listOption("--scope"),
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} → ${result.card.status}`);
    }
    if (action === "archive") {
        const result = await archiveCard(workspace, id, { expectedRevision });
        return print(has("--json") ? result.card : `${id} archived`);
    }
    if (action === "reopen") {
        const result = await reopenCard(workspace, id, {
            status: option("--status") || "backlog",
            expectedRevision
        });
        return print(has("--json") ? result.card : `${id} reopened`);
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown card command: ${action}`
    );
}

async function documentCommand(workspace, action) {
    const id = process.argv[4];
    const index = await buildProjectIndex(workspace);
    if (action === "list") {
        const result = searchProjectRecords(
            index.records,
            option("--query") || "",
            { kinds: ["doc"], limit: Number(option("--limit") || 500) }
        );
        const records = has("--managed")
            ? result.records.filter((record) => record.managed)
            : result.records;
        if (has("--json")) return print({ records, total: records.length });
        for (const document of records) {
            console.log(
                `${document.id}	${document.managed ? "managed" : "indexed"}	${document.status}	${document.title}	${document.path}`
            );
        }
        return;
    }
    if (action === "show") {
        const document = index.records.find(
            (record) => record.kind === "doc" && record.id === id
        );
        if (!document) {
            throw new NotFoundError("DOC_NOT_FOUND", `Document not found: ${id}`);
        }
        return print(document);
    }
    if (action === "create") {
        const fileInput = (await jsonInput()) || {};
        const input = {
            ...fileInput,
            ...(option("--title") ? { title: option("--title") } : {}),
            ...(option("--kind") ? { kind: option("--kind") } : {}),
            ...(option("--status") ? { status: option("--status") } : {}),
            ...(has("--folder") ? { folder: option("--folder") ?? "" } : {}),
            ...(option("--body") ? { body: option("--body") } : {}),
            ...(listOption("--owners") ? { owners: listOption("--owners") } : {}),
            ...(listOption("--related") ? { related: listOption("--related") } : {}),
            ...(listOption("--scope") ? { scope: listOption("--scope") } : {}),
            ...(listOption("--tags") ? { tags: listOption("--tags") } : {})
        };
        const result = await createManagedDocument(workspace, input);
        return print(
            has("--json")
                ? result.document
                : `${result.id} ${result.file}`
        );
    }
    if (!id) {
        throw new ValidationError(
            "CLI_ARGUMENT_REQUIRED",
            `doc ${action} requires an ID`
        );
    }
    if (action === "move") {
        if (!has("--folder")) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                'doc move requires --folder PATH (use --folder "" for the managed root)'
            );
        }
        const result = await moveManagedDocument(workspace, id, {
            folder: option("--folder") ?? "",
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(
            has("--json")
                ? result.document
                : `${id} moved to ${result.document.path}`
        );
    }
    if (action === "patch") {
        const changes = await jsonInput();
        if (!changes) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "doc patch requires --json-input FILE"
            );
        }
        const result = await patchManagedDocument(workspace, id, changes, {
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.document : `${id} updated`);
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown doc command: ${action}`
    );
}


function memoryCollection(value) {
    const aliases = {
        learning: "learnings",
        decision: "decisions",
        incident: "incidents",
        convention: "conventions",
        context: "context"
    };
    return aliases[value] || value;
}

async function changelogCommand(workspace, action) {
    const id = process.argv[4];
    if (action === "list") {
        const index = await buildProjectIndex(workspace);
        let records = index.records.filter((record) =>
            ["change", "release"].includes(record.kind)
        );
        if (has("--unreleased")) {
            records = records.filter(
                (record) => record.kind === "change" && !record.released
            );
        }
        const visibility = option("--visibility");
        if (visibility) {
            records = records.filter(
                (record) =>
                    record.kind === "release" || record.visibility === visibility
            );
        }
        if (has("--json")) return print({ records, total: records.length });
        for (const record of records) {
            console.log(
                record.kind === "release"
                    ? `${record.id}\trelease\t${record.version}\t${record.date}\t${record.title}`
                    : `${record.id}\t${record.released ? "released" : "unreleased"}\t${record.type}\t${record.visibility}\t${record.title}`
            );
        }
        return;
    }
    if (action === "show") {
        const index = await buildProjectIndex(workspace);
        const record = index.records.find(
            (candidate) =>
                candidate.id === id &&
                ["change", "release"].includes(candidate.kind)
        );
        if (!record) {
            throw new NotFoundError(
                "CHANGELOG_RECORD_NOT_FOUND",
                `Changelog record not found: ${id}`
            );
        }
        return print(record);
    }
    if (action === "add" || action === "create") {
        const fileInput = (await jsonInput()) || {};
        const input = {
            ...fileInput,
            ...(option("--title") ? { title: option("--title") } : {}),
            ...(option("--type") ? { type: option("--type") } : {}),
            ...(option("--area") ? { area: option("--area") } : {}),
            ...(option("--visibility")
                ? { visibility: option("--visibility") }
                : {}),
            ...(option("--body") ? { body: option("--body") } : {}),
            ...(listOption("--cards") ? { cards: listOption("--cards") } : {}),
            ...(listOption("--issues") ? { issues: listOption("--issues") } : {}),
            ...(listOption("--decisions")
                ? { decisions: listOption("--decisions") }
                : {}),
            ...(listOption("--related")
                ? { related: listOption("--related") }
                : {}),
            ...(listOption("--tags") ? { tags: listOption("--tags") } : {})
        };
        const result = await createChangeFragment(workspace, input);
        return print(
            has("--json") ? result.fragment : `${result.id} ${result.file}`
        );
    }
    if (action === "patch") {
        if (!id) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "changelog patch requires an ID"
            );
        }
        const changes = await jsonInput();
        if (!changes) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "changelog patch requires --json-input FILE"
            );
        }
        const result = await patchChangeFragment(workspace, id, changes, {
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.fragment : `${id} updated`);
    }
    if (action === "preview") {
        const result = await previewRelease(workspace, {
            fragmentIds: listOption("--fragments"),
            visibility: option("--visibility") || undefined
        });
        return print(has("--json") ? result : result.markdown || "No changes.");
    }
    if (action === "release") {
        const version = process.argv[4];
        if (!version) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "changelog release requires a version"
            );
        }
        const fileInput = (await jsonInput()) || {};
        const result = await createRelease(workspace, {
            ...fileInput,
            version,
            ...(option("--title") ? { title: option("--title") } : {}),
            ...(option("--date") ? { date: option("--date") } : {}),
            ...(option("--commit") ? { commit: option("--commit") } : {}),
            ...(option("--body") ? { body: option("--body") } : {}),
            ...(listOption("--fragments")
                ? { fragmentIds: listOption("--fragments") }
                : {}),
            ...(listOption("--tags") ? { tags: listOption("--tags") } : {})
        });
        return print(
            has("--json")
                ? result.release
                : `${result.release.id} released ${result.version} (${result.fragments.length} fragments)`
        );
    }
    if (action === "render") {
        const options = {
            visibility: option("--visibility") || "public"
        };
        if (has("--write")) {
            const result = await writeRenderedChangelog(workspace, options);
            return print(
                has("--json")
                    ? { path: result.path, content: result.content }
                    : `Wrote ${result.path}`
            );
        }
        const content = await renderChangelog(workspace, options);
        return print(content);
    }
    if (action === "verify") {
        const index = await buildProjectIndex(workspace);
        const report = index.reports.changelog;
        if (has("--json")) return print(report);
        console.log(
            `Changelog: ${report.counts.error} errors, ${report.counts.warning} warnings`
        );
        for (const issue of report.issues) {
            console.log(
                `${issue.severity.toUpperCase()} ${issue.code} ${issue.id || issue.file || ""}: ${issue.message}`
            );
        }
        process.exitCode = report.ok ? 0 : 1;
        return;
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown changelog command: ${action}`
    );
}

async function memoryCommand(workspace, action) {
    const argument = process.argv[4];
    if (action === "list") {
        const index = await buildProjectIndex(workspace);
        const query = option("--query") || "";
        let records = searchProjectRecords(index.records, query, {
            kinds: ["memory"],
            limit: Number(option("--limit") || 1000)
        }).records;
        const collection = option("--collection");
        const status = option("--status");
        if (collection) {
            records = records.filter(
                (record) => record.collection === memoryCollection(collection)
            );
        }
        if (status) {
            records = records.filter((record) => record.status === status);
        }
        if (has("--json")) return print({ records, total: records.length });
        for (const record of records) {
            console.log(
                `${record.id}\t${record.collection}\t${record.status}\t${record.title}`
            );
        }
        return;
    }
    if (action === "show") {
        const index = await buildProjectIndex(workspace);
        const record = index.records.find(
            (candidate) => candidate.kind === "memory" && candidate.id === argument
        );
        if (!record) {
            throw new NotFoundError(
                "MEMORY_NOT_FOUND",
                `Memory record not found: ${argument}`
            );
        }
        return print(record);
    }
    if (action === "add" || action === "create") {
        const collection = memoryCollection(argument);
        if (!collection) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "memory add requires a collection"
            );
        }
        const fileInput = (await jsonInput()) || {};
        const input = {
            ...fileInput,
            ...(option("--title") ? { title: option("--title") } : {}),
            ...(option("--status") ? { status: option("--status") } : {}),
            ...(option("--body") ? { body: option("--body") } : {}),
            ...(option("--category") ? { category: option("--category") } : {}),
            ...(option("--confidence")
                ? { confidence: option("--confidence") }
                : {}),
            ...(option("--occurrences")
                ? { occurrences: Number(option("--occurrences")) }
                : {}),
            ...(option("--severity") ? { severity: option("--severity") } : {}),
            ...(option("--started-at")
                ? { started_at: option("--started-at") }
                : {}),
            ...(option("--resolved-at")
                ? { resolved_at: option("--resolved-at") }
                : {}),
            ...(option("--expires") ? { expires: option("--expires") } : {}),
            ...(option("--review-after")
                ? { review_after: option("--review-after") }
                : {}),
            ...(listOption("--related")
                ? { related: listOption("--related") }
                : {}),
            ...(listOption("--supersedes")
                ? { supersedes: listOption("--supersedes") }
                : {}),
            ...(listOption("--deciders")
                ? { deciders: listOption("--deciders") }
                : {}),
            ...(listOption("--scope") ? { scope: listOption("--scope") } : {}),
            ...(listOption("--actions")
                ? { corrective_actions: listOption("--actions") }
                : {}),
            ...(listOption("--tags") ? { tags: listOption("--tags") } : {})
        };
        const result = await createMemoryRecord(workspace, collection, input);
        return print(
            has("--json") ? result.record : `${result.id} ${result.file}`
        );
    }
    if (action === "patch") {
        if (!argument) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "memory patch requires an ID"
            );
        }
        const changes = await jsonInput();
        if (!changes) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "memory patch requires --json-input FILE"
            );
        }
        const result = await patchMemoryRecord(workspace, argument, changes, {
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.record : `${argument} updated`);
    }
    if (action === "graduate") {
        const targets = listOption("--to");
        const result = await graduateLearning(workspace, argument, targets, {
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(
            has("--json") ? result.record : `${argument} graduated to ${targets?.join(", ")}`
        );
    }
    if (action === "supersede") {
        const replacementId = option("--by");
        if (!replacementId) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "memory supersede requires --by ID"
            );
        }
        const result = await supersedeMemoryRecord(
            workspace,
            argument,
            replacementId,
            { expectedRevision: option("--expected-revision") || undefined }
        );
        return print(
            has("--json")
                ? result.record
                : `${argument} superseded by ${replacementId}`
        );
    }
    if (action === "verify") {
        const index = await buildProjectIndex(workspace);
        const report = index.reports.memory;
        if (has("--json")) return print(report);
        console.log(
            `Memory: ${report.counts.error} errors, ${report.counts.warning} warnings`
        );
        for (const issue of report.issues) {
            console.log(
                `${issue.severity.toUpperCase()} ${issue.code} ${issue.id || issue.file || ""}: ${issue.message}`
            );
        }
        process.exitCode = report.ok ? 0 : 1;
        return;
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown memory command: ${action}`
    );
}

async function agentsCommand(workspace, action) {
    const targets = listOption("--targets");
    if (action === "sync") {
        const result = await syncAgentInstructions(workspace, {
            targets,
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        for (const file of result.files) console.log(`${file.status}\t${file.path}`);
        return;
    }
    if (action === "check" || action === "status") {
        const result = await checkAgentInstructions(workspace, { targets });
        if (has("--json")) print(result);
        else {
            console.log(`Agent instructions: ${result.counts.current} current, ${result.counts.stale} stale, ${result.counts.missing} missing`);
            for (const issue of result.issues) {
                console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.file}: ${issue.message}`);
            }
        }
        process.exitCode = result.ok ? 0 : 1;
        return;
    }
    if (action === "context") {
        const result = await buildAgentContext(workspace, {
            cardId: option("--card"),
            limit: Number(option("--limit") || 20)
        });
        return print(has("--json") ? result : result.markdown);
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown agents command: ${action}`
    );
}

async function ciCommand(workspace, action) {
    const targets = listOption("--targets");
    if (action === "sync") {
        const result = await syncCiTemplates(workspace, {
            targets,
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        for (const file of result.files) console.log(`${file.status}\t${file.path}`);
        return;
    }
    if (action === "check" || action === "status") {
        const result = await checkCiTemplates(workspace, { targets });
        if (has("--json")) print(result);
        else {
            console.log(`CI templates: ${result.counts.current} current, ${result.counts.stale} stale, ${result.counts.missing} missing`);
            for (const issue of result.issues) {
                console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.file}: ${issue.message}`);
            }
        }
        process.exitCode = result.ok ? 0 : 1;
        return;
    }
    throw new ValidationError("CLI_COMMAND_UNKNOWN", `Unknown ci command: ${action}`);
}

async function claudeCommand(workspace, action) {
    if (!action || action === "check") {
        const report = await checkClaudeSurface(workspace);
        if (has("--json")) return print(report);
        console.log(
            `Claude Code surface: ${report.files.filter((f) => f.status === "current").length} current, ` +
                `${report.files.filter((f) => f.status !== "current").length} to sync`
        );
        for (const file of report.files) {
            console.log(`  ${file.status.padEnd(10)} ${file.path}`);
        }
        process.exitCode = report.ok ? 0 : 1;
        return;
    }
    if (action === "install" || action === "sync") {
        const result = await syncClaudeSurface(workspace, {
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        console.log(
            `${has("--dry-run") ? "Planned" : "Wrote"} the Claude Code surface (v${result.version}):`
        );
        for (const file of result.files) {
            console.log(`  ${String(file.status).padEnd(10)} ${file.path}`);
        }
        return;
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown claude command: ${action}`
    );
}

async function migrationCommand(workspace, action) {
    // Schema migration is a different job from the legacy `.planning` import
    // and must not pay for planning it, so it branches before that runs.
    if (action === "schema") {
        const result = has("--dry-run")
            ? await planSchemaMigration(workspace)
            : await applySchemaMigration(workspace, {
                  packageVersion: PACKAGE_VERSION
              });
        if (has("--json")) return print(result);
        if (result.upToDate) {
            console.log(`Workspace schema is up to date (v${result.target}).`);
            return;
        }
        console.log(
            `Schema migration: v${result.current} → v${result.target} (${result.steps.length} steps)`
        );
        for (const step of result.steps) {
            console.log(`  v${step.to} ${step.title}`);
            for (const change of step.changes) console.log(`    ${change}`);
        }
        if (has("--dry-run")) console.log("Dry run: nothing was written.");
        return;
    }

    const plan = await planLegacyMigration(workspace, {
        source: option("--source") || ".planning",
        mode: option("--mode") || "copy"
    });
    if (!action || action === "plan") {
        if (has("--json")) return print(plan);
        console.log(`Legacy migration: ${plan.counts.total} files, ${plan.counts.ready} ready, ${plan.counts.conflicts} conflicts`);
        console.log(`Cards: ${plan.counts.cards}; archived: ${plan.counts.archivedCards}; assets: ${plan.counts.assets}; sources: ${plan.counts.sources}`);
        for (const warning of plan.warnings) {
            console.log(`WARNING ${warning.code} ${warning.file}: ${warning.message}`);
        }
        return;
    }
    if (action === "apply") {
        const result = await applyLegacyMigration(workspace, plan, {
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        console.log(`${has("--dry-run") ? "Planned" : "Applied"} legacy migration: ${result.files.length} files`);
        console.log(`State: ${result.statePath}`);
        return;
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown migrate command: ${action}`
    );
}

async function searchCommand(workspace) {
    const query = (subcommand() ?? "") || option("--query") || "";
    const mode = option("--mode") || "auto";
    if (!["auto", "lexical", "hybrid"].includes(mode)) {
        throw new ValidationError(
            "CLI_OPTION_INVALID",
            `--mode must be auto, lexical or hybrid; got: ${mode}`
        );
    }
    const provider =
        mode === "lexical"
            ? null
            : createIntegrationRegistry(
                  workspace.integrations || []
              ).semanticSearchProvider(
                  workspace.config.search.provider || undefined
              );
    if (mode === "hybrid" && !provider) {
        throw new ValidationError(
            "SEARCH_PROVIDER_UNAVAILABLE",
            "No integration offers a semantic search provider. Declare one via `export const integrations = [...]` in project.config.mjs."
        );
    }
    const index = await buildProjectIndex(workspace);
    const result = await searchProjectRecordsHybrid(index.records, query, {
        provider,
        kinds: listOption("--kind") || [],
        limit: Number(option("--limit") || 100),
        semanticWeight: workspace.config.search.semanticWeight,
        maxProviderRecords: workspace.config.search.maxProviderRecords
    });
    if (has("--json")) return print(result);
    for (const record of result.records) {
        console.log(
            `${record.id}	${record.kind}	${record.title}	${record.path}`
        );
    }
}


async function mcpCommand(workspace, action) {
    const readOnly = has("--read-only") || !workspace.config.mcp.allowMutations;
    if (!workspace.config.mcp.enabled) {
        throw new ValidationError("MCP_DISABLED", "MCP is disabled in project.config.mjs");
    }
    if (!action || action === "serve" || action === "stdio") {
        const server = startMcpStdioServer(workspace, {
            readOnly,
            version: PACKAGE_VERSION
        });
        await server.closed;
        return;
    }
    if (action === "inspect") {
        return print(
            inspectMcpServer(workspace, {
                readOnly,
                version: PACKAGE_VERSION
            })
        );
    }
    if (action === "config") {
        return print(mcpClientConfiguration(workspace, { readOnly }));
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown mcp command: ${action}`
    );
}

async function main() {
    const command = process.argv[2] || "ui";
    // `--root` names a workspace directly; without it the workspace is
    // discovered upwards from the working directory, and *not* invented there
    // if the search comes up empty.
    const explicitRoot = option("--root") ? resolve(option("--root")) : null;
    const root = explicitRoot || resolve(process.cwd());
    if (command === "version" || command === "--version" || command === "-v") {
        console.log(PACKAGE_VERSION);
        return;
    }
    if (command === "help" || command === "--help" || command === "-h") {
        // `workfile help card` and `workfile card --help` reach the same place.
        const topic = subcommand();
        if (topic) printCommandUsage(topic);
        else printUsage();
        return;
    }
    // Asking for help must never execute the command: `workfile doctor --help`
    // used to run the full doctor, and `workfile card --help` used to fail with
    // CLI_ARGUMENT_REQUIRED.
    if (wantsHelp()) {
        printCommandUsage(command);
        return;
    }
    assertKnownFlags(command);
    assertDryRunSupported(command);
    if (command === "init") {
        await initCommand(root);
        return;
    }
    const workspace = await loadWorkspace(
        explicitRoot
            ? { root: explicitRoot }
            : { cwd: root, allowMissing: has("--allow-new") }
    );
    if (command === "schema") {
        print(workspace.schema);
        return;
    }
    if (command === "doctor") {
        if (has("--rebuild-cache")) {
            await clearIndexCache(workspace);
        }
        let fixed:
            | (Awaited<ReturnType<typeof healDuplicateCardIds>> & {
                  renamed: Awaited<
                      ReturnType<typeof reslugStaleCardFiles>
                  >["moves"];
                  renameSkipped: Awaited<
                      ReturnType<typeof reslugStaleCardFiles>
                  >["skipped"];
              })
            | null = null;
        if (has("--fix")) {
            const actor = option("--actor") || defaultActor();
            const healed = await healDuplicateCardIds(workspace, { actor });
            // Renaming runs after the ID repair: a card that just moved to a
            // fresh ID keeps the old title slug, and this is what brings the
            // whole filename back in step.
            const renamed = await reslugStaleCardFiles(workspace, { actor });
            // Kept as two shapes rather than one merged list: an ID collision
            // skipped for living outside the cards tree and a rename skipped
            // for a name clash are different problems with different repairs.
            fixed = {
                ...healed,
                renamed: renamed.moves,
                renameSkipped: renamed.skipped
            };
            if (!has("--json")) {
                for (const move of healed.moves) {
                    console.log(`fixed: ${move.from} → ${move.to} (${move.file})`);
                }
                for (const move of renamed.moves) {
                    console.log(`renamed: ${move.from} → ${move.to}`);
                }
            }
        }
        const report = await runDoctor(workspace);
        if (has("--accept-baseline")) {
            const accepted = await writeDoctorBaseline(workspace, report.issues);
            return print(
                has("--json")
                    ? { baseline: accepted }
                    : `Baseline accepted: ${accepted.accepted} issues (${accepted.distinct} distinct). \`doctor --new\` now reports only what appears after this.`
            );
        }
        // `--new` answers a different question from plain `doctor`: not "is this
        // repository clean" but "did I make it worse". On a repository carrying
        // hundreds of inherited warnings only the second question can be a gate,
        // which is why the exit code below follows newness here rather than
        // errors. Anything already accepted is somebody's decision to live with
        // it, and plain `doctor` is still where you go to see it.
        let against: ReturnType<typeof diffAgainstBaseline> | null = null;
        let issues = report.issues;
        if (has("--new")) {
            const baseline = await readDoctorBaseline(workspace);
            if (!baseline) throw baselineMissing(workspace);
            against = diffAgainstBaseline(report.issues, baseline);
            issues = against.new;
        }
        // A report that runs to hundreds of lines gets skimmed and then
        // ignored, which costs the warnings that were worth reading.
        const floor = option("--severity");
        const rank = { error: 0, warning: 1, info: 2 };
        const shown = floor
            ? issues.filter((issue) => rank[issue.severity] <= (rank[floor] ?? 2))
            : issues;
        const cap = option("--max-issues")
            ? Math.max(0, Number(option("--max-issues")))
            : shown.length;
        // `--severity` used to filter the issue list and nothing else: the
        // headline still read off `report.counts` and the rule grouping still
        // walked `report.issues`, so asking for errors on a repository with
        // hundreds of inherited warnings returned the one line you wanted
        // wrapped in everything you had just excluded. The filter now applies to
        // the whole report, and the excluded total stays on one line so it is
        // suppressed rather than hidden.
        const counts =
            floor || against
                ? shown.reduce(
                      (totals, issue) => {
                          totals[issue.severity] += 1;
                          return totals;
                      },
                      { error: 0, warning: 0, info: 0 }
                  )
                : report.counts;
        const suppressed = issues.length - shown.length;
        if (has("--json")) {
            print({
                ...report,
                counts,
                ...(floor ? { suppressed } : {}),
                ...(against
                    ? { baseline: { known: against.known, resolved: against.resolved } }
                    : {}),
                ...(fixed ? { fixed } : {}),
                issues: shown.slice(0, cap)
            });
        } else {
            console.log(
                `Workfile doctor${against ? " (new since baseline)" : ""}: ${counts.error} errors, ${counts.warning} warnings`
            );
            for (const issue of shown.slice(0, cap)) {
                console.log(
                    `${issue.severity.toUpperCase()} ${issue.code} ${issue.id || issue.file || ""}: ${issue.message}`
                );
            }
            if (shown.length > cap) {
                console.log(`… ${shown.length - cap} more`);
            }
            if (suppressed > 0) {
                console.log(`… ${suppressed} below --severity ${floor} suppressed`);
            }
            // Grouped counts, so a wall of one repeated rule reads as one
            // problem rather than as hundreds.
            const byCode = new Map();
            for (const issue of shown) {
                byCode.set(issue.code, (byCode.get(issue.code) || 0) + 1);
            }
            if (byCode.size) {
                console.log("\nBy rule:");
                for (const [code, count] of [...byCode].sort(
                    (left, right) => right[1] - left[1]
                )) {
                    console.log(`  ${String(count).padStart(5)}  ${code}`);
                }
            }
            if (against) {
                console.log(
                    `\n${against.known} known, ${against.resolved} resolved since the baseline.` +
                        (against.resolved
                            ? " Re-accept it with `doctor --accept-baseline`."
                            : "")
                );
            }
        }
        process.exitCode = against ? (against.new.length ? 1 : 0) : report.ok ? 0 : 1;
        return;
    }
    if (command === "ui" || command === "serve") {
        const server = await startProjectServer(workspace, {
            verbose: has("--verbose"),
            host: option("--host") || workspace.config.ui.host,
            port: option("--port")
                ? Number(option("--port"))
                : workspace.config.ui.port
        });
        console.log(`Workfile → ${server.url}`);
        console.log(`Workspace: ${workspace.root}`);
        console.log("The v2 API is active. The packaged UI is served when dist/ui is present.");
        return;
    }
    if (command === "card") {
        await cardCommand(workspace, subcommand());
        return;
    }
    if (command === "doc" || command === "docs") {
        await documentCommand(workspace, subcommand());
        return;
    }
    if (command === "changelog" || command === "history") {
        await changelogCommand(workspace, subcommand());
        return;
    }
    if (command === "memory") {
        await memoryCommand(workspace, subcommand());
        return;
    }
    if (command === "agents") {
        await agentsCommand(workspace, subcommand());
        return;
    }
    if (command === "ci") {
        await ciCommand(workspace, subcommand());
        return;
    }
    if (command === "claude") {
        await claudeCommand(workspace, subcommand());
        return;
    }
    if (command === "migrate") {
        await migrationCommand(workspace, subcommand());
        return;
    }
    if (command === "mcp") {
        await mcpCommand(workspace, subcommand());
        return;
    }
    if (command === "search") {
        await searchCommand(workspace);
        return;
    }
    if (command === "next") {
        // The ranking shipped inside the MCP tool module and nowhere else, so a
        // session driving the CLI never met it and rebuilt the sweep by hand out
        // of `search`. Same service, second surface.
        const index = await buildProjectIndex(workspace);
        const { candidates, total } = rankNextCards(index.records, {
            actor: option("--actor") || defaultActor(),
            areas: listOption("--area"),
            limit: option("--limit")
                ? Math.min(
                      Math.max(1, Number(option("--limit"))),
                      NEXT_MAXIMUM_LIMIT
                  )
                : NEXT_DEFAULT_LIMIT
        });
        if (has("--json")) {
            return print({
                records: candidates.map(({ record, reason }) => ({
                    ...record,
                    reason
                })),
                total,
                truncated: candidates.length < total
            });
        }
        if (!candidates.length) {
            console.log("Nothing is ready to start.");
            return;
        }
        for (const { record, reason } of candidates) {
            console.log(
                `${record.id}\t${record.status}\t${record.priority}\t${record.title}\t(${reason})`
            );
        }
        if (candidates.length < total) {
            console.log(`… ${total - candidates.length} more ready`);
        }
        return;
    }
    if (command === "upgrade") {
        const result = await runUpgrade(workspace, {
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        console.log(
            `Workfile upgrade → v${result.version}${result.dryRun ? " (dry run)" : ""}`
        );
        for (const surface of result.surfaces) {
            const suffix =
                surface.status === "synced"
                    ? ` (${surface.changed} files changed)`
                    : "";
            console.log(`  ${surface.status.padEnd(13)} ${surface.id}${suffix}`);
        }
        for (const orphan of result.orphans) {
            console.log(
                `  ORPHAN        ${orphan.file}: block ${orphan.kind} (v${orphan.version || "?"}) has no owning target — add "${orphan.target}" to the config or remove the block`
            );
        }
        return;
    }
    printUsage();
    process.exitCode = 2;
}

main().catch((error) => {
    const normalized = normalizeError(error);
    if (has("--json")) {
        console.error(
            JSON.stringify(
                {
                    error: {
                        code: normalized.code,
                        message: normalized.message,
                        ...(normalized.details
                            ? { details: normalized.details }
                            : {})
                    }
                },
                null,
                2
            )
        );
    } else {
        console.error(`${normalized.code}: ${normalized.message}`);
        // The validators already compute the accepted values and attach them to
        // the error; only `--json` was printing them. A text caller got
        // "Invalid area: treasury" and had to go read project.config.mjs to find
        // out what would have worked, which made failing the way you learn what
        // the tool accepts.
        const allowed = (normalized.details as { allowed?: unknown })?.allowed;
        if (Array.isArray(allowed) && allowed.length) {
            console.error(`  valid values: ${allowed.join(", ")}`);
        }
    }
    process.exitCode = normalized.exitCode;
});
