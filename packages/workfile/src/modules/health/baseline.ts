import { readFile } from "node:fs/promises";

import { writeFileAtomic } from "../../core/filesystem.js";
import { ensureWritable } from "../../core/guards.js";
import { NotFoundError } from "../../core/errors.js";

const BASELINE_VERSION = 1;

/**
 * What makes one issue the same issue across two runs.
 *
 * Rule and subject alone would collapse two different problems reported by the
 * same rule against the same card — a card with an invalid `area` and an
 * invalid `type` both raise `invalid-enum` — so fixing one would hide the
 * other. The message is what tells them apart, and it is part of the identity.
 *
 * The cost is that a rule whose message embeds volatile detail never matches an
 * older baseline: `stale-write-lock` names the owning pid, so a different lock
 * reads as new. That is the right answer for that rule and an acceptable one
 * everywhere else.
 */
export function issueIdentity(issue) {
    return {
        code: issue.code || "",
        id: issue.id || "",
        file: issue.file || "",
        message: issue.message || ""
    };
}

/** Internal only — a stable Map key. The file stores the fields themselves. */
export function issueKey(issue) {
    const { code, id, file, message } = issueIdentity(issue);
    return JSON.stringify([code, id, file, message]);
}

/**
 * Counts rather than a set: five broken links in one file are five issues, and
 * a sixth is new. A plain set would call the sixth known.
 */
function tally(issues) {
    const counts = new Map<string, { identity: any; count: number }>();
    for (const issue of issues) {
        const key = issueKey(issue);
        const seen = counts.get(key);
        if (seen) seen.count += 1;
        else counts.set(key, { identity: issueIdentity(issue), count: 1 });
    }
    return counts;
}

export async function readDoctorBaseline(workspace) {
    let raw;
    try {
        raw = await readFile(workspace.paths.doctorBaseline, "utf8");
    } catch (error) {
        if ((error as { code?: string })?.code === "ENOENT") return null;
        throw error;
    }
    const parsed = JSON.parse(raw);
    const counts = new Map<string, number>();
    for (const entry of parsed.issues || []) {
        counts.set(issueKey(entry), Number(entry.count) || 0);
    }
    return {
        version: parsed.version ?? BASELINE_VERSION,
        acceptedAt: parsed.acceptedAt ?? null,
        counts
    };
}

export async function writeDoctorBaseline(workspace, issues, { now }: any = {}) {
    ensureWritable(workspace);
    const counts = tally(issues);
    // Written as readable fields rather than opaque keys, and sorted, because
    // this file is committed: accepting an unchanged repository twice must
    // produce an identical file, and a reviewer has to be able to see in the
    // diff which debt somebody just decided to live with.
    const entries = [...counts.values()]
        .map(({ identity, count }) => ({ ...identity, count }))
        .sort(
            (left, right) =>
                left.code.localeCompare(right.code) ||
                left.id.localeCompare(right.id) ||
                left.file.localeCompare(right.file) ||
                left.message.localeCompare(right.message)
        );
    const payload = {
        version: BASELINE_VERSION,
        acceptedAt: (now ? new Date(now) : new Date()).toISOString(),
        issues: entries
    };
    await writeFileAtomic(
        workspace.paths.doctorBaseline,
        `${JSON.stringify(payload, null, 2)}\n`
    );
    return {
        accepted: issues.length,
        distinct: entries.length,
        acceptedAt: payload.acceptedAt
    };
}

/**
 * The issues this run has that the baseline did not account for.
 *
 * Resolved issues are reported too, but only as a count: they are what makes
 * the baseline worth re-accepting, and listing them would put the noise back.
 */
export function diffAgainstBaseline(
    issues,
    baseline
): { new: any[]; known: number; resolved: number } {
    const remaining = new Map<string, number>(baseline.counts);
    const fresh: any[] = [];
    for (const issue of issues) {
        const key = issueKey(issue);
        const left = remaining.get(key) || 0;
        if (left > 0) remaining.set(key, left - 1);
        else fresh.push(issue);
    }
    let resolved = 0;
    for (const count of remaining.values()) resolved += count;
    return {
        new: fresh,
        known: issues.length - fresh.length,
        resolved
    };
}

export function baselineMissing(workspace) {
    return new NotFoundError(
        "DOCTOR_BASELINE_MISSING",
        `No doctor baseline at ${workspace.config.storage.root}/doctor-baseline.json. Run \`workfile doctor --accept-baseline\` to record the current state as known.`
    );
}
