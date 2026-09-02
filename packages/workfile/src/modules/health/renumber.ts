import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import {
    createFileExclusive,
    isCreateContention,
    writeFileAtomic
} from "../../core/filesystem.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import { patchFrontmatter } from "../../core/frontmatter.js";
import { ensureWritable } from "../../core/guards.js";
import { normalizeRepoPath } from "../../core/glob.js";
import { acquireRecordId } from "../../core/record-ids.js";
import { MEMORY_DEFINITIONS } from "../../config/defaults.js";
import { CARD_LIST_KEYS, cardFileName, loadCards } from "../cards/index.js";
import { activityEntry, appendActivityLine } from "../cards/mutations.js";
import { CHANGE_LIST_KEYS } from "../changelog/index.js";
import { DOC_LIST_KEYS } from "../docs/index.js";
import { MEMORY_LIST_KEYS } from "../memory/index.js";
import { buildProjectIndex } from "../records/public.js";
import { classifyDuplicates } from "./duplicates.js";
import { staleFilenames } from "./filenames.js";

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idPattern(id) {
    return new RegExp(`\\b${escapeRegExp(id)}\\b`, "g");
}

interface RenumberPlan {
    /** How the record is named in an error a caller reads. */
    noun: string;
    listKeys: Set<string>;
    prefix(workspace, record): string;
    /**
     * Every directory that may already hold this prefix. Incomplete here means
     * an ID minted twice, so an archive that nests inside its live tree is
     * still listed on its own.
     */
    directories(workspace, record): string[];
    activityTrail(workspace): boolean;
    /** Why this record must not move, or `null` when it may. */
    frozen(record): { code: string; message: string } | null;
    codes: {
        required: string;
        notFound: string;
        ambiguous: string;
        invalid: string;
        taken: string;
        allocation: string;
    };
}

/**
 * One row per kind whose IDs are allocated by scanning a sequence.
 *
 * Only four facts differ between them — the prefix, the directories that
 * define the sequence, the frontmatter keys that are lists, and whether the
 * file carries an activity trail. Everything else about a renumber is the same
 * operation, which is why healing used to exist for cards alone: the routine
 * was written against a card rather than against a record.
 */
const PLANS: Record<string, RenumberPlan> = {
    card: {
        noun: "Card",
        listKeys: CARD_LIST_KEYS,
        prefix: (workspace) => workspace.config.cards.idPrefix,
        directories: (workspace) => [
            workspace.paths.cards,
            workspace.paths.cardArchive
        ],
        activityTrail: (workspace) =>
            workspace.config.cards.activityTrail !== false,
        frozen: () => null,
        codes: {
            required: "CARD_TARGET_REQUIRED",
            notFound: "CARD_NOT_FOUND",
            ambiguous: "CARD_ID_AMBIGUOUS",
            invalid: "CARD_ID_INVALID",
            taken: "CARD_ID_TAKEN",
            allocation: "CARD_ID_ALLOCATION_FAILED"
        }
    },
    change: {
        noun: "Changelog fragment",
        listKeys: CHANGE_LIST_KEYS,
        prefix: (workspace) => workspace.config.changelog.idPrefix,
        // Consuming a fragment moves it under its release, so an
        // unreleased-only listing would mint an ID that is already spent.
        directories: (workspace) => [
            workspace.paths.changelogFragments,
            workspace.paths.changelogReleases
        ],
        activityTrail: () => false,
        frozen: (record) =>
            record.released
                ? {
                      code: "CHANGE_FRAGMENT_RELEASED",
                      message:
                          `${record.id} was released and is frozen. A release ` +
                          "record lists it by ID; describe the correction in a " +
                          "new fragment."
                  }
                : null,
        codes: {
            required: "CHANGE_TARGET_REQUIRED",
            notFound: "CHANGE_FRAGMENT_NOT_FOUND",
            ambiguous: "CHANGE_ID_AMBIGUOUS",
            invalid: "CHANGE_ID_INVALID",
            taken: "CHANGE_ID_TAKEN",
            allocation: "RECORD_ID_ALLOCATION_FAILED"
        }
    },
    doc: {
        noun: "Document",
        listKeys: DOC_LIST_KEYS,
        prefix: (workspace) => workspace.config.docs.idPrefix,
        directories: (workspace) => [workspace.paths.docs],
        activityTrail: () => false,
        frozen: (record) =>
            record.managed
                ? null
                : {
                      code: "DOC_NOT_MANAGED",
                      message:
                          `${record.path} is indexed, not managed. Workfile ` +
                          "does not rewrite files outside `docs.managedPath`."
                  },
        codes: {
            required: "DOC_TARGET_REQUIRED",
            notFound: "DOC_NOT_FOUND",
            ambiguous: "DOC_ID_AMBIGUOUS",
            invalid: "DOC_ID_INVALID",
            taken: "DOC_ID_TAKEN",
            allocation: "DOC_ID_ALLOCATION_FAILED"
        }
    },
    memory: {
        noun: "Memory record",
        listKeys: MEMORY_LIST_KEYS,
        prefix: (workspace, record) => memoryDefinition(record).idPrefix,
        // One collection owns one prefix, so its own directory is the whole
        // domain for this ID.
        directories: (workspace, record) => [
            join(workspace.paths.memory, String(record.collection))
        ],
        activityTrail: () => false,
        frozen: () => null,
        codes: {
            required: "MEMORY_TARGET_REQUIRED",
            notFound: "MEMORY_NOT_FOUND",
            ambiguous: "MEMORY_ID_AMBIGUOUS",
            invalid: "MEMORY_ID_INVALID",
            taken: "MEMORY_ID_TAKEN",
            allocation: "MEMORY_ID_ALLOCATION_FAILED"
        }
    }
};

const GENERIC_CODES = {
    required: "RECORD_TARGET_REQUIRED",
    notFound: "RECORD_NOT_FOUND",
    ambiguous: "RECORD_ID_AMBIGUOUS",
    invalid: "RECORD_ID_INVALID",
    taken: "RECORD_ID_TAKEN",
    allocation: "RECORD_ID_ALLOCATION_FAILED"
};

/** The collection's definition, read defensively: `collection` comes off disk. */
function memoryDefinition(record) {
    const definition = MEMORY_DEFINITIONS[record.collection];
    if (!definition) {
        throw new ValidationError(
            "MEMORY_COLLECTION_INVALID",
            `Unknown memory collection: ${record.collection}`
        );
    }
    return definition;
}

function planFor(kind: string): RenumberPlan {
    const plan = PLANS[kind];
    if (!plan) {
        throw new ValidationError(
            "RECORD_KIND_NOT_RENUMBERABLE",
            kind === "release"
                ? "A release record is written once, when the version is cut, and is never renumbered."
                : `Workfile does not allocate IDs for ${kind} records, so it cannot renumber one.`
        );
    }
    return plan;
}

/**
 * Resolves the record to move.
 *
 * Three spellings, narrowest first. A repository path settles the case
 * renumbering exists for — two files carrying one ID — which is why the healer
 * passes one: a filename cannot, because two managed documents can share an ID
 * *and* a slug in different folders.
 */
function resolveRecord(records, target, kind) {
    const codes = (kind && PLANS[kind]?.codes) || GENERIC_CODES;
    const noun = (kind && PLANS[kind]?.noun) || "Record";
    const raw = String(target || "").trim();
    if (!raw) {
        throw new ValidationError(
            codes.required,
            "Pass an ID, a filename or a repository path to renumber."
        );
    }
    const pool = kind
        ? records.filter((record) => record.kind === kind)
        : records;
    const wanted = normalizeRepoPath(raw);
    const byPath = pool.filter(
        (record) => normalizeRepoPath(record.path) === wanted
    );
    if (byPath.length === 1) return byPath[0];
    if (raw.endsWith(".md")) {
        const file = basename(raw);
        const matches = pool.filter(
            (record) => basename(String(record.path)) === file
        );
        if (!matches.length) {
            throw new NotFoundError(codes.notFound, `${noun} file not found: ${file}`);
        }
        if (matches.length > 1) {
            throw new ConflictError(
                codes.ambiguous,
                `${file} exists in more than one folder; pass its repository path.`,
                { files: matches.map((record) => record.path) }
            );
        }
        return matches[0];
    }
    const matches = pool.filter((record) => record.id === raw);
    if (!matches.length) {
        throw new NotFoundError(codes.notFound, `${noun} not found: ${raw}`);
    }
    if (matches.length > 1) {
        throw new ConflictError(
            codes.ambiguous,
            `${raw} appears in multiple files; pass the path of the one to move.`,
            { files: matches.map((record) => record.path) }
        );
    }
    return matches[0];
}

/**
 * The reservation for a caller-supplied ID.
 *
 * `acquireRecordId` mints its own, so it cannot serve `--to` — the one case
 * where the caller has already decided which ID it wants. Same lockfile and the
 * same contention mapping, so a concurrent create steps past this ID either
 * way.
 */
async function reserveExplicitId(workspace, to, plan, record, records) {
    const prefix = plan.prefix(workspace, record);
    if (!new RegExp(`^${escapeRegExp(prefix)}-\\d{4,}$`).test(to)) {
        throw new ValidationError(
            plan.codes.invalid,
            `--to must look like ${prefix}-0123; got: ${to}`
        );
    }
    if (records.some((candidate) => candidate.id === to)) {
        throw new ConflictError(plan.codes.taken, `${to} is already in use.`);
    }
    const reservation = join(workspace.paths.cache, "locks", "ids", `${to}.lock`);
    await createFileExclusive(
        reservation,
        `${JSON.stringify({ id: to, pid: process.pid, createdAt: new Date().toISOString() })}\n`
    ).catch((error: any) => {
        if (!isCreateContention(error)) throw error;
        throw new ConflictError(
            plan.codes.taken,
            `${to} was allocated by another process while renumbering.`,
            { contention: error.code }
        );
    });
    return {
        id: to,
        reservation,
        release: () => rm(reservation, { force: true }).catch(() => undefined)
    };
}

/**
 * Moves one record to a fresh ID.
 *
 * Sequential IDs are allocated by scanning the local maximum, so two clones
 * create the same ID independently — and because filenames carry the title
 * slug, git merges both files without a conflict. Prevention would need
 * coordination no repository-native tool can assume; this is the cure, and it
 * is the same cure for every kind that allocates that way. The manual repair
 * was to delete the file and add it again, which loses the two things that
 * make this safe: nothing rewrites references, and nothing picks the loser the
 * same way twice.
 *
 * References are rewritten only when the old ID identified exactly one record.
 * After a collision the workspace holds references written on *both* branches,
 * each meaning its own record, and no rewrite can tell them apart — so they are
 * reported for review instead of silently repointed. Rewrites stay inside the
 * protocol root: a mention in a README is prose, not an edge worth editing.
 */
export async function renumberRecord(
    workspace,
    target,
    { to = null, actor = null, now, kind = null }: any = {}
) {
    ensureWritable(workspace);
    // Graph and candidate list from before the move: outgoing edges already
    // classify every reference kind (frontmatter lists, wiki links, prose).
    const index = await buildProjectIndex(workspace);
    const record = resolveRecord(index.records, target, kind);
    const plan = planFor(record.kind);
    // Before anything is written, so the library API is safe on its own rather
    // than only through a sweep that already knows better.
    const frozen = plan.frozen(record);
    if (frozen) throw new ValidationError(frozen.code, frozen.message);

    const oldId = record.id;
    const duplicated =
        index.records.filter((candidate) => candidate.id === oldId).length > 1;
    const held = to
        ? await reserveExplicitId(workspace, to, plan, record, index.records)
        : await acquireRecordId({
              prefix: plan.prefix(workspace, record),
              directories: plan.directories(workspace, record),
              lockDirectory: join(workspace.paths.cache, "locks", "ids"),
              code: plan.codes.allocation
          });
    const newId = held.id;

    // Derived from the record's own path, so an archived card, a managed
    // document nested in a folder and a memory record inside its collection all
    // land back where they were. A managed document's `file` carries that
    // folder, which is why the filename comes from the path instead.
    const oldPath = join(workspace.root, record.path);
    const oldFile = basename(String(record.path));
    const suffix = oldFile.startsWith(`${oldId}-`)
        ? oldFile.slice(String(oldId).length + 1)
        : oldFile;
    const newFile = `${newId}-${suffix}`;
    const newPath = join(dirname(oldPath), newFile);

    const stamp = (now ? new Date(now) : new Date()).toISOString();
    const content = await readFile(oldPath, "utf8");
    let next = patchFrontmatter(
        content,
        { id: newId, updated: stamp.slice(0, 10) },
        { listKeys: plan.listKeys }
    );
    // Self-mentions only when unambiguous — after a collision, prose naming the
    // old ID may describe the other record.
    if (!duplicated) next = next.replace(idPattern(oldId), newId);
    if (plan.activityTrail(workspace)) {
        next = appendActivityLine(
            next,
            activityEntry(actor, `renumbered from ${oldId}`, now)
        );
    }

    // The durable create can lose to a concurrent allocation, and that is not a
    // fault: the ID check above ran against an index read before any of this.
    // Reported as the conflict it is, rather than as the raw errno, which on
    // Windows is not even `EEXIST` — see `isCreateContention`.
    const contended = (error: any) => {
        if (!isCreateContention(error)) throw error;
        throw new ConflictError(
            plan.codes.taken,
            `${newId} was allocated by another process while renumbering.`,
            { contention: error.code }
        );
    };
    try {
        await createFileExclusive(newPath, next).catch(contended);
        await rm(oldPath, { force: true });
    } finally {
        await held.release();
    }

    const protocolRoot = `${normalizeRepoPath(workspace.config.storage.root)}/`;
    const rewritten: string[] = [];
    const review: string[] = [];
    const movedPath = normalizeRepoPath(record.path);
    for (const candidate of index.records) {
        const path = normalizeRepoPath(candidate.path);
        if (path === movedPath) continue;
        if (!candidate.outgoing?.some((link) => link.id === oldId)) continue;
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
        kind: record.kind,
        file: newFile,
        path: newPath,
        repoPath: normalizeRepoPath(relative(workspace.root, newPath)),
        rewritten,
        review
    };
}

/** Moves one card to a fresh ID. Every error code it ever threw is unchanged. */
export async function renumberCard(workspace, target, options: any = {}) {
    return renumberRecord(workspace, target, { ...options, kind: "card" });
}

/**
 * Heals every duplicate record ID in one pass.
 *
 * The record that keeps the ID is chosen by `classifyDuplicates` — the same
 * verdict `doctor` prints — so both sides of a merge converge on the same
 * repair without coordinating. A collision nothing can repair is returned
 * carrying the reason, because a sweep that drops what it did not fix reads as
 * a clean run.
 *
 * `kinds` scopes the sweep. `card renumber --duplicates` passes `["card"]`, so
 * a command under the `card` word never moves a changelog fragment.
 */
export async function healDuplicateRecordIds(
    workspace,
    { actor = null, now, kinds = null, ids = null }: any = {}
) {
    ensureWritable(workspace);
    const index = await buildProjectIndex(workspace);
    const moves: Array<{
        from: string;
        to: string;
        kind: string;
        file: string;
        path: string;
        review: string[];
    }> = [];
    const skipped: Array<{
        id: string;
        kind: string | null;
        paths: string[];
        reason: string;
        reasonText: string;
    }> = [];
    for (const duplicate of classifyDuplicates(index)) {
        if (!duplicate.healable) {
            skipped.push({
                id: duplicate.id,
                kind: duplicate.kind,
                paths: duplicate.paths,
                reason: String(duplicate.reason),
                reasonText: String(duplicate.reasonText)
            });
            continue;
        }
        if (ids && !ids.includes(duplicate.id)) {
            // Reported rather than skipped in silence: a caller who narrowed the
            // sweep still needs to learn that a duplicate exists outside it, or
            // the narrow run reads as a clean workspace.
            skipped.push({
                id: duplicate.id,
                kind: duplicate.kind,
                paths: duplicate.paths,
                reason: "out-of-scope",
                reasonText:
                    `this sweep is scoped to ${ids.join(", ")}; ` +
                    "run `workfile doctor --fix` to heal it"
            });
            continue;
        }
        if (kinds && !kinds.includes(duplicate.kind)) {
            skipped.push({
                id: duplicate.id,
                kind: duplicate.kind,
                paths: duplicate.paths,
                reason: "out-of-scope",
                reasonText:
                    `this sweep is scoped to ${kinds.join(" and ")} records; ` +
                    "run `workfile doctor --fix` to heal it"
            });
            continue;
        }
        for (const mover of duplicate.movers) {
            const move = await renumberRecord(workspace, mover, {
                kind: duplicate.kind,
                actor,
                now
            });
            moves.push({
                from: duplicate.id,
                to: move.id,
                kind: move.kind,
                file: move.file,
                path: move.repoPath,
                review: move.review
            });
        }
    }
    return { moves, skipped };
}

/** Heals duplicate card IDs and reports every other collision under `skipped`. */
export async function healDuplicateCardIds(workspace, options: any = {}) {
    return healDuplicateRecordIds(workspace, { ...options, kinds: ["card"] });
}

/**
 * Renames cards whose filename no longer matches their title.
 *
 * `createCard` derives the filename from the title and `patchCard` never
 * revisited it, so a retitled card kept a filename describing work it no longer
 * described. Nothing rewrites references: cards are linked by ID, and the ID
 * half of the filename does not move here — only the slug does. A card whose
 * filename does not even start with its ID is left alone, because that is the
 * `filename-mismatch` error and renumbering, not renaming, is its repair.
 *
 * Collisions are skipped rather than resolved. Two cards can legitimately want
 * the same slug, and picking a winner would rename a file the caller never
 * asked about.
 */
/**
 * Renames every record whose filename no longer matches its title.
 *
 * The card-only version is below and delegates to this. Driven off the index
 * rather than off four loaders, because the index already holds every kind with
 * the one thing this needs: the repository-relative path, whose directory is
 * where the file goes and whose basename is what it is called. That is what
 * makes an archived card, a memory collection and an unreleased fragment the
 * same case here.
 *
 * Nothing rewrites references. Records are linked by id, and the id half of a
 * filename does not move — only the slug does.
 *
 * The activity line is appended for cards alone, because cards are the only kind
 * that carries a trail. A rename with no trail entry is not silent: it is a
 * `git mv` in a diff, which for the other three kinds is the whole record of it.
 *
 * Which kinds are in scope, and why the others are not, is stated once in
 * `filenames.ts` — the same function that decides what to report.
 */
export async function reslugStaleRecordFiles(
    workspace,
    { actor = null, now, kinds = null, ids = null }: any = {}
) {
    ensureWritable(workspace);
    const index = await buildProjectIndex(workspace);
    const wanted = kinds ? new Set(kinds) : null;
    // `ids` narrows the sweep to the records the caller named. Absent, the sweep
    // is the whole workspace, which is what it has always been and what a
    // maintenance pass wants. Present, it is the difference between repairing
    // the record you came for and renaming every file whose title moved —
    // including the ones another session retitled and has not committed yet.
    const onlyIds = ids ? new Set(ids) : null;
    const moves: Array<{ id: string; from: string; to: string }> = [];
    const skipped: Array<{ id: string; file: string; reason: string }> = [];
    // Every path the workspace already holds, so a rename cannot land on one.
    // Read once and kept current as moves happen, which is what makes two records
    // wanting the same slug a skip rather than a lost file.
    const taken = new Set(
        index.records.map((record) => normalizeRepoPath(record.path || ""))
    );
    for (const entry of staleFilenames(index.records)) {
        const record = entry.record;
        if (wanted && !wanted.has(record.kind)) continue;
        // Silent like the `kinds` filter above, and for the same reason: with a
        // narrow `ids` every other record in the workspace would land in
        // `skipped`, burying the collisions that entry exists to report.
        if (onlyIds && !onlyIds.has(record.id)) continue;
        const from = normalizeRepoPath(record.path);
        const directory = dirname(from);
        const to = `${directory}/${entry.expected}`;
        if (taken.has(to)) {
            skipped.push({ id: record.id, file: entry.current, reason: "name-taken" });
            continue;
        }
        const absoluteFrom = join(workspace.root, from);
        const content = await readFile(absoluteFrom, "utf8");
        const written =
            record.kind === "card" && workspace.config.cards.activityTrail !== false
                ? appendActivityLine(
                      content,
                      activityEntry(actor, `renamed file to ${entry.expected}`, now)
                  )
                : content;
        try {
            await createFileExclusive(join(workspace.root, to), written);
        } catch (error: any) {
            // `taken` was read before the loop, so a name can be claimed
            // underneath us — by another process, or by an earlier move in this
            // very pass. Skipping a collision is the contract whichever way the
            // collision arrives.
            if (!isCreateContention(error)) throw error;
            skipped.push({ id: record.id, file: entry.current, reason: "name-taken" });
            continue;
        }
        await rm(absoluteFrom, { force: true });
        taken.delete(from);
        taken.add(to);
        moves.push({ id: record.id, from: entry.current, to: entry.expected });
    }
    return { moves, skipped };
}

export async function reslugStaleCardFiles(
    workspace,
    { actor = null, now }: any = {}
) {
    // Kept as the name the CLI and the exported surface already use. The rule and
    // the repair are one implementation now — leaving a card-only copy beside it
    // is how the other three kinds came to have no rule at all.
    return reslugStaleRecordFiles(workspace, { actor, now, kinds: ["card"] });
}
