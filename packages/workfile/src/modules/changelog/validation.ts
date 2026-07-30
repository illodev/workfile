const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function issue(severity, code, record, message, details = undefined) {
    return {
        severity,
        code,
        id: record?.id,
        file: record?.path,
        message,
        ...(details ? { details } : {})
    };
}

export function diagnoseChangelog({
    fragments,
    releases,
    unreadable = [],
    workspace,
    knownRecords = new Map(),
    now = new Date()
}) {
    const issues = unreadable.map((entry) =>
        issue(
            "error",
            "unreadable-changelog-record",
            { path: entry.file },
            `Cannot read changelog record: ${entry.reason}`
        )
    );
    const all = [...fragments, ...releases];
    const ids = new Map();
    for (const record of all) {
        if (!ids.has(record.id)) ids.set(record.id, []);
        ids.get(record.id).push(record);
    }
    for (const [id, matches] of ids) {
        if (matches.length > 1) {
            issues.push(
                issue(
                    "error",
                    "duplicate-record-id",
                    matches[0],
                    `${id} appears in ${matches.length} changelog files`
                )
            );
        }
    }
    for (const fragment of fragments) {
        for (const key of ["id", "title", "type", "area", "visibility", "created", "updated"]) {
            if (!fragment[key]) {
                issues.push(
                    issue(
                        "error",
                        "change-missing-required",
                        fragment,
                        `Missing required field: ${key}`
                    )
                );
            }
        }
        if (!workspace.config.changelog.types.includes(fragment.type)) {
            issues.push(
                issue(
                    "error",
                    "change-invalid-type",
                    fragment,
                    `Invalid changelog type: ${fragment.type}`
                )
            );
        }
        if (!workspace.config.changelog.visibilities.includes(fragment.visibility)) {
            issues.push(
                issue(
                    "error",
                    "change-invalid-visibility",
                    fragment,
                    `Invalid visibility: ${fragment.visibility}`
                )
            );
        }
        if (!workspace.config.cards.areas.includes(fragment.area)) {
            issues.push(
                issue(
                    "warning",
                    "change-unknown-area",
                    fragment,
                    `Area is not configured: ${fragment.area}`
                )
            );
        }
        for (const key of ["created", "updated"]) {
            if (fragment[key] && !DATE_RE.test(fragment[key])) {
                issues.push(
                    issue(
                        "error",
                        "change-invalid-date",
                        fragment,
                        `${key} must use YYYY-MM-DD`
                    )
                );
            }
        }
        for (const reference of [
            ...(fragment.cards || []),
            ...(fragment.decisions || []),
            ...(fragment.related || [])
        ]) {
            if (!knownRecords.has(reference)) {
                issues.push(
                    issue(
                        "warning",
                        "change-missing-reference",
                        fragment,
                        `Referenced record does not exist: ${reference}`
                    )
                );
            }
        }
        if (fragment.released && !fragment.releaseIds?.length) {
            issues.push(
                issue(
                    "error",
                    "released-fragment-unassigned",
                    fragment,
                    "Released fragment is not listed by a release record"
                )
            );
        }
        if ((fragment.releaseIds || []).length > 1) {
            issues.push(
                issue(
                    "error",
                    "fragment-consumed-multiple-times",
                    fragment,
                    `Fragment is consumed by multiple releases: ${fragment.releaseIds.join(", ")}`
                )
            );
        }
    }
    const versions = new Map();
    const consumed = new Map();
    for (const release of releases) {
        if (!versions.has(release.version)) versions.set(release.version, []);
        versions.get(release.version).push(release);
        for (const key of ["id", "title", "version", "date"]) {
            if (!release[key]) {
                issues.push(
                    issue(
                        "error",
                        "release-missing-required",
                        release,
                        `Missing required field: ${key}`
                    )
                );
            }
        }
        if (!release.fragments?.length) {
            issues.push(
                issue(
                    "error",
                    "release-empty",
                    release,
                    "Release does not contain any fragments"
                )
            );
        }
        if (release.date && !DATE_RE.test(release.date)) {
            issues.push(
                issue(
                    "error",
                    "release-invalid-date",
                    release,
                    "Release date must use YYYY-MM-DD"
                )
            );
        }
        if (
            workspace.config.changelog.releaseStrategy === "semver" &&
            release.version &&
            !SEMVER_RE.test(release.version)
        ) {
            issues.push(
                issue(
                    "error",
                    "release-invalid-version",
                    release,
                    `Release version is not semver: ${release.version}`
                )
            );
        }
        if (
            workspace.config.changelog.releaseStrategy === "calendar" &&
            release.version &&
            !DATE_RE.test(release.version)
        ) {
            issues.push(
                issue(
                    "error",
                    "release-invalid-version",
                    release,
                    `Release version is not a calendar date: ${release.version}`
                )
            );
        }
        for (const id of release.fragments || []) {
            if (!consumed.has(id)) consumed.set(id, []);
            consumed.get(id).push(release.id);
            const target = knownRecords.get(id);
            if (!target || target.kind !== "change") {
                issues.push(
                    issue(
                        "error",
                        "release-missing-fragment",
                        release,
                        `Release fragment does not exist: ${id}`
                    )
                );
            } else if (!target.released) {
                issues.push(
                    issue(
                        "error",
                        "release-points-to-unreleased-fragment",
                        release,
                        `Release points to a fragment still in unreleased: ${id}`
                    )
                );
            }
        }
        if (release.date && release.date > now.toISOString().slice(0, 10)) {
            issues.push(
                issue(
                    "warning",
                    "release-date-in-future",
                    release,
                    `Release date is in the future: ${release.date}`
                )
            );
        }
    }
    for (const [version, matches] of versions) {
        if (version && matches.length > 1) {
            issues.push(
                issue(
                    "error",
                    "release-version-duplicate",
                    matches[0],
                    `Release version appears more than once: ${version}`
                )
            );
        }
    }
    for (const [id, releaseIds] of consumed) {
        if (releaseIds.length > 1) {
            const fragment = knownRecords.get(id);
            issues.push(
                issue(
                    "error",
                    "fragment-consumed-multiple-times",
                    fragment || { id },
                    `Fragment is consumed by multiple releases: ${releaseIds.join(", ")}`
                )
            );
        }
    }
    const counts = { error: 0, warning: 0, info: 0 };
    for (const item of issues) counts[item.severity] += 1;
    return {
        generatedAt: now.toISOString(),
        fragments: fragments.length,
        unreleased: fragments.filter((fragment) => !fragment.released).length,
        releases: releases.length,
        counts,
        ok: counts.error === 0,
        issues
    };
}
