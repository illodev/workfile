import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineProject } from "../config/define-project.js";
import { defineProjectIntegration } from "../modules/integrations/registry.js";
import { ConfigError } from "../core/errors.js";
import { containedPath } from "../core/paths.js";
import {
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES,
    MEMORY_DEFINITIONS,
    SCHEMA_VERSION
} from "../config/defaults.js";
import { discoverWorkspaceRoot } from "./discover.js";
import type {
    EffectiveProjectSchema,
    ProjectConfig,
    ProjectWorkspace
} from "../types.js";
import { exists } from "../core/fs-utils.js";
import { cliInvocation, detectPackageManager } from "../core/package-manager.js";


function inside(root, candidate, label) {
    const resolved = containedPath(root, candidate);
    if (!resolved) {
        throw new ConfigError(
            "CONFIG_PATH_OUTSIDE_WORKSPACE",
            `${label} resolves outside the workspace: ${candidate}`,
            { path: label, value: candidate }
        );
    }
    return resolved;
}

function resolvePaths(root: string, config: ProjectConfig) {
    return {
        root,
        protocolRoot: inside(root, config.storage.root, "storage.root"),
        cache: inside(root, config.storage.cache, "storage.cache"),
        cards: inside(root, config.cards.path, "cards.path"),
        cardArchive: inside(root, config.cards.archivePath, "cards.archivePath"),
        assets: inside(root, config.cards.assetsPath, "cards.assetsPath"),
        docs: inside(root, config.docs.managedPath, "docs.managedPath"),
        changelogFragments: inside(
            root,
            config.changelog.fragmentsPath,
            "changelog.fragmentsPath"
        ),
        changelogReleases: inside(
            root,
            config.changelog.releasesPath,
            "changelog.releasesPath"
        ),
        memory: inside(root, config.memory.path, "memory.path"),
        agentProtocol: inside(
            root,
            config.agents.canonicalInstructions,
            "agents.canonicalInstructions"
        ),
        agentWorkflows: inside(
            root,
            config.agents.workflowsPath,
            "agents.workflowsPath"
        ),
        migrations: inside(root, `${config.storage.root}/migrations`, "storage.migrations"),
        sources: inside(root, `${config.storage.root}/sources`, "storage.sources"),
        // Tracked, not cached. A baseline under `storage.cache` would be
        // per-clone and absent in CI, which is the one place a "nothing new"
        // verdict has to hold. Committing it also puts accepted debt in the
        // diff, where a reviewer can see it grow.
        doctorBaseline: inside(
            root,
            `${config.storage.root}/doctor-baseline.json`,
            "storage.doctorBaseline"
        )
    };
}

export function effectiveSchema(config: ProjectConfig): EffectiveProjectSchema {
    return {
        schemaVersion: SCHEMA_VERSION,
        modules: {
            cards: Boolean(config.cards.enabled),
            docs: Boolean(config.docs.enabled),
            changelog: Boolean(config.changelog.enabled),
            memory: Boolean(config.memory.enabled),
            agents: Boolean(config.agents.enabled),
            ci: Boolean(config.ci.enabled),
            mcp: Boolean(config.mcp.enabled)
        },
        cards: {
            statuses: [...CARD_STATUSES],
            types: [...CARD_TYPES],
            priorities: [...CARD_PRIORITIES],
            efforts: [...CARD_EFFORTS],
            areas: [...config.cards.areas],
            // Reported so an agent discovers a project's axes the way it
            // discovers its areas. Without this the only way to learn that
            // `context:` exists and what it accepts is to read the config file,
            // which the MCP surface deliberately does not expose.
            axes: Object.fromEntries(
                Object.entries(config.cards.axes || {}).map(([name, values]) => [
                    name,
                    [...(values as string[])]
                ])
            )
        },
        docs: {
            kinds: [...config.docs.kinds],
            statuses: [...config.docs.statuses],
            layout: config.docs.layout,
            managedPath: config.docs.managedPath,
            defaults: {
                kind: config.docs.defaultKind,
                status: config.docs.defaultStatus
            }
        },
        memory: {
            collections: config.memory.collections.map((id) => ({
                id,
                ...MEMORY_DEFINITIONS[id],
                statuses: [...MEMORY_DEFINITIONS[id].statuses]
            }))
        },
        agents: {
            targets: [...config.agents.targets],
            canonicalInstructions: config.agents.canonicalInstructions,
            workflowsPath: config.agents.workflowsPath
        },
        ci: {
            targets: [...config.ci.targets],
            nodeVersion: config.ci.nodeVersion
        },
        mcp: {
            transport: config.mcp.transport,
            allowMutations: config.mcp.allowMutations,
            resourcePageSize: config.mcp.resourcePageSize
        },
        search: {
            provider: config.search.provider,
            semanticWeight: config.search.semanticWeight,
            maxProviderRecords: config.search.maxProviderRecords
        },
        changelog: {
            releaseStrategy: config.changelog.releaseStrategy,
            types: [...config.changelog.types],
            visibilities: [...config.changelog.visibilities],
            defaults: {
                type: config.changelog.defaultType,
                visibility: config.changelog.defaultVisibility
            }
        }
    };
}

export interface LoadWorkspaceOptions {
    root?: string;
    cwd?: string;
    configPath?: string;
    readOnly?: boolean;
    /**
     * Accept a directory that holds no workspace marker, treating `cwd` as the
     * root. Only `init` and callers that deliberately bootstrap should set it —
     * everything else wants the error.
     */
    allowMissing?: boolean;
}

export async function loadWorkspace(
    options: LoadWorkspaceOptions = {}
): Promise<ProjectWorkspace> {
    const cwd = resolve(options.cwd || process.cwd());
    const discovered = options.root
        ? resolve(options.root)
        : await discoverWorkspaceRoot(cwd);
    if (!discovered && !options.allowMissing) {
        throw new ConfigError(
            "WORKSPACE_NOT_FOUND",
            `No project workspace found in ${cwd} or any parent directory. Run \`workfile init\` to create one, or pass --root.`,
            { cwd }
        );
    }
    const root = discovered || cwd;
    const configPath = options.configPath
        ? inside(root, options.configPath, "configPath")
        : resolve(root, "project.config.mjs");
    let raw: Record<string, unknown> = {};
    let declaredIntegrations: unknown = [];
    if (await exists(configPath)) {
        const url = pathToFileURL(configPath);
        url.searchParams.set("project_protocol_reload", String(Date.now()));
        const module = await import(url.href);
        raw = module.default || {};
        declaredIntegrations = module.integrations ?? [];
    }
    if (!Array.isArray(declaredIntegrations)) {
        throw new ConfigError(
            "CONFIG_INTEGRATIONS_INVALID",
            "The config module's `integrations` export must be an array of integration definitions.",
            { configPath }
        );
    }
    // Validated here so a typo fails on load with the config file named, not
    // deep inside whichever surface first builds a registry.
    const integrations = Object.freeze(
        declaredIntegrations.map((candidate) => defineProjectIntegration(candidate))
    );
    const config = defineProject(raw);
    const versionPath = resolve(root, config.storage.root, "VERSION");
    let version: any = null;
    if (await exists(versionPath)) {
        version = JSON.parse(await readFile(versionPath, "utf8"));
        if (version.schemaVersion !== config.schemaVersion) {
            throw new ConfigError(
                "CONFIG_SCHEMA_MISMATCH",
                // Naming the repair matters: this fires on every command in
                // every installed workspace the day SCHEMA_VERSION moves, and
                // without it the only way out is editing two files by hand.
                version.schemaVersion < config.schemaVersion
                    ? `The workspace uses schema ${version.schemaVersion} and this package expects ${config.schemaVersion}. Run \`workfile migrate schema\` to upgrade it.`
                    : `The workspace uses schema ${version.schemaVersion}, newer than this package's ${config.schemaVersion}. Upgrade @illodev/workfile.`,
                {
                    configSchemaVersion: config.schemaVersion,
                    versionSchemaVersion: version.schemaVersion
                }
            );
        }
    }
    const packageManager = await detectPackageManager(root);
    return {
        root,
        configPath,
        config,
        version,
        paths: resolvePaths(root, config),
        schema: effectiveSchema(config),
        readOnly: Boolean(options.readOnly),
        packageManager,
        cli: cliInvocation(packageManager),
        integrations
    };
}
