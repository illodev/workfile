import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { readMarkdownTree } from "../../core/paths.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import {
    parseFrontmatter,
    patchFrontmatter,
    requireFrontmatter,
    serializeValue
} from "../../core/frontmatter.js";
import { withFileLock } from "../../core/locks.js";
import { revisionForContent } from "../../core/revision.js";
import { ensureWritable } from "../../core/guards.js";
import { CARD_LIST_KEYS, loadCards, parseCard } from "./cards.js";
import { slugify } from "./slug.js";
import {
    applyCardChanges,
    sanitizeCardChanges,
    scopesOverlap,
    validateCardCandidate
} from "./validation.js";

function nowTimestamp(now) {
    return (now ? new Date(now) : new Date()).toISOString();
}

function today(now) {
    return nowTimestamp(now).slice(0, 10);
}


async function maxSequenceInDirectory(directory, prefix) {
    const files = await readMarkdownTree(directory);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}-(\\d+)`);
    return files.reduce((maximum, file) => {
        const match = basename(file).match(pattern);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
}

export async function nextCardSequence(workspace) {
    const prefix = workspace.config.cards.idPrefix;
    const [live, archive] = await Promise.all([
        maxSequenceInDirectory(workspace.paths.cards, prefix),
        maxSequenceInDirectory(workspace.paths.cardArchive, prefix)
    ]);
    return Math.max(live, archive) + 1;
}

function renderCard(metadata, body = "") {
    const lines = Object.entries(metadata).map(
        ([key, value]) => `${key}: ${serializeValue(key, value, CARD_LIST_KEYS)}`
    );
    return `---\n${lines.join("\n")}\n---\n\n${String(body).trim()}\n`;
}

function locateUniqueCard(cards, id) {
    const matches = cards.filter((candidate) => candidate.id === id);
    if (!matches.length) throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
    if (matches.length > 1) {
        throw new ConflictError(
            "CARD_ID_AMBIGUOUS",
            `Card ID ${id} appears in multiple files.`,
            { files: matches.map((card) => card.file) }
        );
    }
    return matches[0];
}

function pathForCard(workspace, card) {
    return join(
        card.archived ? workspace.paths.cardArchive : workspace.paths.cards,
        card.file
    );
}

function appendNote(content, text) {
    const separator = content.endsWith("\n") ? "" : "\n";
    if (/^## Notes\s*$/m.test(content)) {
        return `${content}${separator}- ${text}\n`;
    }
    return `${content}${separator}\n## Notes\n\n- ${text}\n`;
}

function normalizedSavedCard(file, content, archived) {
    const card = parseCard(file, content, archived);
    return { ...card, revision: revisionForContent(content) };
}

function cardLockPath(workspace, id) {
    return join(workspace.paths.cache, "locks", "cards", `${id}.lock`);
}

/**
 * List-typed keys accept the scalar clients actually send. An HTTP claim or
 * patch has carried `scope: "src/core"` where an array was meant; the written
 * scalar is survivable — the next read re-parses it as a list — but the
 * mutation's own response would hand the UI a string whose `.length` passes
 * every render guard and whose `.join` does not exist.
 */
function normalizeListValues(values) {
    if (!values) return values;
    const normalized = { ...values };
    for (const key of CARD_LIST_KEYS) {
        const value = normalized[key];
        if (value == null || Array.isArray(value)) continue;
        normalized[key] = String(value)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return normalized;
}

async function mutateCard(
    workspace,
    id,
    changes,
    {
        expectedRevision,
        transformContent,
        moveToArchived,
        guard,
        snapshot,
        bodyOnly = false
    }: any = {}
) {
    ensureWritable(workspace);
    changes = normalizeListValues(changes);
    return withFileLock(
        cardLockPath(workspace, id),
        async () => {
            // A caller may supply the directory listing it already has. Only
            // the file being written has to be re-read under the lock — that is
            // what the revision check is for — while the rest of the listing
            // exists to resolve the ID and validate cross-card constraints.
            // Reloading it per card turned a bulk edit of twenty cards into
            // twenty full directory reads.
            const loaded = snapshot || (await loadCards(workspace));
            const current = locateUniqueCard(loaded.cards, id);
            const sourcePath = pathForCard(workspace, current);
            const content = await readFile(sourcePath, "utf8");
            const actualRevision = revisionForContent(content);
            if (expectedRevision && expectedRevision !== actualRevision) {
                throw new ConflictError(
                    "CARD_WRITE_CONFLICT",
                    "The card changed after it was loaded.",
                    // `current` so the caller can show what changed without a
                    // second round trip. Without it the only honest thing a
                    // client could do on a conflict was discard the edit: it
                    // had no way to compare, let alone merge.
                    {
                        id,
                        expectedRevision,
                        actualRevision,
                        current: normalizedSavedCard(
                            current.file,
                            content,
                            current.archived
                        )
                    }
                );
            }
            if (guard) await guard(current, loaded.cards);
            // A body-only write touches no frontmatter field, which the field
            // sanitizer rightly refuses as an empty patch — so say what is
            // actually changing instead of inventing a field to satisfy it.
            const allowed = bodyOnly
                ? {}
                : sanitizeCardChanges(changes);
            const candidate = applyCardChanges(current, allowed);
            validateCardCandidate(workspace, candidate, loaded.cards, id);
            let next = patchFrontmatter(content, allowed, {
                listKeys: CARD_LIST_KEYS
            });
            if (transformContent) next = transformContent(next, current, candidate);
            await writeFileAtomic(sourcePath, next);

            let archived = current.archived;
            let finalPath = sourcePath;
            if (typeof moveToArchived === "boolean" && moveToArchived !== current.archived) {
                const targetDirectory = moveToArchived
                    ? workspace.paths.cardArchive
                    : workspace.paths.cards;
                finalPath = join(targetDirectory, current.file);
                await mkdir(dirname(finalPath), { recursive: true });
                await rename(sourcePath, finalPath);
                archived = moveToArchived;
            }
            const card = normalizedSavedCard(current.file, next, archived);
            return {
                id: card.id,
                file: card.file,
                revision: card.revision,
                card,
                path: finalPath
            };
        },
        { metadata: { module: "cards", recordId: id } }
    );
}

/**
 * Appends one line to the card's `## Activity` section.
 *
 * The ephemeral activity cache answers "right now"; this answers "who moved
 * T-0042 to done, and when" months later, from git alone. `actor` was accepted
 * by `transitionCard` and used only in the `doing` branch — for every other
 * status it was dropped, and `claimed_by` was *cleared* at the same moment, so
 * the one trace of authorship vanished exactly when the work finished.
 *
 * Only protocol milestones, never file edits: five to fifteen lines over a
 * card's whole life, reviewable in a diff. Append-only and chronological, so a
 * merge conflict between two branches resolves by keeping both lines.
 */
export function appendActivityLine(content, entry) {
    const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
    const prefix = content.slice(0, parsed.prefixLength);
    const body = parsed.body.replace(/\s+$/, "");
    const heading = "## Activity";
    const line = `- ${entry}`;
    if (!body.includes(heading)) {
        return `${prefix}${body ? `${body}\n\n` : ""}${heading}\n\n${line}\n`;
    }
    const at = body.indexOf(heading) + heading.length;
    const next = body.indexOf("\n## ", at);
    const end = next === -1 ? body.length : next;
    return `${prefix}${body.slice(0, end).replace(/\s+$/, "")}\n${line}\n${body.slice(end)}\n`.replace(
        /\n{3,}/g,
        "\n\n"
    );
}

export function activityEntry(actor, text, now) {
    const stamp = nowTimestamp(now).slice(0, 16).replace("T", " ");
    return `${stamp}Z ${actor || "unknown"} · ${text}`;
}

/** Whether the durable trail is enabled for this workspace. */
function trailEnabled(workspace) {
    return workspace.config.cards.activityTrail !== false;
}

export async function createCard(workspace, input, { maxRetries = 32, now }: any = {}) {
    ensureWritable(workspace);
    if (!input?.title?.trim()) {
        throw new ValidationError("CARD_TITLE_REQUIRED", "title is required.");
    }
    input = normalizeListValues(input);
    const area = input.area || workspace.config.cards.areas[0];
    const timestamp = nowTimestamp(now);
    const date = timestamp.slice(0, 10);
    const loaded = await loadCards(workspace);
    const base = {
        id: "pending",
        title: input.title.trim(),
        status: input.status || "backlog",
        type: input.type || "task",
        priority: input.priority || "medium",
        area,
        ...(input.parent ? { parent: input.parent } : {}),
        ...(input.depends?.length ? { depends: input.depends } : {}),
        ...(input.milestone ? { milestone: input.milestone } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        ...(input.scope?.length ? { scope: input.scope } : {}),
        ...(input.related?.length ? { related: input.related } : {}),
        ...(input.start ? { start: input.start } : {}),
        ...(input.due ? { due: input.due } : {}),
        ...(input.claimed_by ? { claimed_by: input.claimed_by } : {}),
        ...(input.claimed_at ? { claimed_at: input.claimed_at } : {}),
        created: date,
        updated: date
    };
    validateCardCandidate(workspace, base, loaded.cards, null);

    let sequence = await nextCardSequence(workspace);
    const prefix = workspace.config.cards.idPrefix;
    for (let attempt = 0; attempt < maxRetries; attempt += 1, sequence += 1) {
        const id = `${prefix}-${String(sequence).padStart(4, "0")}`;
        const file = `${id}-${slugify(input.title)}.md`;
        const path = join(workspace.paths.cards, file);
        const reservation = join(workspace.paths.cache, "locks", "ids", `${id}.lock`);
        const metadata = { ...base, id };
        let reserved = false;
        try {
            await createFileExclusive(
                reservation,
                `${JSON.stringify({ id, pid: process.pid, createdAt: timestamp })}\n`
            );
            reserved = true;
            const content = renderCard(metadata, input.body);
            await createFileExclusive(path, content);
            const card = normalizedSavedCard(file, content, false);
            return {
                id: card.id,
                file: card.file,
                revision: card.revision,
                card,
                path
            };
        } catch (error) {
            if (error?.code !== "EEXIST") throw error;
        } finally {
            if (reserved) await rm(reservation, { force: true }).catch(() => undefined);
        }
    }
    throw new ConflictError(
        "CARD_ID_ALLOCATION_FAILED",
        `Unable to allocate a card ID after ${maxRetries} retries.`
    );
}

export async function patchCard(workspace, id, changes, options: any = {}) {
    return mutateCard(workspace, id, changes, options);
}

function claimIsStale(card, leaseHours, now) {
    if (!card.claimed_at) return false;
    const timestamp = Date.parse(card.claimed_at);
    if (!Number.isFinite(timestamp)) return false;
    return now.getTime() - timestamp >= leaseHours * 3_600_000;
}

export async function claimCard(
    workspace,
    id,
    { actor, scope, force = false, reason, expectedRevision, now }: any = {}
) {
    if (!actor || !String(actor).trim()) {
        throw new ValidationError("CARD_CLAIM_ACTOR_REQUIRED", "actor is required.");
    }
    const loaded = await loadCards(workspace);
    const snapshot = locateUniqueCard(loaded.cards, id);
    const instant = now ? new Date(now) : new Date();
    const requestedScope = scope === undefined ? snapshot.scope || [] : scope;
    const warnings = [];
    for (const other of loaded.cards) {
        if (other.id === id || other.status !== "doing" || !other.claimed_by) continue;
        const overlaps = scopesOverlap(requestedScope, other.scope || []);
        if (overlaps.length) {
            warnings.push({
                code: "CARD_SCOPE_OVERLAP",
                cardId: other.id,
                claimedBy: other.claimed_by,
                paths: overlaps
            });
        }
    }
    const timestamp = instant.toISOString();
    const result = await mutateCard(
        workspace,
        id,
        {
            status: "doing",
            claimed_by: String(actor).trim(),
            claimed_at: timestamp,
            scope: requestedScope
        },
        {
            expectedRevision,
            guard: (current) => {
                const claimedByOther =
                    current.claimed_by && current.claimed_by !== actor;
                const stale = claimIsStale(
                    current,
                    workspace.config.cards.claimLeaseHours,
                    instant
                );
                if (claimedByOther && !stale && !force) {
                    throw new ConflictError(
                        "CARD_ALREADY_CLAIMED",
                        `${id} is claimed by ${current.claimed_by}.`,
                        {
                            claimedBy: current.claimed_by,
                            claimedAt: current.claimed_at
                        }
                    );
                }
                if (
                    claimedByOther &&
                    (stale || force) &&
                    !String(reason || "").trim()
                ) {
                    throw new ValidationError(
                        "CARD_CLAIM_BREAK_REASON_REQUIRED",
                        "A reason is required to replace another actor's claim."
                    );
                }
            },
            transformContent: (content, current) => {
                let next =
                    current.claimed_by && current.claimed_by !== actor && reason
                        ? appendNote(
                              content,
                              `${timestamp.slice(0, 10)} — ${actor} replaced ${current.claimed_by}'s claim: ${String(reason).trim()}`
                          )
                        : content;
                if (trailEnabled(workspace)) {
                    next = appendActivityLine(
                        next,
                        activityEntry(actor, "claimed", now)
                    );
                }
                return next;
            }
        }
    );
    return { ...result, warnings };
}

export async function releaseCard(
    workspace,
    id,
    { actor, status, force = false, expectedRevision }: any = {}
) {
    const loaded = await loadCards(workspace);
    const snapshot = locateUniqueCard(loaded.cards, id);
    if (status === "doing") {
        throw new ValidationError(
            "CARD_RELEASE_STATUS_INVALID",
            "A released card cannot remain doing."
        );
    }
    // Without an explicit target the card keeps the status it already has:
    // releasing the claim on a card just transitioned to done must not
    // silently demote it. Only `doing` cannot survive a release — active
    // work without a claimant is a contradiction — so it becomes `next`.
    const resolved =
        status || (snapshot.status === "doing" ? "next" : snapshot.status);
    return mutateCard(
        workspace,
        id,
        { status: resolved, claimed_by: null, claimed_at: null },
        {
            expectedRevision,
            transformContent: trailEnabled(workspace)
                ? (content, current) =>
                      appendActivityLine(
                          content,
                          activityEntry(
                              actor || current.claimed_by,
                              "released",
                              undefined
                          )
                      )
                : undefined,
            guard: (current) => {
                if (
                    current.claimed_by &&
                    actor &&
                    current.claimed_by !== actor &&
                    !force
                ) {
                    throw new ConflictError(
                        "CARD_CLAIM_OWNER_MISMATCH",
                        `${id} is claimed by ${current.claimed_by}.`
                    );
                }
            }
        }
    );
}

export async function transitionCard(
    workspace,
    id,
    status,
    { actor, scope, force = false, expectedRevision, now }: any = {}
) {
    if (status === "doing") {
        return claimCard(workspace, id, {
            actor,
            scope,
            expectedRevision,
            now
        });
    }
    const loaded = await loadCards(workspace);
    const snapshot = locateUniqueCard(loaded.cards, id);
    const moveToArchived = snapshot.archived && !["done", "discarded"].includes(status)
        ? false
        : undefined;
    return mutateCard(
        workspace,
        id,
        {
            status,
            claimed_by: null,
            claimed_at: null
        },
        {
            expectedRevision,
            moveToArchived,
            transformContent: trailEnabled(workspace)
                ? (content) =>
                      appendActivityLine(
                          content,
                          activityEntry(
                              actor,
                              `${snapshot.status} → ${status}`,
                              now
                          )
                      )
                : undefined,
            // The same ownership guard `releaseCard` has always had. Without it
            // transitioning was the way around it: any actor could move a card
            // claimed by someone else and silently drop their claim, no reason
            // required — which made the guard on release decorative.
            guard: (current) => {
                if (
                    current.claimed_by &&
                    actor &&
                    current.claimed_by !== actor &&
                    !force
                ) {
                    throw new ConflictError(
                        "CARD_CLAIM_OWNER_MISMATCH",
                        `${id} is claimed by ${current.claimed_by}. Pass force with a reason to take it over.`,
                        { id, claimedBy: current.claimed_by }
                    );
                }
            }
        }
    );
}

/**
 * Replaces a card's Markdown body.
 *
 * Deliberately separate from `patchCard`, which is a frontmatter diff: the two
 * have different conflict semantics, and mixing them would put a whole-document
 * replacement behind an interface that reads like a field update. Until this
 * existed, no surface — CLI, HTTP or MCP — could write a card body at all, so
 * an agent recording a result had to reach past the protocol with a raw file
 * write, skipping the lock, the revision check and validation.
 */
export async function patchCardBody(workspace, id, { body, expectedRevision }: any = {}) {
    if (typeof body !== "string") {
        throw new ValidationError(
            "CARD_BODY_REQUIRED",
            "body must be a string."
        );
    }
    return mutateCard(workspace, id, {}, {
        expectedRevision,
        bodyOnly: true,
        transformContent: (content) => {
            const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
            const next = String(body).replace(/\s+$/, "");
            return `${content.slice(0, parsed.prefixLength)}${next ? `${next}\n` : ""}`;
        }
    });
}

/**
 * Appends a line under a heading, creating the heading if absent.
 *
 * The cheap counterpart to replacing the body: an agent noting progress does
 * not need to send the whole document back, and two agents appending under the
 * same heading produce a merge conflict that resolves by keeping both lines.
 */
export async function appendCardNote(
    workspace,
    id,
    { text, actor, section = "Notes", expectedRevision, now }: any = {}
) {
    const line = String(text || "").trim();
    if (!line) {
        throw new ValidationError("CARD_NOTE_REQUIRED", "text must not be empty.");
    }
    const stamp = nowTimestamp(now).slice(0, 16).replace("T", " ");
    const entry = `- ${stamp}Z${actor ? ` ${actor}` : ""} — ${line}`;
    return mutateCard(workspace, id, {}, {
        expectedRevision,
        bodyOnly: true,
        transformContent: (content) => {
            const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
            const prefix = content.slice(0, parsed.prefixLength);
            const heading = `## ${section}`;
            const existing = parsed.body.replace(/\s+$/, "");
            if (!existing.includes(heading)) {
                return `${prefix}${existing ? `${existing}\n\n` : ""}${heading}\n\n${entry}\n`;
            }
            const at = existing.indexOf(heading) + heading.length;
            const nextHeading = existing.indexOf("\n## ", at);
            const end = nextHeading === -1 ? existing.length : nextHeading;
            const before = existing.slice(0, end).replace(/\s+$/, "");
            return `${prefix}${before}\n${entry}\n${existing.slice(end)}\n`.replace(
                /\n{3,}/g,
                "\n\n"
            );
        }
    });
}

export async function archiveCard(workspace, id, { expectedRevision }: any = {}) {
    const loaded = await loadCards(workspace);
    const snapshot = locateUniqueCard(loaded.cards, id);
    if (snapshot.archived) {
        return {
            id: snapshot.id,
            file: snapshot.file,
            revision: snapshot.revision,
            card: snapshot,
            path: pathForCard(workspace, snapshot)
        };
    }
    if (!["done", "discarded"].includes(snapshot.status)) {
        throw new ValidationError(
            "CARD_ARCHIVE_STATUS_INVALID",
            "Only done or discarded cards can be archived."
        );
    }
    return mutateCard(
        workspace,
        id,
        { status: snapshot.status },
        { expectedRevision, moveToArchived: true }
    );
}

export async function reopenCard(
    workspace,
    id,
    { status = "backlog", expectedRevision }: any = {}
) {
    if (["done", "discarded"].includes(status)) {
        throw new ValidationError(
            "CARD_REOPEN_STATUS_INVALID",
            "A reopened card must use an open status."
        );
    }
    return transitionCard(workspace, id, status, { expectedRevision });
}

export async function bulkPatchCards(
    workspace,
    ids,
    changes,
    { expectedRevisions = {} }: any = {}
) {
    const unique = [...new Set<string>(ids || [])];
    if (!unique.length) {
        throw new ValidationError("CARD_IDS_REQUIRED", "ids are required.");
    }
    if (unique.length > 5000) {
        throw new ValidationError(
            "CARD_BULK_LIMIT",
            "A maximum of 5000 cards can be changed in one operation."
        );
    }
    // One listing for the whole operation, kept current as cards are written so
    // later items validate against the earlier ones.
    const snapshot = await loadCards(workspace);
    const results = [];
    const records = [];
    for (const id of unique) {
        try {
            const result = await patchCard(workspace, id, changes, {
                expectedRevision: expectedRevisions[id],
                snapshot
            });
            const index = snapshot.cards.findIndex((card) => card.id === id);
            if (index !== -1) snapshot.cards[index] = result.card;
            records.push(result.card);
            results.push({ id, ok: true, revision: result.revision });
        } catch (error: any) {
            // Reporting per id matters: the old shape was `{ok: true, updated}`,
            // so a caller whose fourteenth card failed could not find out which.
            results.push({
                id,
                ok: false,
                error: { code: error?.code || "CARD_PATCH_FAILED", message: error?.message }
            });
        }
    }
    return {
        updated: records.length,
        failed: results.length - records.length,
        results,
        records
    };
}
