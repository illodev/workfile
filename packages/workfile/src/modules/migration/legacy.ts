import { createHash } from "node:crypto";
import {
    copyFile,
    mkdir,
    readFile,
    rename,
    rm
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { ConflictError, ValidationError } from "../../core/errors.js";
import { writeFileAtomic } from "../../core/filesystem.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { discoverFiles, normalizeRepoPath } from "../../core/glob.js";
import { loadCards } from "../cards/index.js";
import { exists } from "../../core/fs-utils.js";


function inside(root, value, label) {
    const path = resolve(root, value);
    const rel = relative(root, path);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new ValidationError(
            "MIGRATION_PATH_OUTSIDE_WORKSPACE",
            `${label} resolves outside the workspace: ${value}`,
            { path: value }
        );
    }
    return path;
}

function digest(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

async function actionFor(
    from,
    to,
    kind
): Promise<Record<string, any>> {
    const source = await readFile(from);
    if (!(await exists(to))) {
        return { from, to, kind, status: "ready", digest: digest(source) };
    }
    const target = await readFile(to);
    return {
        from,
        to,
        kind,
        status: source.equals(target) ? "identical" : "conflict",
        digest: digest(source),
        targetDigest: digest(target)
    };
}

function isWithin(relativePath, prefix) {
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

async function classifyLegacyCard(path) {
    try {
        const parsed = parseFrontmatter(await readFile(path, "utf8"));
        if (parsed?.metadata?.id && parsed?.metadata?.title) {
            return { kind: "card", id: parsed.metadata.id };
        }
    } catch {
        // Invalid legacy records are preserved as sources instead of poisoning canonical state.
    }
    return { kind: "source", id: null };
}

export async function planLegacyMigration(workspace, options: any = {}) {
    const sourceRelative = options.source || ".planning";
    const sourceRoot = inside(workspace.root, sourceRelative, "migration source");
    if (!(await exists(sourceRoot))) {
        throw new ValidationError(
            "MIGRATION_SOURCE_NOT_FOUND",
            `Legacy source directory not found: ${sourceRelative}`,
            { source: sourceRelative }
        );
    }
    const mode = options.mode || "copy";
    if (!["copy", "move"].includes(mode)) {
        throw new ValidationError(
            "MIGRATION_MODE_INVALID",
            `Migration mode must be copy or move, received: ${mode}`
        );
    }
    const files = await discoverFiles(sourceRoot, {
        include: ["**/*"],
        exclude: ["backlog/board/**", "**/node_modules/**", ".cache/**"]
    });
    const actions = [];
    const warnings = [];
    const { cards: existingCards } = await loadCards(workspace);
    const cardTargets = new Map(
        existingCards.map((card) => [
            card.id,
            {
                path: join(
                    card.archived ? workspace.paths.cardArchive : workspace.paths.cards,
                    card.file
                ),
                source: null
            }
        ])
    );
    // `paths.sources`, which resolves to exactly what `protocolRoot` + the
    // literal produced — this changes no path and fixes no bug. It is here so
    // that grepping `paths.sources` finds its one writer: rebuilt from
    // `protocolRoot`, the entry read as a directory the package resolves and
    // then forgets about, and cost a reader ten minutes proving otherwise
    // ([[T-0180]]).
    const sourceArchiveRoot = join(workspace.paths.sources, "legacy-planning");
    for (const relativePath of files) {
        const normalized = normalizeRepoPath(relativePath);
        const from = join(sourceRoot, normalized);
        let to;
        let kind;
        if (isWithin(normalized, "backlog/tasks")) {
            const classified = normalized.endsWith(".md")
                ? await classifyLegacyCard(from)
                : { kind: "source", id: null };
            if (classified.kind === "card") {
                const existingTarget = cardTargets.get(classified.id);
                to =
                    existingTarget?.path ||
                    join(
                        workspace.paths.cards,
                        normalized.slice("backlog/tasks/".length)
                    );
                kind = "card";
                if (!existingTarget) {
                    cardTargets.set(classified.id, { path: to, source: from });
                } else if (existingTarget.source && existingTarget.source !== from) {
                    kind = "duplicate-card-id";
                }
            } else {
                to = join(sourceArchiveRoot, normalized);
                kind = "source";
                warnings.push({
                    code: "legacy-card-unparseable",
                    file: normalizeRepoPath(relative(workspace.root, from)),
                    message: "Legacy task is not a valid card and will be preserved as source material."
                });
            }
        } else if (isWithin(normalized, "backlog/archive")) {
            const classified = normalized.endsWith(".md")
                ? await classifyLegacyCard(from)
                : { kind: "source", id: null };
            if (classified.kind === "card") {
                const existingTarget = cardTargets.get(classified.id);
                to =
                    existingTarget?.path ||
                    join(
                        workspace.paths.cardArchive,
                        normalized.slice("backlog/archive/".length)
                    );
                kind = "archived-card";
                if (!existingTarget) {
                    cardTargets.set(classified.id, { path: to, source: from });
                } else if (existingTarget.source && existingTarget.source !== from) {
                    kind = "duplicate-card-id";
                }
            } else {
                to = join(sourceArchiveRoot, normalized);
                kind = "source";
            }
        } else if (isWithin(normalized, "backlog/assets")) {
            to = join(workspace.paths.assets, normalized.slice("backlog/assets/".length));
            kind = "asset";
        } else {
            to = join(sourceArchiveRoot, normalized);
            kind = "source";
        }
        const action = await actionFor(from, to, kind);
        if (kind === "duplicate-card-id") {
            action.status = "conflict";
            action.reason = "duplicate-card-id";
        }
        actions.push(action);
    }
    const conflicts = actions.filter((action) => action.status === "conflict");
    const statePath = join(workspace.paths.migrations, "legacy-planning.json");
    return {
        version: 1,
        source: normalizeRepoPath(relative(workspace.root, sourceRoot)),
        sourceRoot,
        mode,
        statePath,
        actions,
        warnings,
        conflicts: conflicts.map((action) => ({
            from: normalizeRepoPath(relative(workspace.root, action.from)),
            to: normalizeRepoPath(relative(workspace.root, action.to))
        })),
        counts: {
            total: actions.length,
            ready: actions.filter((action) => action.status === "ready").length,
            identical: actions.filter((action) => action.status === "identical").length,
            conflicts: conflicts.length,
            cards: actions.filter((action) => action.kind === "card").length,
            archivedCards: actions.filter((action) => action.kind === "archived-card").length,
            assets: actions.filter((action) => action.kind === "asset").length,
            sources: actions.filter((action) => action.kind === "source").length
        }
    };
}

async function moveFile(from, to) {
    await mkdir(dirname(to), { recursive: true });
    try {
        await rename(from, to);
    } catch (error) {
        if (error?.code !== "EXDEV") throw error;
        await copyFile(from, to);
        await rm(from, { force: true });
    }
}

export async function applyLegacyMigration(workspace, plan, options: any = {}) {
    if (plan.conflicts.length && !options.force) {
        throw new ConflictError(
            "MIGRATION_FILE_CONFLICT",
            "Legacy migration has destination conflicts.",
            { conflicts: plan.conflicts }
        );
    }
    const applied = [];
    for (const action of plan.actions) {
        if (action.status === "identical") {
            if (!options.dryRun && plan.mode === "move") {
                await rm(action.from, { force: true });
            }
            applied.push({
                ...action,
                result:
                    plan.mode === "move"
                        ? options.dryRun
                            ? "planned-remove-identical"
                            : "removed-identical-source"
                        : "skipped-identical"
            });
            continue;
        }
        if (options.dryRun) {
            applied.push({ ...action, result: "planned" });
            continue;
        }
        await mkdir(dirname(action.to), { recursive: true });
        if (plan.mode === "move") {
            if (await exists(action.to)) await rm(action.to, { force: true });
            await moveFile(action.from, action.to);
        } else {
            await copyFile(action.from, action.to);
        }
        applied.push({ ...action, result: plan.mode === "move" ? "moved" : "copied" });
    }
    const state = {
        version: plan.version,
        source: plan.source,
        mode: plan.mode,
        appliedAt: new Date().toISOString(),
        files: applied.map((action) => ({
            from: normalizeRepoPath(relative(workspace.root, action.from)),
            to: normalizeRepoPath(relative(workspace.root, action.to)),
            kind: action.kind,
            result: action.result,
            digest: action.digest
        })),
        warnings: plan.warnings
    };
    if (!options.dryRun) {
        await writeFileAtomic(plan.statePath, `${JSON.stringify(state, null, 2)}\n`);
    }
    return {
        dryRun: Boolean(options.dryRun),
        statePath: normalizeRepoPath(relative(workspace.root, plan.statePath)),
        counts: plan.counts,
        warnings: plan.warnings,
        files: applied.map((action) => ({
            from: normalizeRepoPath(relative(workspace.root, action.from)),
            to: normalizeRepoPath(relative(workspace.root, action.to)),
            kind: action.kind,
            result: action.result
        }))
    };
}
