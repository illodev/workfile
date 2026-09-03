/**
 * Whether a record's filename still describes the record, for every kind.
 *
 * `diagnoseCards` had this rule and nothing else did. Memory records, managed
 * documents and changelog fragments all derive their filenames from their titles
 * the same way, so retitling one through `memory patch` left a file named after a
 * title the record no longer has and nothing reported it — found by doing it:
 * LRN-0033 was retitled and sat under its old name with `doctor` reporting 0
 * errors and 0 warnings (T-0223).
 *
 * Written here, in the layer that holds every kind at once, for the same reason
 * duplicate identity is answered here: a per-module rule is four copies of one
 * sentence, and the module that owns a kind cannot see the others. The card rule
 * moved out of `diagnoseCards` rather than being left beside this one.
 *
 * ## What is deliberately out of scope, and why
 *
 * **An indexed document.** Its filename is somebody's `README.md`, outside the
 * protocol directory and read-only through the protocol by definition. Renaming
 * it would be this tool editing a repository's own tree to match a title it does
 * not own.
 *
 * **A released changelog fragment.** The protocol already refuses to retitle one:
 * `changelog patch` answers `CHANGE_FRAGMENT_RELEASED` and tells the caller to
 * write a new fragment instead. So this exclusion is not the primary guard — it
 * covers the fragment whose title was edited by hand, or edited before the
 * release moved it, where reporting drift would ask a reader to churn a published
 * release directory to fix a slug.
 *
 * **A release.** Its filename comes from the version, not the title, so the
 * comparison this rule makes does not apply to it at all.
 *
 * **A record renamed by hand to something legitimate.** There is no way to tell
 * that from drift, and nothing here tries: the rule reports what the title would
 * produce today and `doctor --fix` renames only when asked. A project that keeps
 * a deliberate name gets one warning per record and can accept it into the
 * baseline, which is what the baseline is for.
 */

import { fragmentFileName } from "../changelog/changelog.js";
import { cardFileName } from "../cards/slug.js";
import { documentFileName } from "../docs/docs.js";
import { memoryFileName } from "../memory/memory.js";

/** The module each kind's findings are attributed to (T-0218). */
const MODULE_FOR_KIND: Record<string, string> = {
    card: "cards",
    memory: "memory",
    doc: "docs",
    change: "changelog"
};

/**
 * What this record's file would be called if it were created now, or `null` when
 * the rule does not apply to it.
 *
 * The four derivations differ in their length cap — 50 for a card, 60 for a
 * document, 70 for the other two — and that is load-bearing rather than
 * historical accident to be tidied: unifying them would rename every existing
 * record whose title crosses the new bound, in one sweep, on the next `--fix`.
 */
export function expectedRecordFileName(record): string | null {
    if (!record?.id || !record?.title) return null;
    switch (record.kind) {
        case "card":
            return cardFileName(record.id, record.title);
        case "memory":
            return memoryFileName(record.id, record.title);
        case "doc":
            return record.managed ? documentFileName(record.id, record.title) : null;
        case "change":
            // Unreleased only. `released` is the flag the record carries; the
            // path check is the belt to its braces, because a fragment moved
            // into a release directory by hand is still published history.
            return record.released || !/\/unreleased\//.test(String(record.path || ""))
                ? null
                : fragmentFileName(record.id, record.title);
        default:
            return null;
    }
}

/** The basename of a repository-relative path, without importing `node:path`. */
function basenameOf(path: string): string {
    const normalized = String(path || "").replace(/\\/g, "/");
    return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export interface StaleFilename {
    record: any;
    module: string;
    current: string;
    expected: string;
}

/**
 * Every record whose filename has drifted from its title.
 *
 * A file whose name does not even start with its id is skipped: that is a
 * different fault with a different repair — `filename-mismatch` for a card, and
 * renumbering rather than renaming fixes it.
 */
export function staleFilenames(records: any[]): StaleFilename[] {
    const stale: StaleFilename[] = [];
    for (const record of records || []) {
        const expected = expectedRecordFileName(record);
        if (!expected) continue;
        const current = basenameOf(record.path);
        if (!current || current === expected) continue;
        if (!current.startsWith(`${record.id}-`)) continue;
        stale.push({
            record,
            module: MODULE_FOR_KIND[record.kind] || "doctor",
            current,
            expected
        });
    }
    return stale;
}

/**
 * The diagnostic, worded once so all four kinds read alike.
 *
 * **It names `--only`, and that is the whole point of this wording.** The
 * message used to say "`doctor --fix` renames it to X", which reads as the
 * remedy for the one record it is talking about and is not: `--fix` renames
 * **every** record whose filename no longer matches its title, across the whole
 * workspace. On the reporting repository, in a session where seven other agents
 * were editing cards, somebody ran it because this line recommended it and it
 * moved **63 records belonging to other people** — including cards they had
 * retitled and not yet committed, which is the case where the rename is not
 * recoverable from git.
 *
 * A warning that names a repository-wide rewrite as the fix for one record is
 * not advice, it is a trap with a friendly voice. Since T-0233 gave `--fix` an
 * `--only`, the scoped command exists and this is where it has to appear —
 * whoever reads the warning is exactly the person who needs it, and they will
 * not go looking in `--help` for a narrower form they have no reason to suspect.
 */
export function staleFilenameIssue(entry: StaleFilename) {
    return {
        severity: "warning" as const,
        module: entry.module,
        code: "filename-stale",
        id: entry.record.id,
        file: entry.record.path,
        message:
            "Filename no longer matches the title; " +
            `\`doctor --fix --only ${entry.record.id}\` renames it to ` +
            `${entry.expected}. Plain \`--fix\` renames every stale filename in ` +
            "the workspace, which is rarely what one warning calls for",
        details: { current: entry.current, expected: entry.expected }
    };
}
