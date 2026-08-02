import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";
import { ensureWritable } from "../../core/guards.js";
import {
    DEFAULT_PACKAGE_MANAGER,
    cliInvocation
} from "../../core/package-manager.js";
import {
    inspectManagedFile,
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
export function claudeMcpFile(root?) {
    return {
        mcpServers: {
            "workfile": {
                command: "npx",
                args: root
                    ? ["-y", "@illodev/workfile", "mcp", "--root", root]
                    : ["-y", "@illodev/workfile", "mcp"],
                env: {}
            }
        }
    };
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

export function claudeArtifacts(workspace) {
    return [
        ...commandDefinitions(workspace.cli).map((command) => ({
            id: `command:${command.name}`,
            path: join(".claude", "commands", `${command.name}.md`),
            kind: "claude-command",
            style: "html",
            content: commandFile(command)
        })),
        {
            id: "mcp",
            path: ".mcp.json",
            kind: "claude-mcp",
            json: claudeMcpFile()
        },
        {
            id: "hooks",
            path: join(".claude", "settings.json"),
            kind: "claude-hooks",
            json: claudeHooksFile()
        }
    ];
}

/**
 * Merges generated JSON into a file the user also owns.
 *
 * `.claude/settings.json` and `.mcp.json` belong to the repository, not to this
 * tool, so the generated keys are merged rather than the file replaced — and a
 * ledger records which keys are ours so removing one later actually removes it
 * instead of leaving it behind forever.
 */
async function mergeJson(path, generated, ledgerKeys) {
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
    // Keys we generated before and no longer do.
    for (const key of ledgerKeys) {
        if (!(key in generated) && key in next) delete next[key];
    }
    const text = `${JSON.stringify(next, null, 2)}\n`;
    const before = await exists(path)
        ? await readFile(path, "utf8")
        : null;
    if (before === text) return { status: "unchanged", text };
    return { status: before === null ? "created" : "updated", text };
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
            style: "html"
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
            style: "html"
        })
    });

    const json = [
        {
            id: "mcp",
            path: join(workspace.root, ".mcp.json"),
            label: ".mcp.json",
            generated: claudeMcpFile()
        },
        {
            id: "hooks",
            path: join(workspace.root, ".claude", "settings.json"),
            label: ".claude/settings.json",
            generated: claudeHooksFile()
        }
    ];

    return { files, json, version: PACKAGE_VERSION };
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

    const ledgerPath = join(
        workspace.paths.protocolRoot,
        "generated",
        "claude-code.json"
    );
    const ledger = (await exists(ledgerPath))
        ? JSON.parse(await readFile(ledgerPath, "utf8"))
        : { keys: {} };

    for (const entry of plan.json) {
        const merged = await mergeJson(
            entry.path,
            entry.generated,
            ledger.keys?.[entry.id] || []
        );
        results.push({ path: entry.label, status: merged.status });
        if (!options.dryRun && merged.text && merged.status !== "unchanged") {
            await writeFileAtomic(entry.path, merged.text);
        }
        ledger.keys = ledger.keys || {};
        ledger.keys[entry.id] = Object.keys(entry.generated);
    }

    if (!options.dryRun) {
        await writeFileAtomic(
            ledgerPath,
            `${JSON.stringify({ ...ledger, version: PACKAGE_VERSION }, null, 2)}\n`
        );
    }

    return { version: PACKAGE_VERSION, files: results };
}

export async function checkClaudeSurface(workspace) {
    const plan = await planClaudeSurface(workspace);
    const files = [];
    for (const file of plan.files) {
        files.push(await inspectManagedFile(file));
    }
    for (const entry of plan.json) {
        files.push({
            path: entry.label,
            status: (await exists(entry.path)) ? "current" : "missing"
        });
    }
    const counts = files.reduce(
        (totals, file) => ({
            ...totals,
            [file.status]: (totals[file.status] || 0) + 1
        }),
        {}
    );
    return {
        module: "claude",
        ok: !files.some((file) => file.status !== "current"),
        counts,
        files,
        issues: files
            .filter((file) => file.status !== "current")
            .map((file) => ({
                severity: file.status === "missing" ? "info" : "warning",
                code: `claude-surface-${file.status}`,
                file: file.path,
                message: `Generated Claude Code file is ${file.status}: ${file.path}`
            }))
    };
}
