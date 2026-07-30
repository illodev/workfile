import { stat } from "node:fs/promises";
import { posix, resolve } from "node:path";

import { DOC_REQUIRED_KEYS, pathExistsWithinWorkspace } from "./docs.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function issue(severity, code, document, message, details = undefined) {
    return {
        severity,
        code,
        id: document?.id,
        file: document?.path,
        message,
        ...(details ? { details } : {})
    };
}

function dayNumber(date) {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp / 86_400_000 : null;
}

function localMarkdownPaths(document) {
    const paths = [];
    const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of String(document.body || "").matchAll(pattern)) {
        let target = match[1].trim().replace(/^<|>$/g, "");
        if (
            !target ||
            target.startsWith("#") ||
            /^[a-z][a-z0-9+.-]*:/i.test(target)
        ) {
            continue;
        }
        target = target.split(/[?#]/, 1)[0];
        try {
            target = decodeURIComponent(target);
        } catch {
            // Invalid percent escapes are checked as a literal local path.
        }
        paths.push(
            target.startsWith("/")
                ? target.slice(1)
                : posix.normalize(posix.join(posix.dirname(document.path), target))
        );
    }
    return [...new Set(paths)];
}

export async function diagnoseDocuments({
    documents,
    unreadable = [],
    workspace,
    knownRecords = new Map(),
    now = new Date()
}) {
    const issues = unreadable.map((entry) =>
        issue("error", "unreadable-document", { path: entry.file }, `Cannot read document: ${entry.reason}`)
    );
    const ids = new Map();
    for (const document of documents) {
        if (!ids.has(document.id)) ids.set(document.id, []);
        ids.get(document.id).push(document);
    }
    for (const [id, matches] of ids) {
        if (matches.length > 1) {
            issues.push(
                issue(
                    "error",
                    "duplicate-record-id",
                    matches[0],
                    `${id} appears in ${matches.length} documents`
                )
            );
        }
    }
    for (const document of documents) {
        if (document.managed) {
            const missing = DOC_REQUIRED_KEYS.filter((key) => {
                if (key === "kind") return !document.documentKind;
                return !document[key];
            });
            if (missing.length) {
                issues.push(
                    issue(
                        "error",
                        "doc-missing-required",
                        document,
                        `Missing required fields: ${missing.join(", ")}`
                    )
                );
            }
            if (!workspace.config.docs.kinds.includes(document.documentKind)) {
                issues.push(
                    issue(
                        "error",
                        "doc-invalid-kind",
                        document,
                        `Invalid document kind: ${document.documentKind}`
                    )
                );
            }
            if (!workspace.config.docs.statuses.includes(document.status)) {
                issues.push(
                    issue(
                        "error",
                        "doc-invalid-status",
                        document,
                        `Invalid document status: ${document.status}`
                    )
                );
            }
        }
        for (const key of ["created", "updated", "reviewed"]) {
            if (document[key] && !DATE_RE.test(document[key])) {
                issues.push(
                    issue(
                        "error",
                        "doc-invalid-date",
                        document,
                        `${key} must use YYYY-MM-DD`
                    )
                );
            }
        }
        for (const reference of document.related || []) {
            if (!knownRecords.has(reference)) {
                issues.push(
                    issue(
                        "warning",
                        "doc-missing-related",
                        document,
                        `Related record does not exist: ${reference}`
                    )
                );
            }
        }
        for (const reference of document.supersedes || []) {
            if (!knownRecords.has(reference)) {
                issues.push(
                    issue(
                        "error",
                        "doc-missing-superseded",
                        document,
                        `Superseded document does not exist: ${reference}`
                    )
                );
            }
        }
        for (const linkedPath of localMarkdownPaths(document)) {
            if (!(await pathExistsWithinWorkspace(workspace, linkedPath))) {
                issues.push(
                    issue(
                        // An indexed document is read-only through the protocol,
                        // so a broken link inside one cannot be fixed by anything
                        // this tool offers — reporting it as an error made the
                        // doctor permanently red on any repository with a legacy
                        // documentation tree, and a gate that is always red stops
                        // being read at all.
                        document.managed ? "error" : "warning",
                        "doc-broken-local-link",
                        document,
                        `Linked path does not exist: ${linkedPath}`,
                        { path: linkedPath }
                    )
                );
            }
        }
        for (const repoPath of document.scope || []) {
            if (!(await pathExistsWithinWorkspace(workspace, repoPath))) {
                issues.push(
                    issue(
                        "error",
                        "doc-missing-scope-path",
                        document,
                        `Document scope path does not exist: ${repoPath}`
                    )
                );
                continue;
            }
            if (document.updated) {
                const info = await stat(resolve(workspace.root, repoPath));
                const changed = info.mtime.toISOString().slice(0, 10);
                if (changed > document.updated) {
                    issues.push(
                        issue(
                            "warning",
                            "doc-source-newer",
                            document,
                            `${repoPath} changed on ${changed}, after the document update ${document.updated}`,
                            { path: repoPath, changed, updated: document.updated }
                        )
                    );
                }
            }
        }
        const reviewBase = document.reviewed || document.updated;
        const interval = Number.isInteger(document.review_interval_days)
            ? document.review_interval_days
            : workspace.config.docs.reviewIntervalDays;
        const baseDay = reviewBase ? dayNumber(reviewBase) : null;
        const nowDay = now.getTime() / 86_400_000;
        if (interval > 0 && baseDay != null && nowDay - baseDay > interval) {
            issues.push(
                issue(
                    "warning",
                    "doc-review-overdue",
                    document,
                    `Document review is overdue by ${Math.floor(nowDay - baseDay - interval)} days`
                )
            );
        }
        if (document.updated) {
            for (const reference of document.related || []) {
                const related = knownRecords.get(reference);
                if (
                    related?.kind === "card" &&
                    related.status === "done" &&
                    related.updated &&
                    related.updated > document.updated
                ) {
                    issues.push(
                        issue(
                            "warning",
                            "doc-related-card-newer",
                            document,
                            `${reference} was completed after this document was updated`
                        )
                    );
                }
            }
        }
    }
    const counts = { error: 0, warning: 0, info: 0 };
    for (const item of issues) counts[item.severity] += 1;
    return {
        generatedAt: now.toISOString(),
        documents: documents.length,
        managed: documents.filter((document) => document.managed).length,
        indexed: documents.filter((document) => !document.managed).length,
        counts,
        ok: counts.error === 0,
        issues
    };
}
