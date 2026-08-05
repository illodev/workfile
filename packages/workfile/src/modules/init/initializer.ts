import { readFile } from "node:fs/promises";
import { mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { defineProject } from "../../config/define-project.js";
import { ConflictError, ValidationError } from "../../core/errors.js";
import { writeFileAtomic } from "../../core/filesystem.js";
import { loadWorkspace } from "../../workspace/load-workspace.js";
import { syncAgentInstructions } from "../agents/index.js";
import { syncCiTemplates } from "../ci/index.js";
import { exists } from "../../core/fs-utils.js";
import { detectPackageManager } from "../../core/package-manager.js";
import { SCHEMA_VERSION } from "../../config/defaults.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;


async function directories(path) {
    try {
        return (await readdir(path, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
            .map((entry) => entry.name);
    } catch {
        return [];
    }
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function normalizedArea(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export async function inspectRepository(rootInput) {
    const root = resolve(rootInput);
    let packageJson = null;
    const packagePath = join(root, "package.json");
    if (await exists(packagePath)) {
        try {
            packageJson = JSON.parse(await readFile(packagePath, "utf8"));
        } catch {
            packageJson = null;
        }
    }
    const packageManager = await detectPackageManager(root);
    const appDirs = await directories(join(root, "apps"));
    const packageDirs = await directories(join(root, "packages"));
    const topLevel = await directories(root);
    const knownTopLevel = topLevel.filter((name) =>
        [
            "api",
            "web",
            "client",
            "server",
            "backend",
            "frontend",
            "infra",
            "docs",
            "billing",
            "services",
            "sdk",
            "ui",
            "mcp",
            "marketing"
        ].includes(name.toLowerCase())
    );
    const areas = unique(
        [...appDirs, ...packageDirs, ...knownTopLevel]
            .map(normalizedArea)
            .filter(Boolean)
    ).slice(0, 40);
    const docs = [];
    if (await exists(join(root, "README.md"))) docs.push("README.md");
    if (await exists(join(root, "docs"))) docs.push("docs/**/*.md");
    if (appDirs.length) docs.push("apps/*/README.md");
    if (packageDirs.length) docs.push("packages/*/README.md");
    docs.push(".project/specs/**/*.md");

    const agents = [];
    if (await exists(join(root, "AGENTS.md"))) agents.push("agents-md");
    if (await exists(join(root, "CLAUDE.md"))) agents.push("claude");
    if (await exists(join(root, ".cursor"))) agents.push("cursor");
    if (await exists(join(root, ".github", "copilot-instructions.md"))) {
        agents.push("copilot");
    }
    if (!agents.length) agents.push("agents-md");

    const ci = [];
    if (await exists(join(root, ".github", "workflows"))) ci.push("github");
    if (await exists(join(root, ".gitlab-ci.yml"))) ci.push("gitlab");

    const packageName = packageJson?.name
        ? String(packageJson.name).replace(/^@[^/]+\//, "")
        : null;
    return {
        root,
        name: packageName || basename(root) || "Project",
        packageManager,
        packageJson,
        areas: areas.length ? areas : ["general"],
        docs: unique(docs),
        agents: unique(agents),
        ci: unique(ci),
        monorepo: appDirs.length > 0 || packageDirs.length > 0,
        appDirs,
        packageDirs
    };
}

function js(value, indent = 0) {
    const spacing = " ".repeat(indent);
    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return `[\n${value
            .map((item) => `${" ".repeat(indent + 4)}${JSON.stringify(item)}`)
            .join(",\n")}\n${spacing}]`;
    }
    return JSON.stringify(value);
}

export function renderProjectConfig(config) {
    return `export default {
    schemaVersion: ${config.schemaVersion},
    name: ${JSON.stringify(config.name)},
    cards: {
        areas: ${js(config.cards.areas, 8)}
    },
    docs: {
        sources: ${js(config.docs.sources, 8)}
    },
    agents: {
        targets: ${js(config.agents.targets, 8)}
    },
    ci: {
        targets: ${js(config.ci.targets, 8)}
    },
    mcp: {
        allowMutations: ${config.mcp.allowMutations}
    }
};
`;
}

function addGitignoreEntry(content, value) {
    const lines = String(content || "").split(/\r?\n/);
    if (lines.some((line) => line.trim() === value)) return content;
    const prefix = content && !content.endsWith("\n") ? "\n" : "";
    return `${content || ""}${prefix}${value}\n`;
}

function addPackageScripts(packageJson) {
    const next = structuredClone(packageJson);
    next.scripts = next.scripts && typeof next.scripts === "object" ? next.scripts : {};
    const additions = {
        project: "workfile ui",
        "project:doctor": "workfile doctor",
        "project:agents": "workfile agents sync",
        "project:mcp": "workfile mcp"
    };
    for (const [name, command] of Object.entries(additions)) {
        if (!(name in next.scripts)) next.scripts[name] = command;
    }
    return `${JSON.stringify(next, null, 2)}\n`;
}

function fileAction(path, content, status, kind) {
    return { type: "file", path, content, status, kind };
}

export async function planInitialization(rootInput, options: any = {}) {
    const detected = await inspectRepository(rootInput);
    const root = detected.root;
    const config = defineProject({
        // Imported, not literal: a bump used to leave `init` generating a
        // config its own validator rejects, breaking the very first command
        // anyone runs.
        schemaVersion: SCHEMA_VERSION,
        name: options.name || detected.name,
        cards: { areas: options.areas?.length ? options.areas : detected.areas },
        docs: { sources: options.docs?.length ? options.docs : detected.docs },
        agents: {
            targets: options.agents?.length ? options.agents : detected.agents
        },
        ci: { targets: options.ci || detected.ci }
    });
    const protocolRoot = join(root, config.storage.root);
    const dirs = [
        join(protocolRoot, "cards", "archive"),
        join(protocolRoot, "assets"),
        join(protocolRoot, "docs"),
        join(protocolRoot, "changelog", "unreleased"),
        join(protocolRoot, "changelog", "releases"),
        ...config.memory.collections.map((collection) =>
            join(protocolRoot, "memory", collection)
        ),
        join(protocolRoot, "agents", "workflows"),
        join(protocolRoot, "sources"),
        join(protocolRoot, "migrations"),
        join(protocolRoot, ".cache")
    ];
    const actions = dirs.map((path) => ({ type: "directory", path, status: "create" }));

    const configPath = join(root, "project.config.mjs");
    const configExists = await exists(configPath);
    actions.push(
        fileAction(
            configPath,
            renderProjectConfig(config),
            configExists ? "conflict" : "create",
            "config"
        )
    );
    const versionPath = join(protocolRoot, "VERSION");
    const versionContent = `${JSON.stringify(
        {
            schemaVersion: SCHEMA_VERSION,
            createdWith: `@illodev/workfile@${PACKAGE_VERSION}`,
            createdAt: new Date().toISOString()
        },
        null,
        2
    )}\n`;
    actions.push(
        fileAction(
            versionPath,
            versionContent,
            (await exists(versionPath)) ? "conflict" : "create",
            "version"
        )
    );

    const gitignorePath = join(root, ".gitignore");
    const gitignoreBefore = (await exists(gitignorePath))
        ? await readFile(gitignorePath, "utf8")
        : "";
    // Derived, not hardcoded: `storage.cache` is configurable, and a workspace
    // that moved it would otherwise commit its persisted index.
    const gitignoreAfter = addGitignoreEntry(
        gitignoreBefore,
        `${config.storage.cache.replace(/\/+$/, "")}/`
    );
    actions.push(
        fileAction(
            gitignorePath,
            gitignoreAfter,
            gitignoreBefore === gitignoreAfter
                ? "unchanged"
                : gitignoreBefore
                  ? "update"
                  : "create",
            "gitignore"
        )
    );

    if (options.addScripts !== false && detected.packageJson) {
        const packagePath = join(root, "package.json");
        const before = await readFile(packagePath, "utf8");
        const after = addPackageScripts(detected.packageJson);
        actions.push(
            fileAction(
                packagePath,
                after,
                before === after ? "unchanged" : "update",
                "package-json"
            )
        );
    }
    return {
        root,
        detected,
        config,
        actions,
        conflicts: actions.filter((action) => action.status === "conflict").map((action) => action.path),
        summary: {
            directories: dirs.length,
            files: actions.filter((action) => action.type === "file").length,
            agents: config.agents.targets,
            ci: config.ci.targets
        }
    };
}

export async function applyInitialization(plan, options: any = {}) {
    if (plan.conflicts.length && !options.force) {
        throw new ConflictError(
            "INIT_FILE_CONFLICT",
            "Workfile initialization would overwrite existing files.",
            { files: plan.conflicts }
        );
    }
    const results = [];
    for (const action of plan.actions) {
        if (action.type === "directory") {
            if (!options.dryRun) await mkdir(action.path, { recursive: true });
            results.push({ path: action.path, status: "ready", type: "directory" });
            continue;
        }
        if (action.status === "unchanged") {
            results.push({ path: action.path, status: "unchanged", type: "file" });
            continue;
        }
        if (!options.dryRun) await writeFileAtomic(action.path, action.content);
        results.push({
            path: action.path,
            status: action.status === "conflict" ? "overwritten" : action.status,
            type: "file"
        });
    }
    if (options.dryRun) {
        return { root: plan.root, dryRun: true, files: results, agents: null, ci: null };
    }
    const workspace = await loadWorkspace({ root: plan.root });
    const agents = await syncAgentInstructions(workspace, {
        targets: plan.config.agents.targets,
        force: Boolean(options.force)
    });
    const ci = plan.config.ci.targets.length
        ? await syncCiTemplates(workspace, {
              targets: plan.config.ci.targets,
              force: Boolean(options.force)
          })
        : { targets: [], changed: 0, files: [] };
    return { root: plan.root, dryRun: false, files: results, agents, ci };
}

export async function initializeProject(root, options: any = {}) {
    const plan = await planInitialization(root, options);
    if (options.planOnly || options.dryRun) return { plan, applied: null };
    const applied = await applyInitialization(plan, options);
    return { plan, applied };
}

export function validateInitTargets(values, supported, label) {
    const unsupported = values.filter((value) => !supported.includes(value));
    if (unsupported.length) {
        throw new ValidationError(
            "INIT_TARGET_UNSUPPORTED",
            `Unsupported ${label}: ${unsupported.join(", ")}`,
            { values: unsupported, supported }
        );
    }
}
