import { normalizeRepoPath } from "../../core/glob.js";

/**
 * Which duplicate IDs can be healed, and which record keeps the ID.
 *
 * Two readers need the same answer: `doctor`, which prints what to run, and the
 * healer, which runs it. They were written apart, and this card is the result —
 * every collision was told to run a command that only ever moved cards. One
 * classifier means the message and the repair cannot disagree again.
 */

/**
 * Record kinds whose IDs are allocated by scanning a local maximum, so two
 * clones mint the same one and a merge lands both files. Releases are absent
 * deliberately: a release is written once, when the version is cut.
 */
export const HEALABLE_KINDS = Object.freeze(["card", "change", "doc", "memory"]);

export type DuplicateRefusal =
    | "missing-id"
    | "mixed-kinds"
    | "unknown-kind"
    | "release"
    | "multiple-released"
    | "indexed-document";

export interface DuplicateClassification {
    id: string;
    /** The single kind carrying the ID, or `null` when the files span kinds. */
    kind: string | null;
    /** Every path carrying the ID, in code-unit order. */
    paths: string[];
    healable: boolean;
    reason: DuplicateRefusal | null;
    /** One sentence stating the fact. Names no command. */
    reasonText: string | null;
    /** The path that keeps the ID. */
    survivor: string | null;
    /** Whether the survivor keeps it because it is frozen rather than oldest. */
    survivorFrozen: boolean;
    /** Paths to move, oldest first. */
    movers: string[];
}

/**
 * Code-unit order, which `localeCompare` is not.
 *
 * The survivor of a collision has to be the same record in every clone, and
 * `localeCompare` follows the host's locale: under tr-TR or cs-CZ the same two
 * paths can order the other way round, so two machines healing one merge keep
 * different files and collide again on the next one. IDs, ISO dates and
 * repository paths are ASCII, where `<` is a total order.
 */
export function byCodeUnit(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function refusalText(reason: DuplicateRefusal, kinds: string[]): string {
    switch (reason) {
        case "missing-id":
            return "the files carry no `id:` line, so there is no ID to move and nothing to tell them apart";
        case "mixed-kinds":
            return `the files are different record kinds (${kinds.join(", ")}), so no single sequence owns the ID`;
        case "unknown-kind":
            return `Workfile does not allocate IDs for ${kinds.join(", ")} records, so it has no free one to move to`;
        case "release":
            return "a release record is written once, when the version is cut, and is never rewritten";
        case "multiple-released":
            return "more than one of them is a released changelog fragment, and a released fragment is frozen — describe the correction in a new fragment";
        case "indexed-document":
            return "an indexed file outside `docs.managedPath` declares the same ID in its frontmatter, and Workfile does not rewrite files it does not manage — remove or change its `id:` line";
    }
}

/**
 * The survivor rule, in one place.
 *
 * A released changelog fragment sorts first whatever its date: it was cut into
 * a version, the release record lists it by ID, and renumbering it would
 * rewrite shipped history (LRN-0016). Everything else is oldest `created`
 * first, then path — both committed facts about the merged tree, so every
 * clone reads the same order.
 */
function classify(id: string, members: any[]): DuplicateClassification {
    const paths = members
        .map((record) => normalizeRepoPath(record.path))
        .sort(byCodeUnit);
    const kinds = [...new Set(members.map((record) => String(record.kind)))].sort(
        byCodeUnit
    );
    const refuse = (reason: DuplicateRefusal): DuplicateClassification => ({
        id,
        kind: kinds.length === 1 ? kinds[0] : null,
        paths,
        healable: false,
        reason,
        reasonText: refusalText(reason, kinds),
        survivor: null,
        survivorFrozen: false,
        movers: []
    });
    if (!id) return refuse("missing-id");
    if (kinds.length > 1) return refuse("mixed-kinds");
    const kind = kinds[0];
    if (!HEALABLE_KINDS.includes(kind)) {
        return refuse(kind === "release" ? "release" : "unknown-kind");
    }
    // An indexed file is not Workfile's to rewrite, and moving the *managed*
    // record instead would renumber a real record because a stray README
    // declared an `id:` line.
    if (kind === "doc" && members.some((record) => record.managed !== true)) {
        return refuse("indexed-document");
    }
    const frozen = members.filter(
        (record) => kind === "change" && record.released === true
    );
    if (frozen.length > 1) return refuse("multiple-released");
    const ordered = [...members].sort(
        (left, right) =>
            byCodeUnit(String(left.created || ""), String(right.created || "")) ||
            byCodeUnit(normalizeRepoPath(left.path), normalizeRepoPath(right.path))
    );
    const survivor = normalizeRepoPath(
        (frozen.length ? frozen[0] : ordered[0]).path
    );
    return {
        id,
        kind,
        paths,
        healable: true,
        reason: null,
        reasonText: null,
        survivor,
        survivorFrozen: frozen.length === 1,
        movers: ordered
            .map((record) => normalizeRepoPath(record.path))
            .filter((path) => path !== survivor)
    };
}

/**
 * Every duplicated ID in the index, classified.
 *
 * Grouped from `index.records` rather than read from `index.duplicates`,
 * because a persisted index served from cache need not carry that list and the
 * healer — unlike the doctor — does not force a fresh diagnosed build.
 */
export function classifyDuplicates(index: any): DuplicateClassification[] {
    const groups = new Map<string, any[]>();
    for (const record of index.records || []) {
        const key = String(record.id || "");
        const found = groups.get(key);
        if (found) found.push(record);
        else groups.set(key, [record]);
    }
    const classified: DuplicateClassification[] = [];
    for (const [id, members] of groups) {
        if (members.length > 1) classified.push(classify(id, members));
    }
    return classified.sort((left, right) => byCodeUnit(left.id, right.id));
}

const LABELS: Record<string, string> = {
    card: "cards",
    change: "changelog records",
    doc: "documents",
    memory: "memory records"
};

/**
 * What `doctor` says about a duplicate.
 *
 * A healable collision names the command that performs the repair and which
 * side of it keeps the ID. A refused one names no command at all: the previous
 * message pointed every collision at `card renumber --duplicates`, which is
 * exactly the dead end this replaces.
 */
export function duplicateIssueMessage(
    classification: DuplicateClassification
): string {
    const label = LABELS[String(classification.kind)] || "project records";
    const count = classification.paths.length;
    const subject = classification.id
        ? `${classification.id} is used by ${count} ${label}`
        : `${count} ${label} carry no ID`;
    if (!classification.healable) {
        return `${subject}, and no command can heal it: ${classification.reasonText}.`;
    }
    const alsoCards =
        classification.kind === "card"
            ? " or `workfile card renumber --duplicates`"
            : "";
    const rule = classification.survivorFrozen
        ? "the released fragment keeps the ID and the unreleased one moves to a free one"
        : "the oldest keeps the ID and the rest move to free ones";
    return `${subject}. Run \`workfile doctor --fix\`${alsoCards} to heal it: ${rule}.`;
}
