import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";
import { ensureWritable } from "../../core/guards.js";
import {
    DEFAULT_PACKAGE_MANAGER,
    cliInvocation
} from "../../core/package-manager.js";
import {
    inspectManagedFile,
    type ManagedFileReport,
    renderManagedBlock,
    stripManagedMarkers,
    syncManagedFile
} from "../generated/managed-files.js";

/**
 * What the public helpers assume when no workspace is available to detect
 * from: `npx` is the form every manager understands.
 */
const DEFAULT_CLI = cliInvocation(DEFAULT_PACKAGE_MANAGER);

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;

/**
 * Slash commands.
 *
 * Each is a thin wrapper over one CLI call, with `allowed-tools` naming the
 * exact subcommand rather than `Bash(project *)`: a generated file that lands
 * in someone else's repository grants permissions, and the grant should be no
 * wider than the command needs.
 */
function commandDefinitions(cli) {
    return [
    {
        name: "next",
        frontmatter: {
            description: "Show the cards that can be started right now",
            "allowed-tools": `Bash(${cli} card list *)`
        },
        body: [
            "Run `" + cli + " card list --unclaimed --status next,backlog --limit 10 --json`",
            "and show the candidates with their priority and area.",
            "",
            "Do not start work without claiming: `/claim <id>`."
        ]
    },
    {
        name: "claim",
        frontmatter: {
            description: "Claim a card before working on it",
            "argument-hint": "[T-0042] [scope,paths]",
            "allowed-tools": `Bash(${cli} card claim *)`
        },
        body: [
            "Claim `$1` with `" + cli + " card claim $1 --scope $2`.",
            "",
            "The scope is the set of paths you intend to modify. It is what stops",
            "two agents from editing the same files, so name it honestly — too",
            "wide blocks other work, too narrow defeats the point.",
            "",
            "If the card is already claimed by someone else, stop and report it",
            "rather than forcing: the other claim may be a live session."
        ]
    },
    {
        name: "done",
        frontmatter: {
            description: "Finish a card: verify, record, release",
            "argument-hint": "[T-0042]",
            "allowed-tools":
                `Bash(${cli} card transition *), Bash(${cli} changelog add *), Bash(${cli} doctor *)`
        },
        body: [
            "Close out `$1`:",
            "",
            "1. `" + cli + " doctor --severity error` must be clean.",
            "2. Add a changelog fragment if the change is user-visible.",
            "3. `" + cli + " card transition $1 review` — `review` means verification",
            "   is pending. Only move to `done` with runtime evidence: a passing",
            "   test, a command whose output you have seen, a screenshot.",
            "",
            "Record anything durable you learned with `" + cli + " memory add`."
        ]
    },
    {
        name: "context",
        frontmatter: {
            description: "Load the protocol context for a card",
            "argument-hint": "[T-0042]",
            "allowed-tools": `Bash(${cli} agents context *)`
        },
        body: [
            "!`" + cli + " agents context --card $1 --limit 20`",
            "",
            "The bundle above is the relevant slice of the workspace: the card,",
            "its direct relations, active conventions, open incidents and",
            "unexpired context. Read it before touching anything."
        ]
    }
    ];
}

/**
 * Frontmatter, with every value quoted.
 *
 * Interpolating the value raw put YAML syntax into YAML: `argument-hint:
 * [T-0042] [scope,paths]` is a flow sequence followed by an unexpected token,
 * and `description: Finish a card: verify, record, release` ends its scalar at
 * the second colon. Both files then load with no metadata at all — including
 * `allowed-tools`, which is the one the definitions above deliberately keep
 * narrow.
 *
 * YAML 1.2 is a superset of JSON, so a JSON string literal is a valid
 * double-quoted scalar and `JSON.stringify` already escapes what needs it.
 * Quoting unconditionally also keeps the type honest: `[T-0042]` alone parses
 * without complaint, as a one-element array where a string was meant.
 */
function frontmatterBlock(entries) {
    return [
        "---",
        ...Object.entries(entries).map(
            ([key, value]) => `${key}: ${JSON.stringify(String(value))}`
        ),
        "---"
    ].join("\n");
}

function commandFile(command) {
    return `${frontmatterBlock(command.frontmatter)}\n\n${command.body.join("\n")}\n`;
}

/**
 * The skill Claude loads when it touches the workspace.
 *
 * `.project/agents/protocol.md` is the canonical text; this projects it rather
 * than restating it, so the two cannot drift into disagreeing.
 */
function skillBody(protocolText, cli) {
    return [
        "This repository uses Workfile: Work, Docs, History and Memory",
        "live as Markdown under `.project/`, and the CLI and MCP server are the",
        "only supported way to change them.",
        "",
        "Read before writing:",
        "",
        "- `" + cli + " card list --status doing` — what is already in flight.",
        "- `" + cli + " agents context --card <id>` — the relevant slice, bounded.",
        "",
        "Never edit a file under `.project/` directly. The protocol takes a lock,",
        "checks a revision and validates the result; a raw write skips all three",
        "and silently corrupts the record for everyone else.",
        "",
        "---",
        "",
        protocolText.trim()
    ].join("\n");
}

/** The plugin is launched from wherever the host is, so it names the root. */
export const PLUGIN_PROJECT_ROOT = "${CLAUDE_PROJECT_DIR}";

/**
 * The MCP server registration.
 *
 * `mcp` is the CLI subcommand, NOT the `workfile-mcp` bin. npx resolves the
 * bin whose name matches the package (`workfile`) and then hands anything that
 * follows to it as arguments — so `npx @illodev/workfile workfile-mcp` prints
 * the general help and exits without ever starting a server. Selecting the
 * dedicated bin would need `npx --package=@illodev/workfile workfile-mcp`;
 * the subcommand is the shorter form of the same server.
 *
 * Exported and parameterised for the reason `claudeHooksFile` is: the plugin
 * shipped a hand-maintained copy of this file, and that copy carried the
 * `workfile-mcp` form this comment exists to warn against — so the server the
 * marketplace installed answered every request with the CLI help text on
 * stdout. `--root` is safe to append because the CLI reads argv[3] strictly
 * and rejects anything starting with a dash, so the flag is never mistaken
 * for the subcommand.
 */
/** The CLI in the workspace's own `node_modules`, beside `NPM_HOOK_RUNTIME`. */
export const LOCAL_CLI_RUNTIME =
    "node_modules/@illodev/workfile/dist/bin/workfile.js";

/**
 * The MCP registration a client runs, in one of two forms.
 *
 * Which form is written is not cosmetic. `.mcp.json` and `.claude/settings.json`
 * are generated by the same command, seconds apart, and until T-0170 one ran
 * whatever npm publishes today while the other ran whatever the repository has
 * installed. In a workspace pinned to 0.5.2 the server was 0.5.4 and the hooks
 * were 0.5.2 — the two halves of the surface disagreeing about what the
 * protocol is, and every symptom of that looks like something else.
 *
 * So a workspace with the package on disk registers that copy, on the same
 * assumption the hooks already make: the client starts the server from the
 * project directory. `npx -y` stays the answer for a workspace that has none —
 * and it is also a network fetch on a tool whose argument is that the
 * repository is the database.
 */
export function claudeMcpFile(root?, { local = false }: any = {}) {
    const tail = root ? ["mcp", "--root", root] : ["mcp"];
    return {
        mcpServers: {
            "workfile": local
                ? { command: "node", args: [LOCAL_CLI_RUNTIME, ...tail], env: {} }
                : {
                      command: "npx",
                      args: ["-y", "@illodev/workfile", ...tail],
                      env: {}
                  }
        }
    };
}

/**
 * Whether this workspace carries its own copy of the package.
 *
 * The path the hooks already run, asked about rather than assumed. A workspace
 * that only ever used the global binary has no `node_modules` entry, and that
 * is the case `npx` exists for.
 */
export async function hasLocalInstall(root) {
    return exists(join(root, ...LOCAL_CLI_RUNTIME.split("/")));
}

/**
 * Hooks that make the claim mean something.
 *
 * `PreToolUse` is deliberately `ask`, never `deny`. A guard rail that blocks
 * too much gets switched off, and then it protects nothing — asking costs one
 * keystroke and keeps the mechanism alive. It is also the only narrow matcher
 * here, and narrow on purpose: it runs before every call it matches, and the
 * latency budget is built on not spawning node for a `Bash`.
 *
 * The other two match everything, because their handlers do not discriminate
 * and an enumeration that outlives the handler is the defect this pair shipped
 * twice. `PostToolUse` refreshes presence for any tool — the comment in the
 * runtime says so — but the matcher listed three, so a session that spent
 * forty-seven minutes running commands signalled nothing and `doctor` called
 * its claim abandoned while it was working. `SessionStart` never reads
 * `source`, so listing sources could only ever go stale: whether compaction
 * produces one is the host's business, and `*` is right either way.
 */
export const NPM_HOOK_RUNTIME =
    "node node_modules/@illodev/workfile/dist/src/runtime/claude/hooks.mjs";

/** The plugin runs the same runtime from wherever the marketplace put it. */
export const PLUGIN_HOOK_RUNTIME =
    "node ${CLAUDE_PLUGIN_ROOT}/runtime/hooks.mjs";

/**
 * The same runtime, reached through PATH, for a workspace that has no copy of
 * the package on disk.
 *
 * `NPM_HOOK_RUNTIME` names a relative path, so in a workspace that only ever
 * used the global binary all three hooks named a file that is not there — and
 * a hook that fails exits 0 in silence, which [[DOC-0005]] notes is
 * indistinguishable from one that works. `.mcp.json` had already been given a
 * portable form and the hooks had not, so the two halves of the surface could
 * not agree in exactly the workspace `npx` exists for.
 *
 * `npx` is not that form. Measured on this machine with a warm npx cache, per
 * invocation:
 *
 *   bare node spawn (floor)                 p50   20 ms
 *   node node_modules/…/hooks.mjs           p50   25 ms
 *   workfile-hooks (this, through PATH)     p50   26 ms
 *   npx -y @illodev/workfile                p50 1663 ms
 *
 * `PreToolUse` runs before every call it matches and `PostToolUse` matches
 * everything, so 1.6 s per invocation is not a slower hook, it is a different
 * product. A dedicated bin costs one millisecond over the relative path
 * because it is the same file: the runtime imports nothing from the package,
 * so PATH resolution is all that is added.
 *
 * An absolute path resolved at install time was the other candidate and is
 * worse than either: `.claude/settings.json` is committed, so it would put one
 * machine's home directory into everyone else's checkout.
 */
export const GLOBAL_HOOK_RUNTIME = "workfile-hooks";

/**
 * Which of the two the workspace can actually run.
 *
 * The same question `.mcp.json` asks, answered the same way, so the server and
 * the hooks cannot end up naming different copies of the package.
 */
export function hookRuntime(local) {
    return local ? NPM_HOOK_RUNTIME : GLOBAL_HOOK_RUNTIME;
}

/**
 * Exported and parameterised because the distributable plugin ships the same
 * hooks under a different path, and its copy was hand-maintained — so when the
 * two matchers below were corrected, the plugin a user installs from the
 * marketplace kept the broken ones. The script that assembles it says "nothing
 * here is hand-maintained", and this is what made that true.
 */
export function claudeHooksFile(runtime = NPM_HOOK_RUNTIME) {
    return {
        hooks: {
            SessionStart: [
                {
                    matcher: "*",
                    hooks: [{ type: "command", command: `${runtime} session-start` }]
                }
            ],
            PreToolUse: [
                {
                    matcher: "Edit|Write|NotebookEdit",
                    hooks: [{ type: "command", command: `${runtime} pre-tool-use` }]
                }
            ],
            PostToolUse: [
                {
                    matcher: "*",
                    hooks: [
                        {
                            type: "command",
                            command: `${runtime} post-tool-use`,
                            async: true
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * The slash commands as files.
 *
 * Exported so the distributable plugin is assembled from the same source that
 * `workfile claude install` writes. A second hand-maintained copy would drift,
 * and the two would start telling agents different things.
 */
export function claudeCommandFiles(cli = DEFAULT_CLI) {
    return commandDefinitions(cli).map((command) => ({
        name: command.name,
        content: commandFile(command)
    }));
}

export function claudeSkillFile(
    protocolText = "See .project/agents/protocol.md.",
    cli = DEFAULT_CLI
) {
    return `${frontmatterBlock({
        name: "workfile",
        description:
            "How to read and change Work, Docs, History and Memory in this repository. Load before touching anything under .project/."
    })}\n\n${skillBody(protocolText, cli)}\n`;
}

/**
 * Whether the command the hooks name can actually be run.
 *
 * Two forms, two questions. The local runtime is a path, so ask the
 * filesystem. The bin is resolved through PATH by whatever spawns the hook, so
 * ask PATH — the same lookup and, unless the host runs with a different
 * environment, the same answer. Either way the point is that `claude check`
 * stops reporting a hook it has never tried to resolve.
 */
async function onPath(name) {
    const candidates =
        process.platform === "win32"
            ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
                  .split(";")
                  .filter(Boolean)
                  .map((extension) => `${name}${extension}`)
            : [name];
    for (const directory of (process.env.PATH || "").split(delimiter)) {
        if (!directory) continue;
        for (const candidate of candidates) {
            if (await exists(join(directory, candidate))) return true;
        }
    }
    return false;
}

export async function hookRuntimeReachable(root, runtime) {
    if (runtime === GLOBAL_HOOK_RUNTIME) {
        return (await onPath(GLOBAL_HOOK_RUNTIME))
            ? { ok: true, reason: null }
            : {
                  ok: false,
                  reason: `${GLOBAL_HOOK_RUNTIME} is not on PATH — install @illodev/workfile in this workspace or globally`
              };
    }
    const script = runtime.replace(/^node /, "");
    return (await exists(join(root, ...script.split("/"))))
        ? { ok: true, reason: null }
        : { ok: false, reason: `${script} does not exist` };
}

export function claudeArtifacts(workspace, { local = false }: any = {}) {
    return [
        ...commandDefinitions(workspace.cli).map((command) => ({
            id: `command:${command.name}`,
            path: join(".claude", "commands", `${command.name}.md`),
            kind: "claude-command",
            style: "frontmatter",
            content: commandFile(command)
        })),
        {
            id: "mcp",
            path: ".mcp.json",
            kind: "claude-mcp",
            json: claudeMcpFile(undefined, { local })
        },
        {
            id: "hooks",
            path: join(".claude", "settings.json"),
            kind: "claude-hooks",
            json: claudeHooksFile(hookRuntime(local))
        }
    ];
}

/**
 * The `parent.child` paths the merge writes, which is exactly what it owns.
 *
 * The merge is one level deep — `next[key] = { ...current[key], ...ours }` —
 * so ownership is per second-level key, not per file and not per top-level
 * key. `mcpServers.workfile` is ours; a `mcpServers.postgres` the repository
 * added in the same object is not. Recording the leaves rather than their
 * parent is what lets a stale entry be removed, and a drifted one be named,
 * without either touching a neighbour.
 */
function generatedPaths(generated) {
    return Object.entries(generated).flatMap(([key, value]) =>
        Object.keys(value as object).map((name) => `${key}.${name}`)
    );
}

function valueAt(source, path) {
    return path
        .split(".")
        .reduce((node, key) => (node == null ? undefined : node[key]), source);
}

/**
 * Which of our own values in a file the repository also owns no longer match
 * what an install would write.
 *
 * The two JSON artifacts used to be reported `current` on the strength of the
 * file existing, because they carry no marker to hold a digest. But the ledger
 * already records which values are ours, and that is the same question a digest
 * answers for the Markdown files.
 *
 * Values, not bytes: the file belongs to the repository, so its formatting and
 * key order are not ours to have an opinion about.
 */
function driftedPaths(current, generated, ledgerPaths) {
    const owned = generatedPaths(generated);
    const drifted = owned.filter(
        (path) => !isDeepStrictEqual(valueAt(current, path), valueAt(generated, path))
    );
    for (const entry of ledgerPaths) {
        // Recorded as ours once and no longer generated: the install would
        // remove it, so a check that ignores it disagrees with the install it
        // is checking. Ledgers written before this was path-granular hold the
        // parent, which is still generated and has nothing to answer for.
        if (owned.includes(entry)) continue;
        if (owned.some((path) => path.startsWith(`${entry}.`))) continue;
        if (valueAt(current, entry) !== undefined) {
            drifted.push(`${entry} (no longer generated)`);
        }
    }
    return drifted;
}

/**
 * Merges generated JSON into a file the user also owns.
 *
 * `.claude/settings.json` and `.mcp.json` belong to the repository, not to this
 * tool, so the generated keys are merged rather than the file replaced — and a
 * ledger records which keys are ours so removing one later actually removes it
 * instead of leaving it behind forever.
 */
async function mergeJson(path, generated, ledgerPaths) {
    let current: any = {};
    if (await exists(path)) {
        try {
            current = JSON.parse(await readFile(path, "utf8"));
        } catch {
            return { status: "conflict", reason: "existing file is not valid JSON" };
        }
    }
    const next = { ...current };
    for (const [key, value] of Object.entries(generated)) {
        next[key] = { ...(current[key] || {}), ...(value as object) };
    }
    const owned = generatedPaths(generated);
    for (const entry of ledgerPaths) {
        if (owned.includes(entry)) continue;
        const [parent, child] = entry.split(".");
        if (child === undefined) {
            // A ledger from before this was path-granular. Its parent is only
            // removable when nothing under it is generated any more.
            if (!owned.some((path) => path.startsWith(`${parent}.`)) && parent in next) {
                delete next[parent];
            }
            continue;
        }
        if (!next[parent] || !(child in next[parent])) continue;
        next[parent] = { ...next[parent] };
        delete next[parent][child];
        // An object we opened and then emptied is noise, but one the
        // repository put keys of its own into is theirs to keep.
        if (!Object.keys(next[parent]).length) delete next[parent];
    }
    const text = `${JSON.stringify(next, null, 2)}\n`;
    const before = await exists(path)
        ? await readFile(path, "utf8")
        : null;
    if (before === text) return { status: "unchanged", text };
    return { status: before === null ? "created" : "updated", text };
}

/** The record of which values in those two files this tool wrote. */
async function readLedger(workspace) {
    const path = join(workspace.paths.protocolRoot, "generated", "claude-code.json");
    if (!(await exists(path))) return { path, keys: {} };
    try {
        const ledger = JSON.parse(await readFile(path, "utf8"));
        return { path, keys: ledger.keys || {}, version: ledger.version };
    } catch {
        return { path, keys: {} };
    }
}

export async function planClaudeSurface(workspace) {
    const protocolPath = workspace.paths.agentProtocol;
    // The protocol is itself a managed file, so its bytes carry markers. They
    // are stripped before the text is embedded: nesting one managed block
    // inside another makes the reader stop at the inner `end`, and the skill
    // then reports stale forever with no edit that can settle it.
    const protocolText = (await exists(protocolPath))
        ? stripManagedMarkers(await readFile(protocolPath, "utf8"))
        : "See .project/agents/protocol.md.";
    const files = [];

    for (const command of commandDefinitions(workspace.cli)) {
        const block = renderManagedBlock({
            kind: `claude-command-${command.name}`,
            version: PACKAGE_VERSION,
            body: commandFile(command),
            // Every one of these opens with YAML frontmatter, so the marker
            // has to live inside it: see the frontmatter style.
            style: "frontmatter"
        });
        files.push({
            id: `command:${command.name}`,
            path: join(workspace.root, ".claude", "commands", `${command.name}.md`),
            label: `.claude/commands/${command.name}.md`,
            block
        });
    }

    files.push({
        id: "skill",
        path: join(workspace.root, ".claude", "skills", "workfile", "SKILL.md"),
        label: ".claude/skills/workfile/SKILL.md",
        block: renderManagedBlock({
            kind: "claude-skill",
            version: PACKAGE_VERSION,
            body: `${frontmatterBlock({
                name: "workfile",
                description:
                    "How to read and change Work, Docs, History and Memory in this repository. Load before touching anything under .project/."
            })}\n\n${skillBody(protocolText, workspace.cli)}`,
            style: "frontmatter"
        })
    });

    // Asked once and answered for both, because the whole point of T-0170 was
    // that the server and the hooks must name the same copy of the package.
    const local = await hasLocalInstall(workspace.root);
    const runtime = hookRuntime(local);
    const json = [
        {
            id: "mcp",
            path: join(workspace.root, ".mcp.json"),
            label: ".mcp.json",
            generated: claudeMcpFile(undefined, { local })
        },
        {
            id: "hooks",
            path: join(workspace.root, ".claude", "settings.json"),
            label: ".claude/settings.json",
            generated: claudeHooksFile(runtime)
        }
    ];

    return { files, json, local, runtime, version: PACKAGE_VERSION };
}

export async function syncClaudeSurface(workspace, options: any = {}) {
    if (!options.dryRun) ensureWritable(workspace);
    const plan = await planClaudeSurface(workspace);
    const results = [];

    for (const file of plan.files) {
        results.push(
            await syncManagedFile({
                ...file,
                force: Boolean(options.force),
                dryRun: Boolean(options.dryRun)
            })
        );
    }

    const ledger = await readLedger(workspace);

    for (const entry of plan.json) {
        const merged = await mergeJson(
            entry.path,
            entry.generated,
            ledger.keys[entry.id] || []
        );
        results.push({ path: entry.label, status: merged.status });
        if (!options.dryRun && merged.text && merged.status !== "unchanged") {
            await writeFileAtomic(entry.path, merged.text);
        }
        ledger.keys[entry.id] = generatedPaths(entry.generated);
    }

    if (!options.dryRun) {
        await writeFileAtomic(
            ledger.path,
            `${JSON.stringify({ keys: ledger.keys, version: PACKAGE_VERSION }, null, 2)}\n`
        );
    }

    return { version: PACKAGE_VERSION, runtime: plan.runtime, files: results };
}

export async function checkClaudeSurface(workspace) {
    const plan = await planClaudeSurface(workspace);
    const ledger = await readLedger(workspace);
    const files: ManagedFileReport[] = [];
    for (const file of plan.files) {
        files.push(await inspectManagedFile(file));
    }
    for (const entry of plan.json) {
        if (!(await exists(entry.path))) {
            files.push({ path: entry.label, status: "missing", reason: null });
            continue;
        }
        let current: any;
        try {
            current = JSON.parse(await readFile(entry.path, "utf8"));
        } catch {
            files.push({
                path: entry.label,
                status: "unmanaged",
                reason: "not valid JSON"
            });
            continue;
        }
        const drifted = driftedPaths(
            current,
            entry.generated,
            ledger.keys[entry.id] || []
        );
        files.push({
            path: entry.label,
            status: drifted.length ? "stale" : "current",
            reason: drifted.length ? drifted.join(", ") : null
        });
    }
    // The command itself, resolved rather than assumed, and reported beside the
    // files rather than among them: a hook runtime is not a file, and "the
    // settings file says what an install would write" is not the same claim as
    // "the hooks run". A hook that cannot run exits 0 in silence, which
    // DOC-0005 records as indistinguishable from one that works, so the two
    // have to be separable — they have two different repairs.
    const reachable = await hookRuntimeReachable(workspace.root, plan.runtime);
    const counts = files.reduce(
        (totals, file) => ({
            ...totals,
            [file.status]: (totals[file.status] || 0) + 1
        }),
        {}
    );
    return {
        module: "claude",
        // The files, and only the files. Whether `workfile-hooks` is on this
        // machine's PATH is not a property of the workspace — two people
        // sharing a checkout get different answers — and the pre-commit hook
        // runs `doctor --severity error`. It is reported as a warning below,
        // which is where a fact that is true here and false there belongs.
        ok: !files.some((file) => file.status !== "current"),
        counts,
        local: plan.local,
        runtime: {
            command: plan.runtime,
            status: reachable.ok ? "current" : "unreachable",
            reason: reachable.reason
        },
        files,
        issues: [
            ...files
                .filter((file) => file.status !== "current")
                .map((file) => ({
                    severity: file.status === "missing" ? "info" : "warning",
                    code: `claude-surface-${file.status}`,
                    file: file.path,
                    // The reason is the difference between "something is wrong
                    // with one of seven files" and knowing which value moved.
                    message: `Generated Claude Code file is ${file.status}: ${file.path}${
                        file.reason ? ` (${file.reason})` : ""
                    }`
                })),
            ...(reachable.ok
                ? []
                : [
                      {
                          severity: "warning",
                          code: "claude-hook-unreachable",
                          file: ".claude/settings.json",
                          message: `The Claude Code hooks name \`${plan.runtime}\`, which cannot be run: ${reachable.reason}`
                      }
                  ])
        ]
    };
}
