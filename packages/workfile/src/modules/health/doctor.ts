import { join } from "node:path";

import { checkAgentInstructions } from "../agents/index.js";
import { diagnoseCards } from "../cards/index.js";
import { checkCiTemplates } from "../ci/index.js";
import { createIntegrationRegistry } from "../integrations/registry.js";
import { buildProjectIndex } from "../records/public.js";
import { exists } from "../../core/fs-utils.js";
import { lockIsStale } from "../../core/locks.js";
import { readdir } from "node:fs/promises";
import { relative } from "node:path";

const STALE_LOCK_MS = 60_000;

/**
 * Write locks whose owner is gone or which have been held implausibly long.
 *
 * `withFileLock` now breaks these on its own, so this is not a repair step —
 * it is the only way anybody finds out that it happened. A record that could
 * not be written for a while, with nothing in the health report to explain it,
 * is exactly the failure that made this invisible before.
 */
async function findStaleLocks(workspace) {
    const root = join(workspace.paths.cache, "locks");
    if (!(await exists(root))) return [];
    const stale = [];
    const queue = [root];
    while (queue.length) {
        const directory = queue.pop();
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                queue.push(path);
                continue;
            }
            if (!entry.name.endsWith(".lock")) continue;
            const verdict = await lockIsStale(path, {
                staleAfterMs: STALE_LOCK_MS
            });
            if (verdict.stale) {
                stale.push({
                    ...verdict,
                    file: relative(workspace.root, path).replaceAll("\\", "/")
                });
            }
        }
    }
    return stale.sort((left, right) => left.file.localeCompare(right.file));
}

export async function runDoctor(workspace, options: any = {}) {
    // Reuse a caller's index when there is one: `/api/v2/health` and the MCP
    // doctor tool both hold a freshly built one, and rebuilding cost as much as
    // the whole request.
    const index =
        options.index ||
        (await buildProjectIndex(workspace, {
            now: options.now || new Date(),
            diagnose: true
        }));
    const reports = [];
    if (workspace.config.cards.enabled) {
        reports.push(
            await diagnoseCards({
                cards: index.records.filter((record) => record.kind === "card"),
                unreadable: index.unreadable.cards,
                workspace,
                now: options.now || new Date(),
                checkPaths: options.checkPaths !== false
            })
        );
    }
    if (workspace.config.docs.enabled) reports.push(index.reports.docs);
    if (workspace.config.changelog.enabled) reports.push(index.reports.changelog);
    if (workspace.config.memory.enabled) reports.push(index.reports.memory);
    if (workspace.config.agents.enabled) {
        reports.push(await checkAgentInstructions(workspace));
    }
    if (workspace.config.ci.enabled && workspace.config.ci.targets.length) {
        reports.push(await checkCiTemplates(workspace));
    }
    const integrationRegistry =
        options.integrationRegistry ||
        createIntegrationRegistry(workspace.integrations || []);
    reports.push(...(await integrationRegistry.healthReports(workspace, index)));

    const issues = reports.flatMap((report) => report.issues);
    if (
        workspace.config.search.provider &&
        !integrationRegistry.semanticSearchProvider(
            workspace.config.search.provider
        )
    ) {
        issues.push({
            severity: "warning",
            code: "search-provider-unresolved",
            message: `search.provider is "${workspace.config.search.provider}", but no declared integration with that id offers semantic search. Search runs lexical-only.`,
            details: {
                provider: workspace.config.search.provider,
                integrations: integrationRegistry
                    .list()
                    .map((integration) => integration.id)
            }
        });
    }
    for (const duplicate of index.duplicates) {
        issues.push({
            severity: "error",
            code: "duplicate-record-id",
            id: duplicate.id,
            file: duplicate.paths[0],
            message: `${duplicate.id} is used by multiple project records. Run \`workfile doctor --fix\` or \`workfile card renumber --duplicates\` to heal card collisions.`,
            details: { paths: duplicate.paths }
        });
    }
    for (const stale of await findStaleLocks(workspace)) {
        issues.push({
            severity: "warning",
            code: "stale-write-lock",
            id: stale.owner?.metadata?.recordId,
            file: stale.file,
            message:
                stale.reason === "owner-process-gone"
                    ? `A write lock is held by process ${stale.owner?.pid}, which is no longer running. It will be broken on the next write.`
                    : `A write lock has been held for ${Math.round((stale.owner?.ageMs || 0) / 1000)}s. It will be broken on the next write.`,
            details: stale.owner?.metadata ?? null
        });
    }

    const legacyCards = join(workspace.root, ".planning", "backlog", "tasks");
    const migrationState = join(
        workspace.paths.protocolRoot,
        "migrations",
        "legacy-planning.json"
    );
    if ((await exists(legacyCards)) && !(await exists(migrationState))) {
        issues.push({
            severity: "info",
            code: "legacy-planning-not-migrated",
            file: ".planning/backlog/tasks",
            message:
                "A legacy .planning backlog exists without a recorded migration. Run project migrate plan."
        });
    }
    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort(
        (left, right) =>
            severityOrder[left.severity] - severityOrder[right.severity] ||
            String(left.id || left.file || "").localeCompare(
                String(right.id || right.file || "")
            ) ||
            left.code.localeCompare(right.code)
    );
    const counts = { error: 0, warning: 0, info: 0 };
    for (const issue of issues) counts[issue.severity] += 1;
    return {
        generatedAt: new Date().toISOString(),
        cards: index.modules.cards || 0,
        modules: index.modules,
        counts,
        ok: counts.error === 0,
        issues
    };
}
