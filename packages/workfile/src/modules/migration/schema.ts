import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SCHEMA_VERSION } from "../../config/defaults.js";
import { ConflictError, ValidationError } from "../../core/errors.js";
import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";
import { ensureWritable } from "../../core/guards.js";
import { withFileLock } from "../../core/locks.js";

export interface SchemaMigration {
    /** The version this step produces. Applied in ascending order. */
    to: number;
    title: string;
    /**
     * Describes what the step will touch, without touching it. Runs before the
     * user is asked to commit to anything.
     */
    plan(workspace): Promise<string[]> | string[];
    /** Performs the change. Called only after every earlier step succeeded. */
    up(workspace): Promise<void> | void;
}

/**
 * Ordered schema migrations.
 *
 * Empty while `SCHEMA_VERSION` is 2, because there is nothing to migrate from
 * yet — the point of landing the runner now is that the alternative is
 * discovering on bump day that every installed workspace fails every command
 * with `CONFIG_SCHEMA_MISMATCH` and the only repair is hand-editing two files.
 *
 * A step lands here alongside the change that raises `SCHEMA_VERSION`.
 */
export const SCHEMA_MIGRATIONS: SchemaMigration[] = [];

function versionPathOf(workspace) {
    return join(workspace.paths.protocolRoot, "VERSION");
}

async function readVersionFile(workspace) {
    const path = versionPathOf(workspace);
    if (!(await exists(path))) return null;
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch (error: any) {
        throw new ValidationError(
            "WORKSPACE_VERSION_UNREADABLE",
            `${path} is not readable JSON: ${error.message}`
        );
    }
}

/**
 * Where the workspace stands relative to the installed package.
 *
 * Reads `.project/VERSION` directly rather than going through `loadWorkspace`,
 * because a workspace that needs migrating is exactly the one `loadWorkspace`
 * refuses to open.
 */
export async function inspectSchemaVersion(workspace) {
    const version = await readVersionFile(workspace);
    const current = Number(version?.schemaVersion ?? SCHEMA_VERSION);
    return {
        current,
        target: SCHEMA_VERSION,
        pending: SCHEMA_MIGRATIONS.filter(
            (migration) => migration.to > current && migration.to <= SCHEMA_VERSION
        ),
        ahead: current > SCHEMA_VERSION,
        upToDate: current === SCHEMA_VERSION
    };
}

export async function planSchemaMigration(workspace) {
    const state = await inspectSchemaVersion(workspace);
    if (state.ahead) {
        throw new ConflictError(
            "WORKSPACE_SCHEMA_AHEAD",
            `The workspace uses schema ${state.current}, newer than this package's ${state.target}. Upgrade @illodev/workfile instead of migrating.`,
            { current: state.current, target: state.target }
        );
    }
    const steps = [];
    for (const migration of state.pending) {
        steps.push({
            to: migration.to,
            title: migration.title,
            changes: await migration.plan(workspace)
        });
    }
    return { ...state, steps };
}

export async function applySchemaMigration(workspace, options: any = {}) {
    ensureWritable(workspace);
    const plan = await planSchemaMigration(workspace);
    if (options.dryRun || plan.upToDate) return { ...plan, applied: [] };

    const lockPath = join(workspace.paths.cache, "locks", "schema-migration.lock");
    return withFileLock(
        lockPath,
        async () => {
            const applied = [];
            for (const migration of plan.pending) {
                await migration.up(workspace);
                applied.push({ to: migration.to, title: migration.title });
            }

            const version = (await readVersionFile(workspace)) || {};
            await writeFileAtomic(
                versionPathOf(workspace),
                `${JSON.stringify(
                    {
                        ...version,
                        schemaVersion: SCHEMA_VERSION,
                        upgradedWith: `@illodev/workfile@${options.packageVersion || "unknown"}`,
                        upgradedAt: options.now || new Date().toISOString()
                    },
                    null,
                    2
                )}\n`
            );

            const ledgerPath = join(
                workspace.paths.migrations,
                "schema.json"
            );
            const ledger = (await exists(ledgerPath))
                ? JSON.parse(await readFile(ledgerPath, "utf8"))
                : { migrations: [] };
            ledger.migrations.push({
                from: plan.current,
                to: SCHEMA_VERSION,
                steps: applied,
                at: options.now || new Date().toISOString()
            });
            await writeFileAtomic(
                ledgerPath,
                `${JSON.stringify(ledger, null, 2)}\n`
            );

            return { ...plan, applied };
        },
        { metadata: { module: "migration", recordId: "schema" } }
    );
}
