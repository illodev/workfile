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
    dateBoundary,
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
    amendRelease,
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
    acceptanceSummary,
    parseAcceptance,
    resolveActor,
    setCardAcceptance,
    ValidationError,
    wholeNumber
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
        "workfile card list [--json] [--axis context=treasury]   # repeatable, once per axis",
        "workfile card show ID [--json]",
        "workfile card create --title TITLE [--area AREA] [--type TYPE] [--priority PRIORITY]",
        "workfile card create --json-input FILE   # recommended: body, parent, source, tags in one call",
        "workfile card create --title TITLE --axis context=treasury   # repeatable; see `workfile schema`",
        "workfile card patch ID --json-input FILE [--expected-revision REV]",
        "workfile card patch ID --axis context=billing   # repeatable; empty value clears the axis",
        "workfile card claim ID [--scope PATH,PATH] [--actor ACTOR] [--force --reason TEXT]",
        "workfile card release ID [--actor ACTOR] [--status next]",
        "workfile card transition ID STATUS [--actor ACTOR]",
        "workfile card archive ID",
        "workfile card reopen ID [--status backlog] [--actor ACTOR]",
        "workfile card reap [--dry-run] [--older-than HOURS] [--json]",
        "workfile card note ID --text TEXT [--section NAME] [--actor ACTOR]",
        "workfile card ac ID [--check N] [--uncheck N]   # repeatable; no flags lists them",
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
        "workfile changelog release VERSION --amend [--title TITLE] [--date YYYY-MM-DD]   # newest release only",
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
        "workfile agents context --card T-0001 [--limit 20]",
        "workfile agents whoami [--json]"
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

/**
 * Spellings that reach the same command.
 *
 * The dispatcher accepts each of these as `command === "doc" || command ===
 * "docs"`, and every guard in this file has to agree with it or the alias
 * stops being an alias. `serve` did not: `workfile serve --help` printed the
 * whole banner instead of `ui`'s usage, and `workfile serve --nonsense`
 * started the server having discarded the flag, because a word with no entry
 * in the tables below is a word nothing checks.
 */
const USAGE_ALIASES: Record<string, string> = {
    docs: "doc",
    history: "changelog",
    serve: "ui"
};

/**
 * What a bare command word runs, for the words that run something.
 *
 * `workfile mcp` serves, `workfile migrate` imports `.planning`, `workfile
 * claude` reports the surface. Every other branching word requires a
 * subcommand. Naming both cases is what lets one guard answer for all of them:
 * a word absent from here is missing its subcommand, and a word present is
 * checked as though the caller had spelled it out.
 */
const DEFAULT_SUBCOMMAND: Record<string, string> = {
    claude: "check",
    migrate: "apply",
    mcp: "serve"
};

/**
 * Flags every command accepts.
 *
 * Deliberately short. A flag that lives here is accepted by all 46 subcommands,
 * so anything only some of them read belongs in the table below instead —
 * `--folder` was global and ignored by `doctor`, `--json-input` was global and
 * ignored by `next`, and both exited 0.
 *
 * `--dry-run` stays global because it has its own guard: `assertDryRunSupported`
 * refuses it where it is not implemented, and names the preview command instead.
 */
const GLOBAL_FLAGS = [
    "--root",
    "--json",
    "--dry-run",
    "--allow-new",
    "--verbose",
    "--help",
    "-h"
];

/**
 * Flags each SUBCOMMAND accepts, on top of the global ones.
 *
 * Keyed per `"word subcommand"`, not per word. It used to be per word, so
 * `COMMAND_FLAGS.card` was a 35-flag union shared across fourteen subcommands
 * and every one of them accepted every other one's flags — and then ignored
 * them. Measured before the change, all exiting 0: `card patch ID --json-input
 * p.json --title "..."` silently discarded the title, `card show ID --status
 * doing` ignored the filter, `doctor --folder xyz` and `next --json-input
 * p.json` were read by nobody. The docs asserted the opposite the whole time.
 *
 * Silent flag-dropping is the worst failure shape for an agent: it cannot
 * notice that its instruction evaporated, and the exit code says it worked.
 *
 * Generated once from what each branch actually reads, and pinned by a test in
 * both directions — nothing listed here that the subcommand does not read, and
 * nothing read that is not listed.
 */
const COMMAND_FLAGS: Record<string, string[]> = {
    "agents check": [
        "--targets"
    ],
    "agents context": [
        "--card",
        "--limit"
    ],
    "agents status": [
        "--targets"
    ],
    "agents sync": [
        "--force",
        "--targets"
    ],
    "agents whoami": [],
    "card ac": [
        "--check",
        "--expected-revision",
        "--uncheck"
    ],
    "card archive": [
        "--expected-revision"
    ],
    "card claim": [
        "--actor",
        "--expected-revision",
        "--force",
        "--reason",
        "--scope"
    ],
    "card create": [
        "--area",
        "--axis",
        "--body",
        "--depends",
        "--due",
        "--effort",
        "--json-input",
        "--milestone",
        "--origin",
        "--parent",
        "--priority",
        "--related",
        "--scope",
        "--source",
        "--start",
        "--status",
        "--tags",
        "--title",
        "--type"
    ],
    "card list": [
        "--area",
        "--axis",
        "--claimed-by",
        "--fields",
        "--limit",
        "--offset",
        "--parent",
        "--priority",
        "--status",
        "--tag",
        "--type",
        "--unclaimed",
        "--updated-since",
        "--with-body"
    ],
    "card note": [
        "--actor",
        "--expected-revision",
        "--section",
        "--text"
    ],
    "card patch": [
        "--actor",
        "--axis",
        "--expected-revision",
        "--force",
        "--json-input"
    ],
    "card reap": [
        "--older-than"
    ],
    "card release": [
        "--actor",
        "--expected-revision",
        "--force",
        "--status"
    ],
    "card renumber": [
        "--actor",
        "--duplicates",
        "--to"
    ],
    "card reopen": [
        "--actor",
        "--expected-revision",
        "--status"
    ],
    "card show": [],
    "card transition": [
        "--actor",
        "--expected-revision",
        "--force",
        "--scope"
    ],
    "card write": [
        "--body-file",
        "--expected-revision"
    ],
    "changelog add": [
        "--area",
        "--body",
        "--cards",
        "--decisions",
        "--issues",
        "--json-input",
        "--related",
        "--tags",
        "--title",
        "--type",
        "--visibility"
    ],
    "changelog create": [
        "--area",
        "--body",
        "--cards",
        "--decisions",
        "--issues",
        "--json-input",
        "--related",
        "--tags",
        "--title",
        "--type",
        "--visibility"
    ],
    "changelog list": [
        "--unreleased",
        "--visibility"
    ],
    "changelog patch": [
        "--expected-revision",
        "--json-input"
    ],
    "changelog preview": [
        "--fragments",
        "--visibility"
    ],
    "changelog release": [
        "--amend",
        "--body",
        "--commit",
        "--date",
        "--expected-revision",
        "--fragments",
        "--json-input",
        "--tags",
        "--title"
    ],
    "changelog render": [
        "--visibility",
        "--write"
    ],
    "changelog show": [],
    "changelog verify": [],
    "ci check": [
        "--targets"
    ],
    "ci status": [
        "--targets"
    ],
    "ci sync": [
        "--force",
        "--targets"
    ],
    "claude check": [],
    "claude install": [
        "--force"
    ],
    "claude sync": [
        "--force"
    ],
    "doc create": [
        "--body",
        "--folder",
        "--json-input",
        "--kind",
        "--owners",
        "--related",
        "--scope",
        "--status",
        "--tags",
        "--title"
    ],
    "doc list": [
        "--limit",
        "--managed",
        "--query"
    ],
    "doc move": [
        "--expected-revision",
        "--folder"
    ],
    "doc patch": [
        "--expected-revision",
        "--json-input"
    ],
    "doc show": [],
    "doctor": [
        "--rebuild-cache",
        "--fix",
        "--actor",
        "--severity",
        "--max-issues",
        "--new",
        "--accept-baseline"
    ],
    "init": [
        "--agents",
        "--areas",
        "--ci",
        "--docs",
        "--force",
        "--language",
        "--name",
        "--no-scripts",
        "--yes"
    ],
    "mcp config": [
        "--read-only"
    ],
    "mcp inspect": [
        "--read-only"
    ],
    "mcp serve": [
        "--read-only"
    ],
    "mcp stdio": [
        "--read-only"
    ],
    "memory add": [
        "--actions",
        "--body",
        "--category",
        "--confidence",
        "--deciders",
        "--expires",
        "--json-input",
        "--occurrences",
        "--related",
        "--resolved-at",
        "--review-after",
        "--scope",
        "--severity",
        "--started-at",
        "--status",
        "--supersedes",
        "--tags",
        "--title"
    ],
    "memory create": [
        "--actions",
        "--body",
        "--category",
        "--confidence",
        "--deciders",
        "--expires",
        "--json-input",
        "--occurrences",
        "--related",
        "--resolved-at",
        "--review-after",
        "--scope",
        "--severity",
        "--started-at",
        "--status",
        "--supersedes",
        "--tags",
        "--title"
    ],
    "memory graduate": [
        "--expected-revision",
        "--to"
    ],
    "memory list": [
        "--collection",
        "--limit",
        "--query",
        "--status"
    ],
    "memory patch": [
        "--expected-revision",
        "--json-input"
    ],
    "memory show": [],
    "memory supersede": [
        "--by",
        "--expected-revision"
    ],
    "memory verify": [],
    "migrate apply": [
        "--force",
        "--mode",
        "--source"
    ],
    "migrate plan": [
        "--mode",
        "--source"
    ],
    "migrate schema": [],
    "next": [
        "--actor",
        "--area",
        "--limit"
    ],
    "schema": [],
    "search": [
        "--kind",
        "--limit",
        "--mode",
        "--query"
    ],
    "ui": [
        "--host",
        "--port"
    ],
    "upgrade": [],
    "version": []
};

/**
 * Refuses flags the command does not know, instead of ignoring them.
 *
 * Values are skipped by position, so `--title --json` is read as a title of
 * "--json" exactly the way `option()` reads it — this validates the shape the
 * parser actually sees, not an idealized one.
 */
/**
 * Subcommands that actually implement `--dry-run`.
 *
 * The flag is global, so it parsed everywhere and the subcommands that never
 * read it went ahead and did the thing. `changelog release 0.7.0 --dry-run`
 * printed what looked like a preview and had already moved 73 fragments out of
 * `unreleased/`.
 *
 * Keyed per subcommand, like the flag table, and for the same reason: keyed per
 * word it refused `card reap --dry-run`, which reads the flag and honours it.
 */
const DRY_RUN_COMMANDS = new Set([
    "init",
    "upgrade",
    "card reap",
    "agents sync",
    "ci sync",
    "claude install",
    "claude sync",
    "migrate schema",
    "migrate apply"
]);

const DRY_RUN_ALTERNATIVE = {
    changelog: "`workfile changelog preview`",
    card: "`workfile card show`",
    doc: "`workfile doc list`",
    memory: "`workfile memory list`"
};

function assertDryRunSupported(command, action) {
    const word = USAGE_ALIASES[command] || command;
    if (!has("--dry-run")) return;
    // Through `commandKey`, so the bare form is measured as what it runs.
    // `workfile migrate --dry-run` was refused as unimplemented while
    // `workfile migrate apply --dry-run` previewed — the one invocation where
    // the refusal cost the caller the preview they asked for.
    if (DRY_RUN_COMMANDS.has(word) || DRY_RUN_COMMANDS.has(commandKey(command, action))) {
        return;
    }
    const alternative = DRY_RUN_ALTERNATIVE[word];
    throw new ValidationError(
        "CLI_FLAG_UNSUPPORTED",
        `\`${INVOKED_AS} ${word}${action ? ` ${action}` : ""}\` does not implement ` +
            "--dry-run, and would have made the change anyway." +
            (alternative ? ` Use ${alternative} to look first.` : "")
    );
}

/** Booleans. Everything else consumes the token after it. */
const BOOLEAN_FLAGS = new Set([
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
    "--amend",
    "--rebuild-cache",
    "--duplicates",
    "--allow-new",
    "--verbose",
    "--no-scripts"
]);

/**
 * Flags a caller may repeat, because something reads every occurrence.
 *
 * `option()` returns the first match and drops the rest. For anything not
 * listed here that is a silently discarded instruction, so it is refused.
 */
const REPEATABLE_FLAGS = new Set(["--check", "--uncheck", "--axis"]);

/**
 * Refuses flags the subcommand does not know, instead of ignoring them.
 *
 * Values are skipped by position, so `--title --json` is read as a title of
 * "--json" exactly the way `option()` reads it — this validates the shape the
 * parser actually sees, not an idealized one. A boolean left off
 * `BOOLEAN_FLAGS` silently swallows the flag after it, which is how
 * `doctor --fix --bogus` used to pass while `doctor --bogus` failed.
 */
/**
 * The table key for an invocation, with aliases and the bare form resolved.
 *
 * `workfile mcp --read-only` and `workfile mcp serve --read-only` are the same
 * command and have to be checked as one. They were not: the key for the bare
 * form was `mcp`, nothing is stored under that name, and every guard keyed on
 * it returned without doing anything. That is how `workfile mcp --nonsense`
 * served, `workfile migrate --nonsense` ran the import against `.planning` and
 * `workfile claude --force` exited 0 having dropped the flag — while the same
 * commands spelled out were refused correctly.
 *
 * An unrecognised subcommand still falls back to the bare word, and
 * `assertKnownSubcommand` reports it before anything reads this.
 */
function commandKey(command, action) {
    const word = USAGE_ALIASES[command] || command;
    if (action) {
        return `${word} ${action}` in COMMAND_FLAGS ? `${word} ${action}` : word;
    }
    const fallback = DEFAULT_SUBCOMMAND[word];
    return fallback ? `${word} ${fallback}` : word;
}

/**
 * A branching word must name one of its subcommands.
 *
 * `card` and `doc` used to demand an ID first — `workfile doc index` answered
 * `doc index requires an ID`, sending a reader to find an identifier for a
 * subcommand that does not exist, which is how `docs index` survived in the
 * spec long enough to need a test to find it. Bare, the same guard printed the
 * literal `card undefined requires an ID`.
 *
 * The list of subcommands comes from `COMMAND_FLAGS` rather than a second
 * enumeration, so a command added to the dispatcher and forgotten here is not
 * a possible state. Each handler keeps its own closing throw: that one catches
 * a key listed in the table with no branch behind it, which this cannot see.
 */
function assertKnownSubcommand(command, action) {
    const word = USAGE_ALIASES[command] || command;
    const subcommands = Object.keys(COMMAND_FLAGS)
        .filter((key) => key.startsWith(`${word} `))
        .map((key) => key.slice(word.length + 1));
    // A leaf command; the position holds its argument, not a subcommand.
    if (!subcommands.length) return;
    if (action) {
        if (subcommands.includes(action)) return;
        throw new ValidationError(
            "CLI_COMMAND_UNKNOWN",
            `Unknown ${word} command: ${action}. ` +
                `Available: ${subcommands.join(", ")}.`
        );
    }
    if (DEFAULT_SUBCOMMAND[word]) return;
    throw new ValidationError(
        "CLI_COMMAND_REQUIRED",
        `\`${INVOKED_AS} ${word}\` needs a subcommand: ${subcommands.join(", ")}. ` +
            `Run \`${INVOKED_AS} ${word} --help\`.`
    );
}

function assertKnownFlags(command, action) {
    const word = USAGE_ALIASES[command] || command;
    const key = commandKey(command, action);
    if (!COMMAND_FLAGS[key]) return;
    const known = new Set([...GLOBAL_FLAGS, ...COMMAND_FLAGS[key]]);
    const seen = new Set();
    const argv = process.argv.slice(3);
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("-") || token === "-") continue;
        const name = token.includes("=") ? token.split("=")[0] : token;
        if (!known.has(name)) {
            const elsewhere = Object.keys(COMMAND_FLAGS).filter(
                (candidate) =>
                    candidate !== key &&
                    candidate.startsWith(`${word} `) &&
                    COMMAND_FLAGS[candidate].includes(name)
            );
            throw new ValidationError(
                "CLI_ARGUMENT_UNKNOWN",
                `Unknown option for "${key}": ${name}.` +
                    (elsewhere.length
                        ? ` It belongs to ${elsewhere
                              .map((candidate) => `\`${candidate}\``)
                              .join(", ")}.`
                        : "") +
                    ` Run \`${INVOKED_AS} ${word} --help\`.`
            );
        }
        // Repeating a flag nothing reads twice is an instruction that
        // evaporates: `card create --tags a,b --tags c,d` kept `a,b` and exited
        // 0. Refusing is the only way the caller finds out.
        if (seen.has(name) && !REPEATABLE_FLAGS.has(name)) {
            throw new ValidationError(
                "CLI_ARGUMENT_CONFLICT",
                `${name} was given more than once and only the first is read. ` +
                    `Pass it once${
                        BOOLEAN_FLAGS.has(name)
                            ? ""
                            : ", with a comma-separated value if it takes a list"
                    }.`
            );
        }
        seen.add(name);
        if (!BOOLEAN_FLAGS.has(name) && !token.includes("=")) index += 1;
    }
}

// Only what every subcommand really accepts. `--folder`, `--expected-revision`,
// `--force`, `--read-only`, `--yes` and `--json-input` were listed here and
// were global, which is how `doctor --folder xyz` and `next --json-input f.json`
// exited 0 having read neither. They are per-subcommand now and appear in each
// subcommand's own usage line.
const GLOBAL_OPTIONS = `Global options:
  --root PATH              Workspace root
  --json                   Machine-readable output
  --dry-run                Preview filesystem changes, where implemented
  --allow-new              Accept a directory that is not yet a workspace

Options a subcommand does not accept are refused with CLI_ARGUMENT_UNKNOWN, and
an option given twice with CLI_ARGUMENT_CONFLICT, because only the first is
read. Pass a list as one comma-separated value.`;

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
 * A positional argument, or undefined when the position holds a flag.
 *
 * Every dispatcher used to read `process.argv[3]` raw, so `workfile mcp
 * --read-only` treated `--read-only` as the action and died with
 * CLI_COMMAND_UNKNOWN — which is exactly what `workfile mcp config` printed for
 * people to paste into their MCP client. The fix stopped at position 3. Every
 * id, status and version was still read raw, so `workfile card show --json`
 * answered `Card not found: --json` and `workfile card unknown --root .` was
 * reported as an unknown command only because `--root` was standing in for the
 * id it never had.
 */
function positional(index) {
    const value = process.argv[index];
    return value && !value.startsWith("-") ? value : undefined;
}

function subcommand() {
    return positional(3);
}

/**
 * The identifier a subcommand cannot run without.
 *
 * Each handler already refuses a missing id, but only past the branches placed
 * above that guard — and `show` is above it in four of them, so `workfile card
 * show` looked the record `undefined` up and reported it as not found. A
 * caller who forgot the argument was told the argument does not exist.
 */
function requireId(word, action, id) {
    if (id) return id;
    throw new ValidationError(
        "CLI_ARGUMENT_REQUIRED",
        `${word} ${action} requires an ID`
    );
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
    // The same flag as the write path, read as a list: `--axis context=a,b`
    // matches either, and a second `--axis` for another name ANDs with it —
    // which is how every other filter here already combines.
    const axes: Array<[string, string[]]> = Object.entries(
        axisOptions("--axis") || {}
    ).map(([name, value]) => [name, value.split(",").map((item) => item.trim())]);
    const types = listOption("--type");
    const priorities = listOption("--priority");
    const tags = listOption("--tag");
    const parent = option("--parent");
    const claimedBy = option("--claimed-by");
    const unclaimed = has("--unclaimed");
    const updatedSince = dateOption("--updated-since");

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
        for (const [name, values] of axes) {
            if (!values.includes(card[name])) return false;
        }
        return true;
    });
}

function paginate(records) {
    const offset = numberOption("--offset") ?? 0;
    const limit = numberOption("--limit") ?? records.length;
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

/**
 * Every occurrence of a flag, comma-lists included.
 *
 * `option` returns the first match and silently drops the rest, which is fine
 * for a value that can only be given once and wrong for an instruction that can
 * repeat. An agent that writes `--check 1 --check 3` and has the second one
 * quietly ignored cannot tell that it happened.
 */
function repeatedNumbers(name) {
    const values: number[] = [];
    for (let index = 0; index < process.argv.length; index += 1) {
        if (process.argv[index] !== name) continue;
        for (const part of String(process.argv[index + 1] || "").split(",")) {
            const value = Number(part.trim());
            if (!Number.isInteger(value) || value < 1) {
                throw new ValidationError(
                    "CLI_ARGUMENT_INVALID",
                    `${name} takes 1-based criterion numbers; got "${part.trim()}".`
                );
            }
            values.push(value);
        }
    }
    return values;
}

/**
 * `--axis name=value`, repeated once per axis.
 *
 * A flag per axis is not available: `COMMAND_FLAGS` is the static table the
 * unknown-flag guard reads, and axes are declared per project. So the axis name
 * travels in the value, and the workspace — not this table — decides whether it
 * is one the project declares.
 *
 * `--axis context=` with nothing after the `=` clears the axis, the way an
 * empty value clears any card field. That is why the split is on the first `=`
 * and an empty right-hand side is kept rather than rejected.
 */
function axisOptions(flag) {
    const axes: Record<string, string> = {};
    for (let index = 0; index < process.argv.length; index += 1) {
        if (process.argv[index] !== flag) continue;
        const raw = String(process.argv[index + 1] ?? "");
        const at = raw.indexOf("=");
        const name = (at === -1 ? raw : raw.slice(0, at)).trim();
        if (at === -1 || !name) {
            throw new ValidationError(
                "CLI_ARGUMENT_INVALID",
                `${flag} takes name=value; got "${raw}".`
            );
        }
        // Repeating one axis is the same evaporating instruction the
        // duplicate-flag guard refuses everywhere else: `--axis context=a
        // --axis context=b` would keep only one, and the caller cannot tell
        // which. The flag repeats across axes, not within one.
        if (name in axes) {
            throw new ValidationError(
                "CLI_ARGUMENT_CONFLICT",
                `${flag} ${name} was given more than once. ` +
                    "Repeat it once per axis, with a comma-separated value where a list is meant."
            );
        }
        axes[name] = raw.slice(at + 1).trim();
    }
    return Object.keys(axes).length ? axes : undefined;
}

/** A date filter, refused rather than silently matching nothing. */
function dateOption(name) {
    return dateBoundary(option(name), { label: name, code: "CLI_OPTION_INVALID" });
}

/** A numeric option, refused rather than silently paging to nothing. */
function numberOption(name, bounds: any = {}) {
    return wholeNumber(option(name), {
        label: name,
        code: "CLI_OPTION_INVALID",
        ...bounds
    });
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
 *
 * The resolution itself lives in `core/actor.ts` so that the MCP server and the
 * Claude hook reach the same string. They did not: this read a variable nothing
 * sets, and the three surfaces disagreed on every invocation.
 */
function defaultActor() {
    return resolveActor().actor;
}

/**
 * A claim taken under a name this session does not answer to.
 *
 * `--actor` outranks every other rung, and that is right: CI claims as a bot,
 * and a person can claim on a colleague's behalf. What it also does is arm two
 * traps at once. The PreToolUse guard compares `claimed_by` against the identity
 * it derives for itself, so an invented string makes it ask about your own claim
 * on every edit — the exact behaviour `core/actor.ts` was written to end, and
 * "how a guard rail teaches people to turn it off". And `card release` then
 * refuses with `CARD_CLAIM_OWNER_MISMATCH` until you reproduce the string,
 * which locks you out of your own card.
 *
 * Both were reachable straight from the generated protocol, which taught
 * `--actor ACTOR` and `--actor session-id` in four places. Those are gone, but
 * every repository that already ran `agents sync` still has the old text in its
 * `AGENTS.md`, so the warning is the part that reaches them.
 */
function warnActorMismatch(claimed) {
    const resolved = resolveActor().actor;
    if (!resolved || !claimed || claimed === resolved) return;
    console.error(
        `Warning: claimed as "${claimed}", but this session is "${resolved}". ` +
            `The edit guard will ask about this claim, and releasing it needs ` +
            `--actor "${claimed}". Run \`${INVOKED_AS} agents whoami\` to see ` +
            `which identity is yours.`
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
    const id = positional(4);
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
        requireId("card", action, id);
        const { cards } = await loadCards(workspace);
        const card = cards.find((candidate) => candidate.id === id);
        if (!card) throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
        // Derived, not stored: the body is the record. Attached here rather
        // than in the normalizer because `card list` would then pay to parse
        // every body to answer a question nobody asked of a listing.
        const acceptance = parseAcceptance(card.body);
        return print(
            acceptance.present ? { ...card, acceptance } : card
        );
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
            .filter(({ claim }) => {
                const olderThan = numberOption("--older-than");
                if (olderThan === undefined) return true;
                return (claim.ageHours ?? 0) >= olderThan;
            });
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
                : {}),
            ...(listOption("--origin")
                ? { origin: listOption("--origin") }
                : {}),
            ...(axisOptions("--axis") ? { axes: axisOptions("--axis") } : {})
        };
        const result = await createCard(workspace, input);
        return print(has("--json") ? result.card : `${result.id} ${result.file}`);
    }
    // `card renumber --duplicates` is a sweep and names no record. It reached
    // here only because the id position was read raw and `--duplicates` is a
    // truthy string — the accident this guard was written to depend on without
    // anyone saying so.
    const sweeping = action === "renumber" && has("--duplicates");
    if (!id && !sweeping) {
        throw new ValidationError(
            "CLI_ARGUMENT_REQUIRED",
            `card ${action} requires an ID`
        );
    }
    if (action === "ac") {
        const check = repeatedNumbers("--check");
        const uncheck = repeatedNumbers("--uncheck");
        if (!check.length && !uncheck.length) {
            const { cards } = await loadCards(workspace);
            const card = cards.find((candidate) => candidate.id === id);
            if (!card) {
                throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
            }
            const reading = parseAcceptance(card.body);
            if (has("--json")) return print(reading);
            if (!reading.present) {
                return console.log(`${id} declares no acceptance criteria`);
            }
            console.log(`${id} — ${acceptanceSummary(reading)} met`);
            for (const item of reading.items) {
                console.log(`  ${item.checked ? "x" : " "} #${item.index} ${item.text}`);
            }
            return;
        }
        const result = await setCardAcceptance(workspace, id, {
            check,
            uncheck,
            expectedRevision: option("--expected-revision") || undefined
        });
        if (has("--json")) return print(result);
        console.log(`${id} — ${acceptanceSummary(result.acceptance)} met`);
        for (const item of result.changed) {
            console.log(`  ${item.checked ? "checked" : "unchecked"} #${item.index} ${item.text}`);
        }
        return;
    }
    if (action === "note") {
        const result = await appendCardNote(workspace, id, {
            text: option("--text"),
            section: option("--section") || "Notes",
            actor: option("--actor") || defaultActor(),
            expectedRevision: option("--expected-revision") || undefined
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
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.card : `${id} body written`);
    }
    if (action === "patch") {
        const axes = axisOptions("--axis");
        const changes = {
            ...((await jsonInput()) || {}),
            ...(axes ? { axes } : {})
        };
        if (!Object.keys(changes).length) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "card patch requires --json-input FILE or --axis name=value"
            );
        }
        const result = await patchCard(workspace, id, changes, {
            expectedRevision: option("--expected-revision") || undefined,
            actor: option("--actor") || defaultActor(),
            force: has("--force")
        });
        return print(has("--json") ? result.card : `${id} updated`);
    }
    if (action === "claim") {
        warnActorMismatch(option("--actor"));
        const result = await claimCard(workspace, id, {
            actor: option("--actor") || defaultActor(),
            scope: listOption("--scope"),
            force: has("--force"),
            reason: option("--reason"),
            expectedRevision: option("--expected-revision") || undefined
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
            actor: option("--actor") || defaultActor(),
            status: option("--status"),
            force: has("--force"),
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.card : `${id} released to ${result.card.status}`);
    }
    if (action === "transition") {
        const status = positional(5);
        if (!status) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "card transition requires a status"
            );
        }
        const result = await transitionCard(workspace, id, status, {
            actor: option("--actor") || defaultActor(),
            scope: listOption("--scope"),
            // Wired together with the actor default on purpose. The default
            // alone turns what was a silent bypass into an unescapable wall for
            // anyone whose claim is held under a different name — including the
            // plugin's own `/done`, which transitions without an actor.
            force: has("--force"),
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.card : `${id} → ${result.card.status}`);
    }
    if (action === "archive") {
        const result = await archiveCard(workspace, id, { expectedRevision: option("--expected-revision") || undefined });
        return print(has("--json") ? result.card : `${id} archived`);
    }
    if (action === "reopen") {
        const result = await reopenCard(workspace, id, {
            status: option("--status") || "backlog",
            // Reopening into `doing` takes a claim, and a claim takes an
            // actor. Resolved rather than demanded: a hand-typed one is what
            // T-0099 removed from the protocol.
            actor: option("--actor") || defaultActor(),
            expectedRevision: option("--expected-revision") || undefined
        });
        return print(has("--json") ? result.card : `${id} reopened`);
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown card command: ${action}`
    );
}

async function documentCommand(workspace, action) {
    const id = positional(4);
    const index = await buildProjectIndex(workspace);
    if (action === "list") {
        const result = searchProjectRecords(
            index.records,
            option("--query") || "",
            { kinds: ["doc"], limit: numberOption("--limit", { min: 1 }) ?? 500 }
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
        requireId("doc", action, id);
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
    const id = positional(4);
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
        requireId("changelog", action, id);
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
        const version = positional(4);
        if (!version) {
            throw new ValidationError(
                "CLI_ARGUMENT_REQUIRED",
                "changelog release requires a version"
            );
        }
        if (has("--amend")) {
            const amended = await amendRelease(
                workspace,
                version,
                {
                    // Conditional, not `key: option(...)`: a flag that was not
                    // given must be absent rather than empty, or amending the
                    // title alone arrives carrying a blank date and is refused
                    // as an invalid one.
                    ...(option("--title") ? { title: option("--title") } : {}),
                    ...(option("--date") ? { date: option("--date") } : {}),
                    ...(option("--commit") ? { commit: option("--commit") } : {}),
                    ...(option("--body") ? { body: option("--body") } : {}),
                    ...(listOption("--tags") ? { tags: listOption("--tags") } : {}),
                    ...((await jsonInput()) || {})
                },
                { expectedRevision: option("--expected-revision") || undefined }
            );
            return print(
                has("--json")
                    ? amended.release
                    : `${amended.id} amended (${amended.release.version})`
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
    const argument = positional(4);
    if (action === "list") {
        const index = await buildProjectIndex(workspace);
        const query = option("--query") || "";
        let records = searchProjectRecords(index.records, query, {
            kinds: ["memory"],
            limit: numberOption("--limit", { min: 1 }) ?? 1000
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
        requireId("memory", action, argument);
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
                ? { occurrences: numberOption("--occurrences", { min: 0 }) }
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
        requireId("memory", action, argument);
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
    if (action === "sync") {
        const result = await syncAgentInstructions(workspace, {
            targets: listOption("--targets"),
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        for (const file of result.files) console.log(`${file.status}\t${file.path}`);
        return;
    }
    if (action === "check" || action === "status") {
        const result = await checkAgentInstructions(workspace, {
            targets: listOption("--targets")
        });
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
            limit: numberOption("--limit", { min: 1 }) ?? 20
        });
        return print(has("--json") ? result : result.markdown);
    }
    // Identity was wrong for a long time without being visible: three surfaces
    // resolved three different strings and nothing printed any of them, so the
    // first symptom was a guard rail firing on your own claim. This makes the
    // resolution inspectable in one command.
    if (action === "whoami") {
        const resolved = resolveActor();
        if (has("--json")) return print(resolved);
        console.log(`${resolved.actor || "(unresolved)"}\t${resolved.source}`);
        if (resolved.sessionId) console.log(`session\t${resolved.sessionId}`);
        return;
    }
    throw new ValidationError(
        "CLI_COMMAND_UNKNOWN",
        `Unknown agents command: ${action}`
    );
}

async function ciCommand(workspace, action) {
    if (action === "sync") {
        const result = await syncCiTemplates(workspace, {
            targets: listOption("--targets"),
            force: has("--force"),
            dryRun: has("--dry-run")
        });
        if (has("--json")) return print(result);
        for (const file of result.files) console.log(`${file.status}\t${file.path}`);
        return;
    }
    if (action === "check" || action === "status") {
        const result = await checkCiTemplates(workspace, {
            targets: listOption("--targets")
        });
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

/**
 * Where the legacy `.planning` import reads from, and how it moves files.
 *
 * A function rather than a read at the top of the handler: read above the
 * branches, `--source` and `--mode` are accepted by `migrate schema` too, which
 * never looks at them.
 */
function legacyPlan(workspace) {
    return planLegacyMigration(workspace, {
        source: option("--source") || ".planning",
        mode: option("--mode") || "copy"
    });
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

    if (!action || action === "plan") {
        const plan = await legacyPlan(workspace);
        if (has("--json")) return print(plan);
        console.log(`Legacy migration: ${plan.counts.total} files, ${plan.counts.ready} ready, ${plan.counts.conflicts} conflicts`);
        console.log(`Cards: ${plan.counts.cards}; archived: ${plan.counts.archivedCards}; assets: ${plan.counts.assets}; sources: ${plan.counts.sources}`);
        for (const warning of plan.warnings) {
            console.log(`WARNING ${warning.code} ${warning.file}: ${warning.message}`);
        }
        return;
    }
    if (action === "apply") {
        const result = await applyLegacyMigration(workspace, await legacyPlan(workspace), {
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
        limit: numberOption("--limit", { min: 1 }) ?? 100,
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


/** `--read-only` narrows what the server exposes; config can force it. */
function mcpReadOnly(workspace) {
    return has("--read-only") || !workspace.config.mcp.allowMutations;
}

async function mcpCommand(workspace, action) {
    if (!workspace.config.mcp.enabled) {
        throw new ValidationError("MCP_DISABLED", "MCP is disabled in project.config.mjs");
    }
    if (!action || action === "serve" || action === "stdio") {
        const server = startMcpStdioServer(workspace, {
            readOnly: mcpReadOnly(workspace),
            version: PACKAGE_VERSION
        });
        await server.closed;
        return;
    }
    if (action === "inspect") {
        return print(
            inspectMcpServer(workspace, {
                readOnly: mcpReadOnly(workspace),
                version: PACKAGE_VERSION
            })
        );
    }
    if (action === "config") {
        return print(
            mcpClientConfiguration(workspace, { readOnly: mcpReadOnly(workspace) })
        );
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
    // Order matters: a caller who typed a subcommand that does not exist is
    // told that, rather than being told its flags are wrong or its id missing.
    assertKnownSubcommand(command, subcommand());
    assertKnownFlags(command, subcommand());
    assertDryRunSupported(command, subcommand());
    if (command === "init") {
        await initCommand(root);
        return;
    }
    const workspace = await loadWorkspace(
        explicitRoot
            ? { root: explicitRoot }
            : { cwd: root, allowMissing: has("--allow-new") }
    );
    // Resolution walks five steps, and picking the wrong ancestor writes into
    // the wrong repository — which stops being hypothetical the moment someone
    // has two checkouts open. On stderr, so a `--json` consumer is unaffected
    // and the answer still reaches a human watching the run.
    if (has("--verbose")) console.error(`Workspace: ${workspace.root}`);
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
        const cap = numberOption("--max-issues") ?? shown.length;
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
                ? numberOption("--port", { min: 0, max: 65535 })
                : workspace.config.ui.port,
            // A port nobody named may move; a port somebody named may not.
            searchForFreePort: !option("--port")
        });
        console.log(`Workfile → ${server.url}`);
        console.log(`Workspace: ${workspace.root}`);
        if (server.displaced) {
            const holder = server.displaced.holder;
            console.log(
                `Port ${server.displaced.port} is in use` +
                    (holder ? ` by ${holder.name} (${holder.root})` : "") +
                    `, so this board is on ${server.port}. Set ui.port in ` +
                    `project.config.mjs to keep it on a port you can remember.`
            );
        }
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
            limit: Math.min(
                numberOption("--limit", { min: 1 }) ?? NEXT_DEFAULT_LIMIT,
                NEXT_MAXIMUM_LIMIT
            )
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
