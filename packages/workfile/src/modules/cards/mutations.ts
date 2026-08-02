import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { reserveRecordId } from "../../core/record-ids.js";
import { applyAcceptance, parseAcceptance } from "./acceptance.js";
import { claimBoardChanged, updateClaimBoard } from "./claims.js";
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
    axisNames,
    declaredAxes,
    expandAxes,
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
    return withFileLock(
        cardLockPath(workspace, id),
        async () => {
            // A caller may supply the directory listing it already has. It
            // resolves the ID and validates cross-card constraints, and nothing
            // else: reloading it per card turned a bulk edit of twenty cards
            // into twenty full directory reads.
            //
            // What it must never be is the version of *this* card the guards
            // see. That listing was read before the lock, so between the read
            // and the lock another writer can claim, release or close the card,
            // and a guard asking "is it already claimed?" would answer from
            // before that happened. It did: two concurrent claims both
            // succeeded, twelve times out of twelve, and the loser held a card
            // the file no longer said was theirs. `expectedRevision` catches
            // the same race, but only a caller holding a revision passes it,
            // and neither the CLI nor the MCP tools do.
            const loaded = snapshot || (await loadCards(workspace));
            const located = locateUniqueCard(loaded.cards, id);
            const sourcePath = pathForCard(workspace, located);
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
                            located.file,
                            content,
                            located.archived
                        )
                    }
                );
            }
            // The card as it is on disk right now, under the lock. Every guard
            // and every validation below reads this, never the listing.
            const current = normalizedSavedCard(
                located.file,
                content,
                located.archived
            );
            if (guard) await guard(current, loaded.cards);
            // A body-only write touches no frontmatter field, which the field
            // sanitizer rightly refuses as an empty patch — so say what is
            // actually changing instead of inventing a field to satisfy it.
            // Changes may be a function of the locked state for the same
            // reason the guards are: `releaseCard` decides what status a
            // released card keeps by looking at the one it has, and deciding
            // that from the pre-lock listing writes the status the card had
            // before somebody else moved it.
            const requested =
                typeof changes === "function" ? changes(current) : changes;
            const allowed = bodyOnly
                ? {}
                : sanitizeCardChanges(
                      expandAxes(workspace, normalizeListValues(requested)),
                      axisNames(workspace)
                  );
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
            // The board the `PreToolUse` scope guard reads. Written here
            // because a cache of claims belongs to the thing that changes
            // claims: session start was the only writer, so a claim taken
            // mid-session was invisible to the guard until the next session —
            // including a claim taken by another agent in the same tree, which
            // is the only case the guard exists for.
            if (claimBoardChanged(current, card)) {
                await updateClaimBoard(workspace, card);
            }
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

/**
 * `done` means verified where the code actually ran.
 *
 * This lived inside `transitionCard`, which is one of four ways to set a
 * status. `card patch --json-input '{"status":"done"}'`, the HTTP PATCH routes
 * and `project_card_patch` all walked past it, and so did
 * `card release --status done` — so the rule the README leads with was enforced
 * on the path a human takes and not on any of the paths an agent takes. It is a
 * function now because a guarantee with four entrances needs one gate, not the
 * discipline to remember it four times.
 */
function assertAcceptanceMet(id, current, status, force) {
    if (status !== "done" || force) return;
    const pending = parseAcceptance(current.body).unchecked;
    if (!pending.length) return;
    throw new ConflictError(
        "CARD_ACCEPTANCE_UNMET",
        `${id} has ${pending.length} unproven acceptance criteria: ` +
            `${pending
                .map((item) => `#${item.index} ${item.text}`)
                .join("; ")}. Check them, or pass force.`,
        {
            id,
            unchecked: pending.map((item) => ({
                index: item.index,
                text: item.text
            }))
        }
    );
}

export async function createCard(workspace, input, { maxRetries = 32, now }: any = {}) {
    ensureWritable(workspace);
    if (!input?.title?.trim()) {
        throw new ValidationError("CARD_TITLE_REQUIRED", "title is required.");
    }
    input = expandAxes(workspace, normalizeListValues(input));
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
        // Next to `area`, because that is what they are: the project's own
        // classification alongside the schema's. Frontmatter order is the order
        // a reader meets the fields in, and an axis read six lines below `due`
        // reads like an afterthought rather than a peer.
        ...Object.fromEntries(
            declaredAxes(workspace)
                .filter(([axis]) => input[axis])
                .map(([axis]) => [axis, input[axis]])
        ),
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

    return reserveRecordId(
        {
            prefix: workspace.config.cards.idPrefix,
            // Both, always. A card living only in the archive still owns its id.
            directories: [workspace.paths.cards, workspace.paths.cardArchive],
            lockDirectory: join(workspace.paths.cache, "locks", "ids"),
            maxRetries,
            code: "CARD_ID_ALLOCATION_FAILED"
        },
        async (id) => {
            const file = `${id}-${slugify(input.title)}.md`;
            const path = join(workspace.paths.cards, file);
            const content = renderCard({ ...base, id }, input.body);
            await createFileExclusive(path, content);
            const card = normalizedSavedCard(file, content, false);
            return {
                id: card.id,
                file: card.file,
                revision: card.revision,
                card,
                path
            };
        }
    );
}

/**
 * A field-level write, including a status change.
 *
 * A status change here is the same protocol event it is through `transition`:
 * it passes the same gate and it leaves the same trail line. It did neither.
 * Reproduced before the fix: a card with one unchecked acceptance criterion was
 * refused by `card transition done` and accepted by `card patch` with
 * `{"status":"done"}` — 200 on both HTTP routes and through MCP as well —
 * leaving a file that read `status: done` whose last trail entry said
 * "claimed". Four surfaces, one of them the only one a human uses, and the
 * three an agent uses were the leaky ones.
 */
export async function patchCard(
    workspace,
    id,
    changes,
    { actor, force = false, now, guard, transformContent, ...options }: any = {}
) {
    const wanted = changes?.status;
    return mutateCard(workspace, id, changes, {
        ...options,
        guard: async (current, cards) => {
            if (guard) await guard(current, cards);
            if (wanted && wanted !== current.status) {
                assertAcceptanceMet(id, current, wanted, force);
            }
        },
        transformContent: (content, current, candidate) => {
            const next = transformContent
                ? transformContent(content, current, candidate)
                : content;
            if (!trailEnabled(workspace)) return next;
            if (!wanted || wanted === current.status) return next;
            return appendActivityLine(
                next,
                activityEntry(actor, `${current.status} → ${wanted}`, now)
            );
        }
    });
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
            // The listing is already in hand; `mutateCard` re-reads the whole
            // directory when it is not passed one, which doubled every claim.
            snapshot: loaded,
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
    // Existence first, so a missing card reports CARD_NOT_FOUND instead of a
    // complaint about a status it does not have.
    locateUniqueCard(loaded.cards, id);
    if (status === "doing") {
        throw new ValidationError(
            "CARD_RELEASE_STATUS_INVALID",
            "A released card cannot remain doing."
        );
    }
    return mutateCard(
        workspace,
        id,
        // Without an explicit target the card keeps the status it already has:
        // releasing the claim on a card just transitioned to done must not
        // silently demote it. Only `doing` cannot survive a release — active
        // work without a claimant is a contradiction — so it becomes `next`.
        // Read under the lock, so "the status it already has" is the one on
        // disk and not the one the listing remembered.
        (current) => ({
            status:
                status || (current.status === "doing" ? "next" : current.status),
            claimed_by: null,
            claimed_at: null
        }),
        {
            expectedRevision,
            snapshot: loaded,
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
                // `release --status done` is a way to reach done, so it is a
                // way to reach the gate. Only when it actually moves the card
                // there: a card that is already done stays releasable, or a
                // forced close would leave its own claim stuck.
                if (status && status !== current.status) {
                    assertAcceptanceMet(id, current, status, force);
                }
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
            snapshot: loaded,
            transformContent: trailEnabled(workspace)
                ? (content, current) =>
                      appendActivityLine(
                          content,
                          activityEntry(
                              actor,
                              `${current.status} → ${status}`,
                              now
                          )
                      )
                : undefined,
            // The same ownership guard `releaseCard` has always had. Without it
            // transitioning was the way around it: any actor could move a card
            // claimed by someone else and silently drop their claim, no reason
            // required — which made the guard on release decorative.
            guard: (current) => {
                // `--force` is the documented way past it, for the cases the
                // criteria did not anticipate.
                assertAcceptanceMet(id, current, status, force);
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
 * Checks or unchecks acceptance criteria by index.
 *
 * The narrow write that makes "`done` requires evidence" mean something. An
 * agent that has just proven one criterion says so without sending the whole
 * document back — which matters because a full-body write is how an agent
 * destroys the human context around it.
 *
 * Runs through the same lock and revision check as every other mutation, and
 * that is what makes positional indices safe: a concurrent reorder changes the
 * revision, so a stale address is refused rather than applied to the wrong line.
 */
export async function setCardAcceptance(
    workspace,
    id,
    { check = [], uncheck = [], expectedRevision }: any = {}
) {
    if (!check.length && !uncheck.length) {
        throw new ValidationError(
            "CARD_ACCEPTANCE_EMPTY",
            "Pass at least one criterion to check or uncheck."
        );
    }
    let changed = [];
    const result = await mutateCard(workspace, id, {}, {
        expectedRevision,
        bodyOnly: true,
        transformContent: (content) => {
            const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
            const body = content.slice(parsed.prefixLength);
            let applied;
            try {
                applied = applyAcceptance(body, { check, uncheck });
            } catch (error: any) {
                if (error?.code === "CARD_ACCEPTANCE_INDEX_UNKNOWN") {
                    throw new ValidationError(error.code, error.message, {
                        index: error.index,
                        available: error.available
                    });
                }
                throw error;
            }
            changed = applied.changed;
            return `${content.slice(0, parsed.prefixLength)}${applied.body}`;
        }
    });
    return {
        ...result,
        changed,
        acceptance: parseAcceptance(result.card?.body || "")
    };
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
    // Checked again under the lock below. This one only spares the caller a
    // lock acquisition for the common, uncontended refusal.
    if (!["done", "discarded"].includes(snapshot.status)) {
        throw new ValidationError(
            "CARD_ARCHIVE_STATUS_INVALID",
            "Only done or discarded cards can be archived."
        );
    }
    return mutateCard(
        workspace,
        id,
        (current) => ({ status: current.status }),
        {
            expectedRevision,
            moveToArchived: true,
            snapshot: loaded,
            // A card that stopped being terminal between the listing and the
            // lock must not be filed away as though it were.
            guard: (current) => {
                if (!["done", "discarded"].includes(current.status)) {
                    throw new ValidationError(
                        "CARD_ARCHIVE_STATUS_INVALID",
                        "Only done or discarded cards can be archived."
                    );
                }
            }
        }
    );
}

/**
 * Reopening is a transition, and a transition needs to know who is asking.
 *
 * This dropped the actor on the floor. `transitionCard` requires one to reach
 * `doing`, because arriving there takes a claim — so `card reopen ID --status
 * doing` answered `CARD_CLAIM_ACTOR_REQUIRED: actor is required` on a command
 * with no way to supply one, and reopening straight into work was impossible
 * from every surface at once: the CLI, `project_card_reopen`, and the HTTP
 * reopen route all called through here.
 *
 * A wrapper that forwards some of its target's options and not others is the
 * shape to watch: the caller sees a complete command, and the option that
 * never arrives is invisible until the one status that needs it is asked for.
 */
export async function reopenCard(
    workspace,
    id,
    { status = "backlog", actor, expectedRevision }: any = {}
) {
    if (["done", "discarded"].includes(status)) {
        throw new ValidationError(
            "CARD_REOPEN_STATUS_INVALID",
            "A reopened card must use an open status."
        );
    }
    return transitionCard(workspace, id, status, { actor, expectedRevision });
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
