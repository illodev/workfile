import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createFileExclusive, writeFileAtomic } from "../../core/filesystem.js";
import { reserveRecordId } from "../../core/record-ids.js";
import {
    applyAcceptance,
    criterionOwners,
    parseAcceptance,
    unreadableCriteria
} from "./acceptance.js";
import { claimBoardChanged, updateClaimBoard } from "./claims.js";
import { criteriaDigest, resolveVerification } from "./verification.js";
import { headCommit } from "./git.js";
import { readMarkdownTree } from "../../core/paths.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError
} from "../../core/errors.js";
import {
    parseFrontmatter,
    patchFrontmatter,
    renderFrontmatterEntry,
    requireFrontmatter
} from "../../core/frontmatter.js";
import { withFileLock } from "../../core/locks.js";
import { revisionForContent } from "../../core/revision.js";
import { ensureWritable } from "../../core/guards.js";
import { CARD_LIST_KEYS, loadCards, parseCard } from "./cards.js";
import {
    TRAIL_ENTRY,
    appendUnderHeading,
    isProtocolSection,
    misplacedTrailEntries,
    scanBody,
    splitSections,
    trailStamp,
    withFrontmatter
} from "./body.js";
import { slugify } from "./slug.js";
import {
    applyCardChanges,
    axisNames,
    declaredAxes,
    expandAxes,
    sanitizeCardChanges,
    scopesOverlap,
    validateCardCandidate,
    verificationRefusal
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
    const lines = Object.entries(metadata).flatMap(([key, value]) =>
        renderFrontmatterEntry(key, value, { listKeys: CARD_LIST_KEYS })
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

/**
 * The reason one actor gave for taking another’s claim, under `## Notes`.
 *
 * Went through the same helper as everything else once it existed: this used
 * to append at the end of the *file* whenever a `## Notes` heading existed
 * anywhere, so on a card whose trail came after its notes the reason landed
 * inside the trail.
 */
function appendNote(content, text) {
    const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
    return withFrontmatter(
        content.slice(0, parsed.prefixLength),
        appendUnderHeading(parsed.body, "## Notes", `- ${text}`)
    );
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

/**
 * The `verified` block, written by the one function every door goes through.
 *
 * `mutateCard` already knows the card as it is on disk and the card it is about
 * to become, so it can decide for itself whether this write is a move into
 * `done` or out of it. That is the whole "one gate, four doors" answer again:
 * the three status writers contribute what the acceptance gate waived and what
 * the caller asked for, and nothing else — `claimCard`, `archiveCard`,
 * `patchCardBody`, `setCardAcceptance`, `appendCardNote`, `bulkPatchCards` and
 * `healMisplacedTrailEntries` all reach the correct behaviour for free.
 *
 * A close on a card that is already `done` writes nothing, which is the same
 * rule `appendMilestone` follows: a command that moved nothing records nothing.
 * It also keeps a re-run of `transition ID done` from quietly replacing a `ci`
 * verification with a `local` one.
 *
 * **Ordering is the proof the digest survives the write that creates it.** Every
 * body write happens first — the trail entry `transformContent` appended, then
 * the optional evidence note — and only then is the digest taken, from the body
 * that is about to be on disk. The one write that follows is
 * `patchFrontmatter`, which copies the body byte for byte and splices its edits
 * bottom-up against the original line numbers, so it can reach neither the
 * criteria region nor the `verify` entry. Proven by a test rather than by this
 * comment: see `test/verification.test.ts`.
 */
function applyVerification(content, id, current, candidate, verification) {
    const closing = candidate.status === "done" && current.status !== "done";
    const intent = resolveVerification({
        id,
        closing,
        // Read through a callback because the guard that fills it runs after
        // the door built this object, under the lock, on the card as it is.
        waived: verification?.waived?.() ?? null,
        method: verification?.method,
        run: verification?.run,
        evidence: verification?.evidence,
        actor: verification?.actor,
        commit: verification?.commit ?? null,
        at: nowTimestamp(verification?.now)
    });
    if (!intent) {
        // The block is state, not history. A card sitting in `review` with
        // `verified.at` still on it asserts a verification that no longer
        // holds, and the trail already records that the card was closed once
        // and by whom.
        const leaving = current.status === "done" && candidate.status !== "done";
        return leaving && current.verified
            ? patchFrontmatter(
                  content,
                  { verified: null },
                  { listKeys: CARD_LIST_KEYS, touchUpdated: false }
              )
            : content;
    }
    const staged = intent.note ? appendNote(content, intent.note) : content;
    const parsed = requireFrontmatter(staged, { listKeys: CARD_LIST_KEYS });
    return patchFrontmatter(
        staged,
        {
            verified: {
                ...intent.fields,
                digest: criteriaDigest({
                    // The same reading `diagnoseCards` takes off a loaded card,
                    // which is what makes the two comparable at all.
                    body: parsed.body.trim(),
                    verify: parsed.metadata.verify
                })
            }
        },
        { listKeys: CARD_LIST_KEYS, touchUpdated: false }
    );
}

/**
 * HEAD, resolved before the card lock is taken.
 *
 * `mutateCard`'s whole body is the lock callback, so probing git from inside it
 * would hold a card's write lock across a subprocess — and `bulkPatchCards`
 * would do that once per card, serially, for up to five thousand of them. The
 * doors know before the lock whether the write they are about to make could
 * close the card, which is enough to hoist the probe out of it. Over-resolving
 * for a card that turns out to be closed already costs one process and nothing
 * else.
 *
 * `supplied` is how a caller that has already answered passes it on.
 * `bulkPatchCards` resolves HEAD once for the whole operation, which is also
 * the honest reading of what happened: one command closed those cards, at one
 * commit. It is deliberately not cached any wider than that — a server that
 * closes two cards ten minutes apart must not write the first one's commit onto
 * the second.
 */
async function commitForClose(workspace, wanted, supplied) {
    if (supplied !== undefined) return supplied;
    if (wanted !== "done") return null;
    return headCommit(workspace.root);
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
        bodyOnly = false,
        verification
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
            // Last, because the digest has to be taken from the body that will
            // be on disk — see `applyVerification`. Still before the write, so
            // every refusal it raises leaves the file exactly as it was.
            next = applyVerification(next, id, current, candidate, verification);
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
    return withFrontmatter(
        content.slice(0, parsed.prefixLength),
        appendUnderHeading(parsed.body, "## Activity", `- ${entry}`)
    );
}

/**
 * Moves stray trail entries back into `## Activity`, where a reader looks.
 *
 * A one-off repair for what the positional heading search wrote before the
 * scan replaced it, in the shape of the healers `doctor --fix` already runs.
 * It is not reversible by any other command: the entries are prose now, so
 * `card write` can delete them but cannot put them somewhere the protocol
 * owns — which is the correct asymmetry, and the reason this exists.
 *
 * Entries are merged in timestamp order, because a card can hold both a stray
 * trail and a real one and chronology is the only thing the trail promises.
 */
export async function healMisplacedTrailEntries(
    workspace,
    { actor = null, now, ids = null }: any = {}
) {
    ensureWritable(workspace);
    const loaded = await loadCards(workspace);
    // Same narrowing as the two repairs in `health/renumber.ts`, so that one
    // `--only` means one scope across the whole of `doctor --fix`. Scoping the
    // rename alone would be worse than not scoping at all: the flag would
    // promise a boundary that two of the three repairs ignore.
    const onlyIds = ids ? new Set(ids) : null;
    const moved: Array<{ id: string; entries: number }> = [];
    for (const card of loaded.cards) {
        if (onlyIds && !onlyIds.has(card.id)) continue;
        const stray = misplacedTrailEntries(card.body);
        if (!stray.length) continue;
        await mutateCard(workspace, card.id, {}, {
            bodyOnly: true,
            transformContent: (content) => {
                const parsed = requireFrontmatter(content, {
                    listKeys: CARD_LIST_KEYS
                });
                const lifted: string[] = [];
                const kept: string[] = [];
                for (const { line, heading, fenced } of scanBody(parsed.body)) {
                    if (!fenced && heading !== "## Activity" && TRAIL_ENTRY.test(line)) {
                        lifted.push(line);
                        continue;
                    }
                    kept.push(line);
                }
                const sections = splitSections(kept.join("\n"));
                const at = sections.findIndex(
                    (section) => section.heading === "## Activity"
                );
                const under =
                    at === -1 ? [] : sections[at].text.split("\n").slice(1);
                const entries = [
                    ...under.filter((line) => TRAIL_ENTRY.test(line)),
                    ...lifted
                ].sort((a, b) => trailStamp(a).localeCompare(trailStamp(b)));
                // The repair is itself a protocol event, and it goes last
                // because it happened now. Same rule `reslugStaleCardFiles`
                // follows when it renames a file underneath a card.
                if (trailEnabled(workspace)) {
                    entries.push(
                        `- ${activityEntry(
                            actor,
                            `moved ${stray.length} trail ${
                                stray.length === 1 ? "entry" : "entries"
                            } into the trail`,
                            now
                        )}`
                    );
                }
                const trail = ["## Activity", "", ...entries].join("\n");
                const written = sections
                    .map((section, index) => (index === at ? trail : section.text))
                    .filter(Boolean);
                if (at === -1) written.push(trail);
                return withFrontmatter(
                    content.slice(0, parsed.prefixLength),
                    written.join("\n\n")
                );
            }
        });
        moved.push({ id: card.id, entries: stray.length });
    }
    return { moved };
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
 * Appends a protocol milestone, unless the command that produced it moved
 * nothing.
 *
 * `patchCard` declined to record a status change that was not a change. The
 * other three writers did not, so `transition ID review` on a card already in
 * `review` wrote `review → review`, claiming a card you already hold wrote a
 * second `claimed`, and releasing a card nobody holds wrote `released` again.
 * On a scratch card that is eight lines for three events — and the sequence
 * that produces the worst of it, a claim followed by a redundant
 * `transition doing`, is what an agent following the start-work workflow to
 * the letter does.
 *
 * The trail is five to fifteen lines over a card's whole life, read from a
 * diff months later. A line saying nothing happened does not merely pad it: it
 * takes away the reader's ability to tell a real move from a repeated command,
 * which is the only thing the trail is for.
 *
 * The decision to skip lives here rather than at each writer, for the reason
 * `assertAcceptanceMet` does — this module has already shipped a rule enforced
 * at one of four entrances. What each writer still supplies is what "nothing
 * happened" means for it, because that genuinely differs and cannot be
 * inferred: a redundant claim rewrites `claimed_at`, so the candidate differs
 * from the current card even though no protocol event occurred.
 */
function appendMilestone(workspace, content, { actor, text, redundant, now }) {
    if (!trailEnabled(workspace) || redundant) return content;
    return appendActivityLine(content, activityEntry(actor, text, now));
}

/**
 * The status a release settles on. Only `doing` cannot survive one — active
 * work without a claimant is a contradiction — so everything else keeps the
 * status it had. Shared with the trail so both answer from the same rule:
 * releasing an unclaimed `doing` card still moves it, and that is a milestone
 * even though no claim was dropped.
 */
function releasedStatus(current, status) {
    return status || (current.status === "doing" ? "next" : current.status);
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
 *
 * Returns what `force` waived, as a phrase for the trail, or `null` when the
 * card passed on its own. `force` used to return early from the first line, so
 * the gate could not tell the caller *what* it had let through — and neither
 * could the record. A `force` that waives nothing returns `null` like any other
 * clean pass: the marker has to mean a gate was actually skipped, or it becomes
 * a line that says nothing, which is what `appendMilestone` exists to prevent.
 */
function assertAcceptanceMet(id, current, status, force) {
    if (status !== "done") return null;
    const reading = parseAcceptance(current.body);
    const pending = reading.unchecked;
    if (pending.length) {
        if (force) {
            return `${pending.length} unproven ${
                pending.length === 1 ? "criterion" : "criteria"
            }`;
        }
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
    // A card with no region the reader recognises used to arrive here as a card
    // with nothing to prove, and closed. That is how T-0026 through T-0029 in
    // this repository reached `done` with four unchecked criteria between them,
    // under `## Acceptance`, and how the board in DOC-0005 closed a card the
    // gate never saw. The distinction the gate needs is between a card that
    // proves nothing because there is nothing to prove and a card whose
    // criteria it could not read.
    const unreadable = unreadableCriteria(reading);
    if (!unreadable.length) return null;
    if (force) {
        return `${unreadable.length} unreadable checklist ${
            unreadable.length === 1 ? "item" : "items"
        }`;
    }
    throw new ConflictError(
        "CARD_ACCEPTANCE_UNREADABLE",
        `${id} has ${unreadable.length} unchecked checklist ` +
            `${unreadable.length === 1 ? "item" : "items"} under no heading ` +
            `this gate recognises: ${unreadable
                .map((item) => item.text)
                .join("; ")}. Put them under \`## Acceptance criteria\` so they ` +
            `can be checked, or pass force if they are not criteria.`,
        {
            id,
            unreadable: unreadable.map((item) => ({ text: item.text }))
        }
    );
}

/**
 * `done` is proved the way the project says its work is proved.
 *
 * The sibling of `assertAcceptanceMet`, answering what that one cannot. A
 * checked box says somebody asserted the criterion; the method says what stood
 * behind the assertion, and until a project can state which methods it accepts,
 * "verified in an environment where it runs" is a convention every new agent
 * has to be told rather than a rule the protocol holds.
 *
 * Two exemptions, and both are the same argument. A project that declares
 * nothing has no opinion, so this returns `null` for every card — byte for byte
 * the behaviour of every workspace written before `cards.verification.methods`
 * existed. And a close that already waived a gate records `forced`, which no
 * policy can name and none is asked about: `--force` has answered for that
 * close, on the trail, with a reason.
 *
 * What is deliberately *not* an exemption is a caller who names no method. A
 * bare close resolves to `local`, and `local` is judged like any other —
 * otherwise `{ core: ["ci"] }` would be escapable by typing less, which is the
 * opposite of a gate. It is worth stating because the permissive reading was
 * available and reads as harmless.
 *
 * `area` is passed rather than read off `current` because a patch can move a
 * card and close it in one write. The area the card *lands in* is the one that
 * answers: it is where the `verified` block will sit and where anyone auditing
 * the close will look for the rule it was held to.
 *
 * Returns what `force` waived, as a phrase for the trail, or `null` on a clean
 * pass — the same contract the other two gates keep, so all three compose into
 * one `gates` array and one demanded reason. The phrase names the area rather
 * than the method because the method is about to be recorded as `forced`
 * anyway: what the reader of a trail line needs is which rule was set aside.
 */
function assertVerificationAccepted(
    workspace,
    id,
    current,
    area,
    status,
    method,
    force
) {
    if (status !== "done" || current.status === "done") return null;
    const accepted = verificationRefusal(workspace, area, method || "local");
    if (!accepted) return null;
    if (force) return `${area}'s verification policy`;
    throw new ConflictError(
        "CARD_VERIFICATION_METHOD_REFUSED",
        `${id} would be verified by ${method || "local"}, and ${area} accepts ` +
            `${accepted.join(", ")}. Prove it that way, or force the close ` +
            `with a reason and no method — the record then says forced.`,
        { id, area, method: method || "local", accepted }
    );
}

/**
 * You do not act on a card another actor is holding.
 *
 * `transitionCard` and `releaseCard` each carried their own copy of this and
 * `patchCard` carried none, so writing the frontmatter directly walked around
 * both of them. A patch that cleared `claimed_by` alongside a status change
 * dropped another actor's claim with no refusal, no force and no reason, and
 * one that simply wrote a different name took the card over outright — the
 * card's own trail still naming the actor who no longer held it.
 *
 * That is the guard that keeps two agents in one checkout out of each other's
 * way, and it was enforced on two doors of three. Third time this module has
 * had a rule at some of its entrances, after `assertAcceptanceMet` and the
 * activity trail.
 *
 * `claimCard` keeps its own, richer rule rather than calling this: taking a
 * claim over is the job it exists for, so it also weighs staleness and demands
 * a reason it writes into the card. This is the floor the other three share.
 */
function assertClaimOwnership(id, current, actor, force) {
    if (!current.claimed_by || !actor || current.claimed_by === actor) {
        return null;
    }
    if (force) return `${current.claimed_by}'s claim`;
    throw new ConflictError(
        "CARD_CLAIM_OWNER_MISMATCH",
        `${id} is claimed by ${current.claimed_by}. Pass force with a reason to take it over.`,
        { id, claimedBy: current.claimed_by }
    );
}

/** `a`, `a and b`, `a, b and c` — the gates a write forced past, as prose. */
function listGates(gates: string[]): string {
    if (gates.length <= 1) return gates[0] || "";
    return `${gates.slice(0, -1).join(", ")} and ${gates[gates.length - 1]}`;
}

/**
 * The reason a forced write has to give, collapsed onto one line.
 *
 * Demanded only when `force` actually waived something, which is what keeps
 * `card reap` — `releaseCard(id, { force: true })` on a card whose gates it
 * never trips — working without inventing a reason for a bypass that did not
 * happen. `claimCard` has demanded the same thing since it first let one actor
 * take another's claim; this is that rule reaching the other three doors.
 *
 * The trail is one line per event, so a reason with newlines in it would append
 * a line the reader sees and `TRAIL_ENTRY` does not — the shape `doctor --fix`
 * then treats as a stray entry. Split-and-join rather than a trimming regex, on
 * text that arrives over HTTP and MCP.
 */
function requireForceReason(id: string, gates: string[], reason): string {
    if (!gates.length) return "";
    const given = String(reason || "").trim().split(/\s+/).join(" ");
    if (!given) {
        throw new ValidationError(
            "CARD_FORCE_REASON_REQUIRED",
            `Forcing ${id} past ${listGates(gates)} needs a reason. It is what ` +
                `the card's trail carries in place of the gate.`
        );
    }
    return given;
}

/**
 * What a forced milestone says beyond the move itself.
 *
 * The whole of T-0184. `force` reached `assertAcceptanceMet`, skipped it, and
 * was never written down — so `review → done` was the same line whether the
 * criteria were proven or waived, and every count anyone would take over closed
 * cards counted them alike. Empty when nothing was waived, which is what keeps
 * an ordinary transition's entry identical to the byte.
 */
function forcedBy(gates: Array<string | null>, reason: string): string {
    const waived = gates.filter(Boolean) as string[];
    if (!waived.length) return "";
    return ` (forced past ${listGates(waived)}: ${reason})`;
}

/** The frontmatter a patch must hold a claim to touch. */
const CLAIM_GUARDED_FIELDS = ["status", "claimed_by", "claimed_at"];

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
        ...(input.origin?.length ? { origin: input.origin } : {}),
        // Beside `origin` and `source`, because it answers the neighbouring
        // question and a reader meets the three together.
        ...(input.raised ? { raised: input.raised } : {}),
        ...(input.start ? { start: input.start } : {}),
        ...(input.due ? { due: input.due } : {}),
        ...(input.claimed_by ? { claimed_by: input.claimed_by } : {}),
        ...(input.claimed_at ? { claimed_at: input.claimed_at } : {}),
        ...(input.verify?.length ? { verify: input.verify } : {}),
        created: date,
        updated: date
    };
    // The body rides along for validation only, and deliberately not in `base`,
    // which becomes the frontmatter. `verify` binds to criteria that live in the
    // body, so a create carrying both has to be checked against the body it is
    // creating rather than against the empty one a fresh card would otherwise
    // present.
    validateCardCandidate(
        workspace,
        { ...base, body: input.body || "" },
        loaded.cards,
        null
    );

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
            // The allocated id, checked here because here is the only place it
            // exists. `validateCardCandidate` above ran against `id: "pending"`
            // — the allocation decides the id and the allocation needs the lock
            // — so a create naming the id it is about to be given cannot be
            // refused up there, whatever the field.
            //
            // T-0161 assumed it could, on the grounds that the self-parent
            // branch catches the same case on creation. It does not: a self
            // `parent` on create is refused by `CARD_PARENT_NOT_FOUND`, because
            // the id is not among the loaded cards either. The right code for
            // the wrong reason, and only for the two fields whose targets have
            // to exist. `origin` has no existence rule — an origin may name a
            // record not written yet — so nothing caught it at all.
            //
            // A `ValidationError` is not create contention, so it leaves the
            // retry loop rather than being read as a collision and retried onto
            // the next id.
            if ((base.origin || []).includes(id)) {
                throw new ValidationError(
                    "CARD_SELF_ORIGIN",
                    "A card cannot originate from itself.",
                    { id, field: "origin" }
                );
            }
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
    {
        actor,
        force = false,
        reason,
        now,
        guard,
        transformContent,
        method,
        run,
        evidence,
        commit,
        ...options
    }: any = {}
) {
    const wanted = changes?.status;
    // Filled by the guard, which `mutateCard` runs under the lock before it
    // calls `transformContent` — so the trail is written from what the gates
    // actually waived on the card as it was, not from what the caller asked for.
    // Each marker lands on the milestone it belongs to: a patch that takes a
    // claim over and closes the card forced two different things, and one line
    // saying both would leave the reader guessing which applied to which.
    let forcedMove = "";
    let forcedClaim = "";
    // The same closure, read by `applyVerification` for the same reason: only
    // the guard knows what the acceptance gate let through, and it knows it
    // under the lock.
    let waived: string | null = null;
    const head = await commitForClose(workspace, wanted, commit);
    return mutateCard(workspace, id, changes, {
        ...options,
        verification: {
            method,
            run,
            evidence,
            actor,
            now,
            commit: head,
            waived: () => waived
        },
        guard: async (current, cards) => {
            if (guard) await guard(current, cards);
            // Only the fields the other two doors already defend. A patch that
            // sets a priority on somebody else's card was never refused by
            // `transition` or `release` either, and refusing it here would be
            // a new rule rather than the missing half of an old one.
            const claim =
                changes && CLAIM_GUARDED_FIELDS.some((field) => field in changes)
                    ? assertClaimOwnership(id, current, actor, force)
                    : null;
            const acceptance =
                wanted && wanted !== current.status
                    ? assertAcceptanceMet(id, current, wanted, force)
                    : null;
            // Asked only when nothing has been waived yet. A close that walked
            // past the acceptance gate is about to record `forced`, and no
            // policy names `forced` — putting it in front of one would be
            // asking a second time about a bypass already on the trail.
            const policy = acceptance
                ? null
                : assertVerificationAccepted(
                      workspace,
                      id,
                      current,
                      // The area the card lands in: this door can move it and
                      // close it in the same write.
                      changes?.area || current.area,
                      wanted,
                      method,
                      force
                  );
            waived = acceptance || policy;
            const why = requireForceReason(
                id,
                [claim, acceptance, policy].filter(Boolean) as string[],
                reason
            );
            forcedMove = forcedBy([acceptance, policy], why);
            forcedClaim = forcedBy([claim], why);
        },
        transformContent: (content, current, candidate) => {
            const next = transformContent
                ? transformContent(content, current, candidate)
                : content;
            const moved = appendMilestone(workspace, next, {
                actor,
                text: `${current.status} → ${wanted}${forcedMove}`,
                redundant: !wanted || wanted === current.status,
                now
            });
            // A patch can hand the card to someone or let it go, which `claim`
            // and `release` both record and this door did not — so the trail
            // depended on which command you used rather than on what happened.
            return appendMilestone(workspace, moved, {
                actor,
                text: `${candidate.claimed_by ? "claimed" : "released"}${forcedClaim}`,
                redundant:
                    (candidate.claimed_by || null) ===
                    (current.claimed_by || null),
                now
            });
        }
    });
}

function claimIsStale(card, leaseHours, now) {
    if (!card.claimed_at) return false;
    const timestamp = Date.parse(card.claimed_at);
    if (!Number.isFinite(timestamp)) return false;
    return now.getTime() - timestamp >= leaseHours * 3_600_000;
}

/**
 * `method`, `run` and `evidence` are accepted here only so they can be refused.
 *
 * `transitionCard` hands a move to `doing` straight to this function, so a
 * `card transition ID doing --method ci` that stopped at that signature would
 * have its flags evaporate with a zero exit code. They are forwarded instead,
 * and `applyVerification` answers `CARD_VERIFICATION_NOT_APPLICABLE` — claiming
 * a card is never a close.
 */
export async function claimCard(
    workspace,
    id,
    {
        actor,
        scope,
        force = false,
        reason,
        expectedRevision,
        now,
        method,
        run,
        evidence
    }: any = {}
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
            verification: {
                method,
                run,
                evidence,
                actor,
                now,
                commit: null,
                waived: () => null
            },
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
                return appendMilestone(workspace, next, {
                    actor,
                    text: "claimed",
                    // Already yours and already doing: re-running the command
                    // may still widen the scope, which is a real edit to the
                    // card, but the claim it would record is the one on the
                    // line above.
                    redundant:
                        current.claimed_by === actor &&
                        current.status === "doing",
                    now
                });
            }
        }
    );
    return { ...result, warnings };
}

/**
 * `reason` was accepted here in name only.
 *
 * `project_card_release` has declared it since the tool was written — "Why
 * another actor's claim is being released. Recorded on the card." — and passed
 * it on every forced call. This signature never destructured it, so the one
 * surface that promised to record it dropped it, and a release that took
 * somebody else's claim left the same line as one that let go of your own.
 */
export async function releaseCard(
    workspace,
    id,
    {
        actor,
        status,
        force = false,
        reason,
        expectedRevision,
        // Alone among the four writers this had no clock override, which was
        // survivable while the only thing it stamped was a trail line nobody
        // asserts on. `--status done` writes `verified.at`, so the release door
        // has to be testable against a pinned clock like the other three.
        now,
        method,
        run,
        evidence,
        commit
    }: any = {}
) {
    let forced = "";
    let waived: string | null = null;
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
    const head = await commitForClose(workspace, status, commit);
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
            status: releasedStatus(current, status),
            claimed_by: null,
            claimed_at: null
        }),
        {
            expectedRevision,
            snapshot: loaded,
            verification: {
                method,
                run,
                evidence,
                actor,
                now,
                commit: head,
                waived: () => waived
            },
            transformContent: (content, current) =>
                appendMilestone(workspace, content, {
                    actor: actor || current.claimed_by,
                    text: `released${forced}`,
                    // No claim to drop and nowhere to move: the command
                    // succeeded and the card is exactly as it was.
                    redundant:
                        !current.claimed_by &&
                        releasedStatus(current, status) === current.status,
                    now
                }),
            guard: (current) => {
                // `release --status done` is a way to reach done, so it is a
                // way to reach the gate. Only when it actually moves the card
                // there: a card that is already done stays releasable, or a
                // forced close would leave its own claim stuck.
                const acceptance =
                    status && status !== current.status
                        ? assertAcceptanceMet(id, current, status, force)
                        : null;
                // See `patchCard`: only asked when the close has not already
                // been forced past something.
                const policy = acceptance
                    ? null
                    : assertVerificationAccepted(
                          workspace,
                          id,
                          current,
                          current.area,
                          status,
                          method,
                          force
                      );
                waived = acceptance || policy;
                const claim = assertClaimOwnership(id, current, actor, force);
                // One line, so both markers share it. `card reap` reaches here
                // with `force` and no actor, which waives nothing and therefore
                // owes no reason.
                const gates = [acceptance, policy, claim].filter(
                    Boolean
                ) as string[];
                forced = forcedBy(gates, requireForceReason(id, gates, reason));
            }
        }
    );
}

export async function transitionCard(
    workspace,
    id,
    status,
    {
        actor,
        scope,
        force = false,
        reason,
        expectedRevision,
        now,
        method,
        run,
        evidence,
        commit
    }: any = {}
) {
    if (status === "doing") {
        return claimCard(workspace, id, {
            actor,
            scope,
            expectedRevision,
            now,
            // Forwarded so they are refused rather than dropped; see claimCard.
            method,
            run,
            evidence
        });
    }
    const loaded = await loadCards(workspace);
    const snapshot = locateUniqueCard(loaded.cards, id);
    const moveToArchived = snapshot.archived && !["done", "discarded"].includes(status)
        ? false
        : undefined;
    let forced = "";
    let waived: string | null = null;
    const head = await commitForClose(workspace, status, commit);
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
            verification: {
                method,
                run,
                evidence,
                actor,
                now,
                commit: head,
                waived: () => waived
            },
            transformContent: (content, current) =>
                appendMilestone(workspace, content, {
                    actor,
                    // When the status did not move, the only reason this line
                    // exists is the card coming back out of the archive — so
                    // it has to say that. Writing `backlog → backlog` there
                    // would record a move that did not happen, which is the
                    // exact line this card set out to remove.
                    text:
                        moveToArchived === false && current.status === status
                            ? "unarchived"
                            : `${current.status} → ${status}${forced}`,
                    // The status is the milestone, except when the card is
                    // also coming back out of the archive: that moves it even
                    // though the status reads the same on both sides.
                    redundant:
                        current.status === status &&
                        moveToArchived === undefined,
                    now
                }),
            // The same ownership guard `releaseCard` has always had. Without it
            // transitioning was the way around it: any actor could move a card
            // claimed by someone else and silently drop their claim, no reason
            // required — which made the guard on release decorative.
            guard: (current) => {
                // `--force` is the documented way past it, for the cases the
                // criteria did not anticipate. Documented, and now recorded:
                // what it waived goes on the same line as the move it allowed.
                const acceptance = assertAcceptanceMet(id, current, status, force);
                // See `patchCard`: only asked when the close has not already
                // been forced past something.
                const policy = acceptance
                    ? null
                    : assertVerificationAccepted(
                          workspace,
                          id,
                          current,
                          current.area,
                          status,
                          method,
                          force
                      );
                waived = acceptance || policy;
                const claim = assertClaimOwnership(id, current, actor, force);
                const gates = [acceptance, policy, claim].filter(
                    Boolean
                ) as string[];
                forced = forcedBy(gates, requireForceReason(id, gates, reason));
            }
        }
    );
}

/**
 * Replaces a card's body, except for the content of the protocol sections.
 *
 * Deliberately separate from `patchCard`, which is a frontmatter diff: the two
 * have different conflict semantics, and mixing them would put a whole-document
 * replacement behind an interface that reads like a field update. Until this
 * existed, no surface — CLI, HTTP or MCP — could write a card body at all, so
 * an agent recording a result had to reach past the protocol with a raw file
 * write, skipping the lock, the revision check and validation.
 *
 * `## Activity` and `## Notes` are carried over from what is stored rather
 * than from what was sent, so a caller that omits them cannot delete them and
 * one that hands back a shortened trail cannot shorten it. The trail is
 * specified as append-only — a merge between two branches resolves by keeping
 * both sides' lines — which is not true of a section any write can replace.
 *
 * Everything else belongs to the caller, *wherever it sits*. That is the
 * correction ADR-0011 records: the guard used to keep the stored body from the
 * first protocol heading to the end of the document, so a card with acceptance
 * criteria below its notes had a criteria list nothing could rewrite, and
 * `card write` reported success while dropping it.
 *
 * A section the caller kept stays where the caller put it; one they omitted is
 * appended, in stored order. A caller that edits inside those sections is
 * still ignored there — but no longer silently: the headings whose content did
 * not survive come back as `ignored`.
 */
export async function patchCardBody(workspace, id, { body, expectedRevision }: any = {}) {
    if (typeof body !== "string") {
        throw new ValidationError(
            "CARD_BODY_REQUIRED",
            "body must be a string."
        );
    }
    let ignored: string[] = [];
    const result = await mutateCard(workspace, id, {}, {
        expectedRevision,
        bodyOnly: true,
        transformContent: (content) => {
            const parsed = requireFrontmatter(content, { listKeys: CARD_LIST_KEYS });
            const held = splitSections(parsed.body)
                .filter((section) => isProtocolSection(section.heading))
                .map((section) => ({ ...section, taken: false }));
            const declined: string[] = [];
            const next: string[] = [];
            for (const section of splitSections(String(body))) {
                if (!isProtocolSection(section.heading)) {
                    if (section.text) next.push(section.text);
                    continue;
                }
                const stored = held.find(
                    (candidate) =>
                        !candidate.taken && candidate.heading === section.heading
                );
                // A caller cannot open one of these sections either: the
                // protocol commands are the only writers, so a trail that
                // appears out of a body write is a fabricated trail.
                if (!stored) {
                    declined.push(section.heading);
                    continue;
                }
                stored.taken = true;
                if (stored.text !== section.text) declined.push(section.heading);
                next.push(stored.text);
            }
            for (const stored of held) {
                if (!stored.taken) next.push(stored.text);
            }
            ignored = [...new Set(declined)];
            const written = next.join("\n\n");
            return withFrontmatter(
                content.slice(0, parsed.prefixLength),
                written
            );
        }
    });
    return { ...result, ignored };
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
 *
 * `runner` is the id of the `verify` entry reporting its own result, and is
 * what makes a bound criterion machine-owned: without it the caller is a human
 * or an agent and a bound index is refused; with it the caller may write the
 * criteria bound to that entry and no others. Only `runCardVerification` passes
 * it, which is the whole of the guarantee.
 *
 * A run also leaves a trail line, which a hand-written `card ac` does not. The
 * asymmetry is the point: when a person checks a box the actor is whoever typed
 * the command and the diff shows their hand, but a box that changed because a
 * subprocess exited has no author at all in the record — which is the untraced
 * state change T-0184 exists to prevent. `outcome` is the phrase the runner
 * supplies (`pnpm test passed`), because only it knows what the command did;
 * what moved is added here, because only this knows that. The line lands in the
 * same write as the change it describes, so no reader can see one without the
 * other.
 */
export async function setCardAcceptance(
    workspace,
    id,
    {
        check = [],
        uncheck = [],
        expectedRevision,
        runner = null,
        outcome = null,
        actor = null,
        now
    }: any = {}
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
                applied = applyAcceptance(body, {
                    check,
                    uncheck,
                    // Read from the locked content, not from the listing: the
                    // whole point of a bound criterion is that this write is
                    // refused, and reading the bindings from before the lock
                    // would let a concurrent bind slip past it.
                    owners: criterionOwners(
                        parseAcceptance(body),
                        parsed.metadata.verify
                    ),
                    runner
                });
            } catch (error: any) {
                if (error?.code === "CARD_ACCEPTANCE_INDEX_UNKNOWN") {
                    throw new ValidationError(error.code, error.message, {
                        index: error.index,
                        available: error.available
                    });
                }
                if (
                    error?.code === "CARD_ACCEPTANCE_MACHINE_OWNED" ||
                    error?.code === "CARD_ACCEPTANCE_NOT_BOUND"
                ) {
                    throw new ValidationError(error.code, error.message, {
                        index: error.index,
                        entry: error.entry
                    });
                }
                throw error;
            }
            changed = applied.changed;
            const written = `${content.slice(0, parsed.prefixLength)}${applied.body}`;
            return appendMilestone(workspace, written, {
                actor,
                text: `verify ${runner}: ${outcome}, ${describeChanges(applied.changed)}`,
                // A run that found the boxes already saying what it proves has
                // changed nothing, and the trail records protocol events rather
                // than command invocations — the same rule a repeated
                // `transition` follows. `runner` guards the other half: a
                // hand-written `card ac` has no entry to name and writes no
                // line, which is what it has always done.
                redundant: !runner || !applied.changed.length,
                now
            });
        }
    });
    return {
        ...result,
        changed,
        acceptance: parseAcceptance(result.card?.body || "")
    };
}

/** `checked #1, #3` — what a run moved, for the trail line above. */
function describeChanges(changed): string {
    const numbered = (state: boolean) =>
        changed
            .filter((item) => item.checked === state)
            .map((item) => `#${item.index}`);
    const checked = numbered(true);
    const unchecked = numbered(false);
    return [
        checked.length && `checked ${checked.join(", ")}`,
        unchecked.length && `unchecked ${unchecked.join(", ")}`
    ]
        .filter(Boolean)
        .join("; ");
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
            return withFrontmatter(
                content.slice(0, parsed.prefixLength),
                appendUnderHeading(parsed.body, `## ${section}`, entry)
            );
        }
    });
}

/**
 * Filing a card away is a milestone, and the trail said so in one direction.
 *
 * [[T-0168]] listed this among the routes missing an actor and found no
 * argument to pass one to: the mutation sets `status` to the status it already
 * had, so no transition line was written and there was nowhere for an actor to
 * appear. The asymmetry that leaves is the finding, not the missing argument —
 * `transitionCard` writes `unarchived` when a card comes back out, on the
 * reasoning that the move is the milestone even though the status reads the
 * same on both sides, and going in is the same move ([[T-0175]]).
 *
 * The counter-argument is that archiving is reversible and the file move shows
 * up in git. But that is true of every mutation the trail records, and the
 * trail exists precisely so that "who, and when" is answerable without reading
 * git across a rename — which is the one shape `git log` needs `--follow` for,
 * on the one event that always renames.
 *
 * Archiving an already-archived card returns above this and writes nothing:
 * the command is idempotent, and a second line would record a move that did
 * not happen.
 */
export async function archiveCard(
    workspace,
    id,
    { actor, expectedRevision, now }: any = {}
) {
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
            transformContent: (content) =>
                appendMilestone(workspace, content, {
                    actor,
                    text: "archived",
                    redundant: false,
                    now
                }),
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
    { expectedRevisions = {}, method, run, evidence }: any = {}
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
    // And one HEAD, resolved before any lock is taken. Per card this would be
    // five thousand sequential subprocesses; shared it is one, and it is the
    // truthful reading besides — a single command closed these cards, at a
    // single commit.
    const commit = await commitForClose(workspace, changes?.status, undefined);
    const results = [];
    const records = [];
    for (const id of unique) {
        try {
            const result = await patchCard(workspace, id, changes, {
                expectedRevision: expectedRevisions[id],
                snapshot,
                commit,
                method,
                run,
                evidence
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
