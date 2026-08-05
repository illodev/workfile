import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { exists } from "../../core/fs-utils.js";
import {
    AGENT_TARGETS,
    checkAgentInstructions,
    syncAgentInstructions
} from "../agents/index.js";
import { CI_TARGETS, checkCiTemplates, syncCiTemplates } from "../ci/index.js";
import { checkClaudeSurface, syncClaudeSurface } from "../claude/index.js";
import { findManagedBlock } from "../generated/managed-files.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;

/**
 * Whether a surface needs a resync the checks would never demand.
 *
 * The staleness checks deliberately ignore the version stamp — it is
 * provenance, and comparing it would mark twenty byte-identical files stale on
 * every bump. Upgrading is the one moment the stamp IS the question: a surface
 * whose content is current but whose stamp is old still runs the previous
 * version's story, and for the CI template the difference is not cosmetic —
 * its npx commands pin the package version.
 */
function surfaceBehind(check, installed) {
    if (!check.ok) return true;
    return (check.files || []).some(
        (file) => file.version && file.version !== installed
    );
}

/**
 * Managed blocks whose kind no configured target owns.
 *
 * These fossilize silently: no sync rewrites them, no check reads them, and
 * the stamp drifts further behind on every release. This repository's own
 * CLAUDE.md adapter sat at 0.1.0 for exactly this reason — `agents.targets`
 * never listed "claude".
 */
async function orphanBlocks(workspace) {
    const orphans: Array<{
        surface: string;
        target: string;
        kind: string;
        file: string;
        version: string | null;
    }> = [];
    const catalogs = [
        {
            surface: "agents",
            owned: new Set(workspace.config.agents.targets),
            targets: AGENT_TARGETS
        },
        {
            surface: "ci",
            owned: new Set(workspace.config.ci.targets),
            targets: CI_TARGETS
        }
    ];
    for (const { surface, owned, targets } of catalogs) {
        for (const [id, definition] of Object.entries(targets)) {
            if (owned.has(id)) continue;
            const path = resolve(workspace.root, definition.path);
            if (!(await exists(path))) continue;
            const block = findManagedBlock(
                await readFile(path, "utf8"),
                definition.kind,
                null
            );
            if (!block) continue;
            orphans.push({
                surface,
                target: id,
                kind: definition.kind,
                file: definition.path,
                version: block.metadata.version || null
            });
        }
    }
    return orphans;
}

/**
 * One command after a version bump, instead of a litany nobody remembers.
 *
 * Detects the installed version against the stamps on every managed surface
 * the config owns, resyncs the ones behind, and reports the blocks no target
 * owns. A real consumer forgot part of the manual sequence on two consecutive
 * bumps and ended up with three different stamps at once; the checks stayed
 * green throughout, which is exactly why this is a command and not a warning.
 */
export async function runUpgrade(workspace, { dryRun = false }: any = {}) {
    const installed = PACKAGE_VERSION;
    const surfaces: any[] = [];

    if (workspace.config.agents.enabled) {
        const check = await checkAgentInstructions(workspace);
        if (surfaceBehind(check, installed)) {
            const sync = dryRun ? null : await syncAgentInstructions(workspace);
            surfaces.push({
                id: "agents",
                status: dryRun ? "would-sync" : "synced",
                changed: sync ? sync.changed : null,
                files: (sync || check).files
            });
        } else {
            surfaces.push({ id: "agents", status: "current" });
        }
    } else {
        surfaces.push({ id: "agents", status: "disabled" });
    }

    if (workspace.config.ci.enabled && workspace.config.ci.targets.length) {
        const check = await checkCiTemplates(workspace);
        if (surfaceBehind(check, installed)) {
            const sync = dryRun ? null : await syncCiTemplates(workspace);
            surfaces.push({
                id: "ci",
                status: dryRun ? "would-sync" : "synced",
                changed: sync
                    ? sync.files.filter(
                          (file: { status?: string }) =>
                              file.status !== "unchanged"
                      ).length
                    : null,
                files: (sync || check).files
            });
        } else {
            surfaces.push({ id: "ci", status: "current" });
        }
    } else {
        surfaces.push({ id: "ci", status: "disabled" });
    }

    // The Claude surface has no config switch: installing it is the opt-in,
    // so presence of the skill is what "owned" means here.
    const skillPath = join(
        workspace.root,
        ".claude",
        "skills",
        "workfile",
        "SKILL.md"
    );
    if (await exists(skillPath)) {
        const check = await checkClaudeSurface(workspace);
        let behind = surfaceBehind(check, installed);
        const ledgerPath = join(
            workspace.paths.protocolRoot,
            "generated",
            "claude-code.json"
        );
        if (!behind && (await exists(ledgerPath))) {
            try {
                behind =
                    JSON.parse(await readFile(ledgerPath, "utf8")).version !==
                    installed;
            } catch {
                behind = true;
            }
        }
        if (behind) {
            const sync = dryRun ? null : await syncClaudeSurface(workspace);
            surfaces.push({
                id: "claude",
                status: dryRun ? "would-sync" : "synced",
                changed: sync
                    ? sync.files.filter(
                          (file: { status?: string }) =>
                              file.status !== "unchanged"
                      ).length
                    : null,
                files: (sync || check).files
            });
        } else {
            surfaces.push({ id: "claude", status: "current" });
        }
    } else {
        surfaces.push({ id: "claude", status: "not-installed" });
    }

    return {
        version: installed,
        dryRun: Boolean(dryRun),
        surfaces,
        orphans: await orphanBlocks(workspace),
        binary: await binaryAgreement(workspace, installed)
    };
}

/**
 * The binary doing the upgrading, against the one the workspace will run.
 *
 * The docs recommend installing as a devDependency; the update instructions in
 * circulation are `pnpm i -g @illodev/workfile` and `wf upgrade`. Run that way
 * the global binary regenerates every managed file and stamps its own version
 * into headers the local hooks and MCP server will never match — and the
 * surface reports current throughout, because the stamp is provenance and the
 * content is whatever the newer binary generates.
 *
 * Both halves are knowable at the moment of the upgrade: this process knows
 * its version, and the workspace's copy states its own. So the command says
 * so, rather than leaving it to be found through symptoms that look like
 * anything else.
 */
async function binaryAgreement(workspace, installed) {
    const path = join(
        workspace.root,
        "node_modules",
        "@illodev",
        "workfile",
        "package.json"
    );
    if (!(await exists(path))) {
        // Not a mismatch: a workspace with no local copy runs this one, and
        // the generated registration says `npx` for exactly that reason.
        return { running: installed, local: null, mismatched: false };
    }
    let local: string | null = null;
    try {
        local = JSON.parse(await readFile(path, "utf8")).version || null;
    } catch {
        local = null;
    }
    return {
        running: installed,
        local,
        mismatched: Boolean(local && local !== installed)
    };
}
