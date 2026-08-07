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
import { verifyTimeoutSeconds } from "../modules/cards/validation.js";
import { discoverWorkspaceRoot, isWorkspaceRoot } from "./discover.js";
import type {
    EffectiveProjectSchema,
    ProjectConfig,
    ProjectVerificationConfig,
    ProjectWorkspace,
    VerificationMethod
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
        // Long-form raw inputs (SPEC §15), and the only writer is `migrate
        // legacy` filing away what it could not classify. `init` does not
        // create it: the spec says optional directories need not exist until
        // first use, and unlike `specs/` no generated config names this one.
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

/**
 * What a project declares about verification, for the schema.
 *
 * Both halves, because an agent asking "how do I close a card here" needs the
 * commands it may name as much as the methods its area accepts, and reporting
 * one under a key called `verification` would misdescribe the config it is
 * reporting.
 *
 * `config` is still read untyped, and now for a narrower reason than when this
 * was written: `cards.verification` is a field of `ProjectCardsConfig`, but a
 * config module loaded from the repository is arbitrary JavaScript, so what
 * arrives here has been validated rather than typed. The methods are narrowed
 * on the way out because `validateVerificationCommands` has already refused
 * anything outside the vocabulary — this is the boundary where a checked fact
 * becomes a typed one.
 */
function verificationSchema(config): ProjectVerificationConfig {
    const declared = config?.cards?.verification || {};
    return {
        commands: (Array.isArray(declared.commands) ? declared.commands : []).map(
            (argv: string[]) => [...argv]
        ),
        // Reported for the same reason the commands are: an agent deciding
        // whether to run `card verify` at all wants to know how long it may be
        // waiting, and the alternative is finding out by being cut off. Read
        // through the same function the runner uses, wrapped in the workspace
        // shape it expects, so "declared or default" is decided once.
        timeoutSeconds: verifyTimeoutSeconds({ config }),
        methods: Object.fromEntries(
            Object.entries(declared.methods || {}).map(([area, methods]) => [
                area,
                [...(methods as VerificationMethod[])]
            ])
        )
    };
}

export function effectiveSchema(config: ProjectConfig): EffectiveProjectSchema {
    // Bound rather than written inline so the extra key above is a widening of
    // this value's own type instead of an excess property on a fresh literal.
    const cards = {
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
        ),
        // Same argument, one step further: a policy an agent cannot read is a
        // policy it can only discover by being refused. An empty `methods` is
        // the honest report of a project with no opinion, and is what every
        // existing workspace reports.
        verification: verificationSchema(config)
    };
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
        cards,
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

/**
 * A query string that no earlier load of this file can have used.
 *
 * The config is re-imported through a changing URL because ESM caches modules
 * and a workspace has to see the config as it is on disk now. That key was
 * `Date.now()` alone, and a millisecond is long enough to hold two loads: write
 * a config, load it, and the URL matches the load from before the write, so the
 * cache hands back the *previous* module and the workspace reports a config the
 * file no longer holds. Rare in a person's hands and routine in a test, which is
 * where it was found — a suite that writes a config and reloads it immediately
 * saw its own declaration disappear, intermittently, for reasons that had
 * nothing to do with what it was testing.
 *
 * The counter is per process, which is all that is needed: within a process the
 * cache is what we are defeating, and across processes there is no cache.
 */
let reloads = 0;
function nextReloadKey(): string {
    reloads += 1;
    return `${Date.now()}-${reloads}`;
}

export async function loadWorkspace(
    options: LoadWorkspaceOptions = {}
): Promise<ProjectWorkspace> {
    const cwd = resolve(options.cwd || process.cwd());
    const explicit = options.root ? resolve(options.root) : null;
    const discovered = explicit ?? (await discoverWorkspaceRoot(cwd));
    if (!discovered && !options.allowMissing) {
        throw new ConfigError(
            "WORKSPACE_NOT_FOUND",
            `No project workspace found in ${cwd} or any parent directory. Run \`workfile init\` to create one, or pass --root.`,
            { cwd }
        );
    }
    // An explicit root gets the same marker check the walk performs, which it
    // never had: it was taken as given, so a mistyped or stale `--root` inside a
    // monorepo — one directory too deep is the ordinary case — answered from an
    // empty workspace and reported nothing wrong. `allowMissing` is the way
    // through, and it is what `--allow-new` already means: accept a directory
    // that is not yet a workspace. `init` is its one caller.
    //
    // Before anything is read or written, so a directory that fails this gets no
    // cache, no lock and no index.
    if (explicit && !options.allowMissing && !(await isWorkspaceRoot(explicit))) {
        throw new ConfigError(
            "WORKSPACE_NOT_FOUND",
            `${explicit} is not a workspace: it has no project.config.mjs and no ` +
                ".project/VERSION. Run `workfile init --root <dir>` to create one, " +
                "or pass --allow-new to accept a directory that is not one yet.",
            { root: explicit }
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
        url.searchParams.set("project_protocol_reload", nextReloadKey());
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
