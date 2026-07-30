import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";
import { ensureWritable } from "../../core/guards.js";
import {
    inspectManagedFile,
    renderManagedBlock,
    syncManagedFile
} from "../generated/managed-files.js";

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
const COMMANDS = [
    {
        name: "next",
        frontmatter: {
            description: "Show the cards that can be started right now",
            "allowed-tools": "Bash(workfile card list *)"
        },
        body: [
            "Run `workfile card list --unclaimed --status next,backlog --limit 10 --json`",
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
            "allowed-tools": "Bash(workfile card claim *)"
        },
        body: [
            "Claim `$1` with `workfile card claim $1 --scope $2`.",
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
                "Bash(workfile card transition *), Bash(workfile changelog add *), Bash(workfile doctor *)"
        },
        body: [
            "Close out `$1`:",
            "",
            "1. `workfile doctor --severity error` must be clean.",
            "2. Add a changelog fragment if the change is user-visible.",
            "3. `workfile card transition $1 review` — `review` means verification",
            "   is pending. Only move to `done` with runtime evidence: a passing",
            "   test, a command whose output you have seen, a screenshot.",
            "",
            "Record anything durable you learned with `workfile memory add`."
        ]
    },
    {
        name: "context",
        frontmatter: {
            description: "Load the protocol context for a card",
            "argument-hint": "[T-0042]",
            "allowed-tools": "Bash(workfile agents context *)"
        },
        body: [
            "!`workfile agents context --card $1 --limit 20`",
            "",
            "The bundle above is the relevant slice of the workspace: the card,",
            "its direct relations, active conventions, open incidents and",
            "unexpired context. Read it before touching anything."
        ]
    }
];

function frontmatterBlock(entries) {
    return [
        "---",
        ...Object.entries(entries).map(([key, value]) => `${key}: ${value}`),
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
function skillBody(protocolText) {
    return [
        "This repository uses Workfile: Work, Docs, History and Memory",
        "live as Markdown under `.project/`, and the CLI and MCP server are the",
        "only supported way to change them.",
        "",
        "Read before writing:",
        "",
        "- `workfile card list --status doing` — what is already in flight.",
        "- `workfile agents context --card <id>` — the relevant slice, bounded.",
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

function mcpConfiguration() {
    return {
        mcpServers: {
            "workfile": {
                command: "npx",
                args: ["-y", "@illodev/workfile", "workfile-mcp"],
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
 * keystroke and keeps the mechanism alive.
 */
function hooksConfiguration() {
    const runtime =
        "node node_modules/@illodev/workfile/dist/src/runtime/claude/hooks.mjs";
    return {
        hooks: {
            SessionStart: [
                {
                    matcher: "startup|resume|clear",
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
                    matcher: "Edit|Write|NotebookEdit",
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
 * `project claude install` writes. A second hand-maintained copy would drift,
 * and the two would start telling agents different things.
 */
export function claudeCommandFiles() {
    return COMMANDS.map((command) => ({
        name: command.name,
        content: commandFile(command)
    }));
}

export function claudeSkillFile(protocolText = "See .project/agents/protocol.md.") {
    return `${frontmatterBlock({
        name: "workfile",
        description:
            "How to read and change Work, Docs, History and Memory in this repository. Load before touching anything under .project/."
    })}\n\n${skillBody(protocolText)}\n`;
}

export function claudeArtifacts(workspace) {
    return [
        ...COMMANDS.map((command) => ({
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
            json: mcpConfiguration()
        },
        {
            id: "hooks",
            path: join(".claude", "settings.json"),
            kind: "claude-hooks",
            json: hooksConfiguration()
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
    const protocolText = (await exists(protocolPath))
        ? await readFile(protocolPath, "utf8")
        : "See .project/agents/protocol.md.";
    const files = [];

    for (const command of COMMANDS) {
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
            })}\n\n${skillBody(protocolText)}`,
            style: "html"
        })
    });

    const json = [
        {
            id: "mcp",
            path: join(workspace.root, ".mcp.json"),
            label: ".mcp.json",
            generated: mcpConfiguration()
        },
        {
            id: "hooks",
            path: join(workspace.root, ".claude", "settings.json"),
            label: ".claude/settings.json",
            generated: hooksConfiguration()
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
