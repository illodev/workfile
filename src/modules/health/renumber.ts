import { readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import { parseFrontmatter, patchFrontmatter } from "../../core/frontmatter.js";
import { ensureWritable } from "../../core/guards.js";
import { normalizeRepoPath } from "../../core/glob.js";
import { CARD_LIST_KEYS, loadCards, nextCardSequence } from "../cards/index.js";
import { activityEntry, appendActivityLine } from "../cards/mutations.js";
import { buildProjectIndex } from "../records/public.js";

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idPattern(id) {
    return new RegExp(`\\b${escapeRegExp(id)}\\b`, "g");
}

/**
 * Resolves the card to move. A filename settles the exact case renumbering
 * exists for — two files carrying the same ID — where the ID alone cannot.
 */
function resolveTarget(cards, target) {
    const raw = String(target || "").trim();
    if (!raw) {
        throw new ValidationError(
            "CARD_TARGET_REQUIRED",
            "Pass a card ID or a card filename to renumber."
        );
    }
    if (raw.endsWith(".md")) {
        const file = basename(raw);
        const match = cards.find((card) => card.file === file);
        if (!match) {
            throw new NotFoundError("CARD_NOT_FOUND", `Card file not found: ${file}`);
        }
        return match;
    }
    const matches = cards.filter((card) => card.id === raw);
    if (!matches.length) {
        throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${raw}`);
    }
    if (matches.length > 1) {
        throw new ConflictError(
            "CARD_ID_AMBIGUOUS",
            `Card ID ${raw} appears in multiple files; pass the filename of the one to move.`,
            { files: matches.map((card) => card.file) }
        );
    }
    return matches[0];
}

/**
 * Moves one card to a fresh ID.
 *
 * Sequential IDs are allocated by scanning the local maximum, so two clones
 * create the same ID independently — and because filenames carry the title
 * slug, git merges both files without a conflict. Prevention would need
 * coordination no repository-native tool can assume; this is the cure.
 *
 * References are rewritten only when the old ID identified exactly one card.
 * After a collision the workspace holds references written on *both* branches,
 * each meaning its own card, and no rewrite can tell them apart — so they are
 * reported for review instead of silently repointed. Rewrites stay inside the
 * protocol root: a mention in a README is prose, not an edge worth editing.
 */
export async function renumberCard(
    workspace,
    target,
    { to = null, actor = null, now }: any = {}
) {
    ensureWritable(workspace);
    const loaded = await loadCards(workspace);
    const card = resolveTarget(loaded.cards, target);
    const oldId = card.id;
    const duplicated =
        loaded.cards.filter((candidate) => candidate.id === oldId).length > 1;
    // Graph and candidate list from before the move: outgoing edges already
    // classify every reference kind (frontmatter lists, wiki links, prose).
    const index = await buildProjectIndex(workspace);

    const prefix = workspace.config.cards.idPrefix;
    let newId;
    if (to) {
        if (!new RegExp(`^${escapeRegExp(prefix)}-\\d{4,}$`).test(to)) {
            throw new ValidationError(
                "CARD_ID_INVALID",
                `--to must look like ${prefix}-0123; got: ${to}`
            );
        }
        if (index.records.some((record) => record.id === to)) {
            throw new ConflictError("CARD_ID_TAKEN", `${to} is already in use.`);
        }
        newId = to;
    } else {
        const sequence = await nextCardSequence(workspace);
        newId = `${prefix}-${String(sequence).padStart(4, "0")}`;
    }

    const directory = card.archived
        ? workspace.paths.cardArchive
        : workspace.paths.cards;
    const oldPath = join(directory, card.file);
    const suffix = card.file.startsWith(`${oldId}-`)
        ? card.file.slice(oldId.length + 1)
        : card.file;
    const newFile = `${newId}-${suffix}`;
    const newPath = join(directory, newFile);

    const stamp = (now ? new Date(now) : new Date()).toISOString();
    const content = await readFile(oldPath, "utf8");
    let next = patchFrontmatter(
        content,
        { id: newId, updated: stamp.slice(0, 10) },
        { listKeys: CARD_LIST_KEYS }
    );
    // Self-mentions only when unambiguous — after a collision, prose naming the
    // old ID may describe the other card.
    if (!duplicated) next = next.replace(idPattern(oldId), newId);
    if (workspace.config.cards.activityTrail !== false) {
        next = appendActivityLine(
            next,
            activityEntry(actor, `renumbered from ${oldId}`, now)
        );
    }

    // The same reservation createCard takes, so a concurrent create skips past
    // this ID instead of racing for the file.
    const reservation = join(
        workspace.paths.cache,
        "locks",
        "ids",
        `${newId}.lock`
    );
    await createFileExclusive(
        reservation,
        `${JSON.stringify({ id: newId, pid: process.pid, createdAt: stamp })}\n`
    );
    try {
        await createFileExclusive(newPath, next);
        await rm(oldPath, { force: true });
    } finally {
        await rm(reservation, { force: true }).catch(() => undefined);
    }

    const protocolRoot = `${normalizeRepoPath(workspace.config.storage.root)}/`;
    const rewritten: string[] = [];
    const review: string[] = [];
    const movedPath = normalizeRepoPath(
        `${card.archived ? workspace.config.cards.archivePath : workspace.config.cards.path}/${card.file}`
    );
    for (const record of index.records) {
        const path = normalizeRepoPath(record.path);
        if (path === movedPath) continue;
        if (!record.outgoing?.some((link) => link.id === oldId)) continue;
        if (duplicated || !path.startsWith(protocolRoot)) {
            review.push(path);
            continue;
        }
        const file = join(workspace.root, path);
        const raw = await readFile(file, "utf8");
        const updated = raw.replace(idPattern(oldId), newId);
        if (updated === raw) continue;
        await writeFileAtomic(file, updated);
        rewritten.push(path);
    }

    return {
        id: newId,
        from: oldId,
        file: newFile,
        path: newPath,
        rewritten,
        review
    };
}

/**
 * Heals every duplicate card ID in one pass.
 *
 * The card that keeps the ID is chosen deterministically — oldest `created`,
 * then lexicographically smallest path — so both sides of a merge converge on
 * the same repair without coordinating. Duplicates outside the cards tree are
 * reported, not touched: docs derive IDs from paths and memory collections
 * have their own conventions this routine has no business rewriting.
 */
export async function healDuplicateCardIds(
    workspace,
    { actor = null, now }: any = {}
) {
    ensureWritable(workspace);
    const index = await buildProjectIndex(workspace);
    const cardsRoot = `${normalizeRepoPath(workspace.config.cards.path)}/`;
    const moves: Array<{
        from: string;
        to: string;
        file: string;
        review: string[];
    }> = [];
    const skipped: Array<{ id: string; paths: string[]; reason: string }> = [];
    for (const duplicate of index.duplicates || []) {
        const paths = [...duplicate.paths].map((path) => normalizeRepoPath(path));
        if (!paths.every((path) => path.startsWith(cardsRoot))) {
            skipped.push({
                id: duplicate.id,
                paths,
                reason: "not-cards"
            });
            continue;
        }
        const entries = await Promise.all(
            paths.map(async (path) => {
                const raw = await readFile(join(workspace.root, path), "utf8");
                const parsed = parseFrontmatter(raw, { listKeys: CARD_LIST_KEYS });
                return {
                    path,
                    created: String(parsed?.metadata?.created || "")
                };
            })
        );
        entries.sort(
            (left, right) =>
                left.created.localeCompare(right.created) ||
                left.path.localeCompare(right.path)
        );
        for (const loser of entries.slice(1)) {
            const move = await renumberCard(workspace, basename(loser.path), {
                actor,
                now
            });
            moves.push({
                from: duplicate.id,
                to: move.id,
                file: move.file,
                review: move.review
            });
        }
    }
    return { moves, skipped };
}
