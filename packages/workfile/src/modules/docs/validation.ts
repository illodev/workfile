import { stripTrailingSlashes } from "../../core/glob.js";
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

/**
 * The link target is bounded, and that bound is the whole point.
 *
 * `([^)]+)` scanned to the end of the document on every `](` that had no
 * closing paren after it, so a body made of `[](` repeated cost one full scan
 * per repetition. Measured on this machine: 16.6ms at 2,000 repetitions,
 * 3.3s at 32,000 and **43.6s at 128,000** — quadratic, on a document body,
 * which the doctor reads for every document in the workspace. A record body is
 * repository text an agent writes, so the input is not hostile in the usual
 * sense; it is just text nobody thought to bound.
 *
 * Both halves are bounded, and the first attempt here bounded only the second
 * — which the analyser then reported again, correctly, against a different
 * input. `[` repeated is the label's version of the same shape: `[^\]]*` runs
 * to the end of the body looking for a `]` that never comes, once per `[`.
 * 837ms at 32,000 characters, where the whole scan is 59ms once the label is
 * capped too. Fixing one half of a quadratic leaves a quadratic.
 *
 * Every bound is true of a Markdown link independently of the performance
 * argument: neither half spans lines, a label is not a paragraph, and a target
 * is not longer than any path a filesystem will hold. The cost is that a link
 * past those sizes stops being checked. Nothing local can be that long — POSIX
 * caps a path at 4096 and a component at 255 — and the only targets that reach
 * it are `data:` URIs, which the scheme test below skips anyway.
 */
const LINK = /\[[^\]\n]{0,512}\]\(([^)\n]{1,1024})\)/g;

/**
 * Which offsets of a body are code, so a link shown as an example is not
 * followed as a link.
 *
 * The clearest case is a template. `_TEMPLATE.md` teaches the house link style
 * by printing `` `[texto](categoria/slug)` ``, and it was reported as linking
 * to a category that does not exist: the document doing exactly its job, called
 * broken. `parseAcceptance` has skipped fences since T-0157 for the same
 * reason; the link scan never did.
 *
 * A mask rather than a blanked copy, and this is the part worth being careful
 * about. Blanking first and matching after changes what matches: a real link
 * whose *label* is code — ``[`app/(private)/page.tsx`](…)`` — has brackets
 * inside that label, so the scanner never saw it, and erasing the backticks
 * revealed a link the target pattern then truncated at the first `)`. Two
 * managed documents turned red on links that are fine. Matching first and
 * discarding what falls inside code cannot invent a match that was not already
 * there; blanking can.
 */
export function codeMask(body: string): Uint8Array {
    const mask = new Uint8Array(body.length);
    const cover = (start: number, end: number) => mask.fill(1, start, end);

    let offset = 0;
    let fenceAt = -1;
    let fence = "";
    for (const line of body.split("\n")) {
        const opener = line.match(/^[ \t]*(```+|~~~+)/);
        if (fenceAt === -1) {
            if (opener) {
                fenceAt = offset;
                fence = opener[1];
            }
        } else if (opener && opener[1].startsWith(fence)) {
            cover(fenceAt, offset + line.length);
            fenceAt = -1;
        }
        offset += line.length + 1;
    }
    // A fence nobody closed runs to the end of the document, which is how a
    // Markdown renderer reads it too.
    if (fenceAt !== -1) cover(fenceAt, body.length);

    for (const span of body.matchAll(/`+[^`\n]*`+/g)) {
        if (!mask[span.index]) cover(span.index, span.index + span[0].length);
    }
    return mask;
}

/**
 * What a target might name, once the tree it lives in is taken into account.
 *
 * A path resolves against the file and is either there or not. A *route*
 * resolves against the site root and onto whichever file backs it, so
 * `guides/invoicing` is `guides/invoicing.md`, `guides/invoicing.mdx`, or an
 * `index` of either inside `guides/invoicing/`. The four suffixes are what
 * every generator in this family does; nothing here models redirects or
 * trailing slashes, and it should not — that is the site's business.
 *
 * The file-relative reading is always tried, and tried first. Declaring a tree
 * as routes widens what counts as resolvable inside it; it never narrows it,
 * so a link that was fine before a root was declared is still fine after.
 */
const ROUTE_SUFFIXES = ["", ".md", ".mdx", "/index.md", "/index.mdx"];

function candidatesFor(document, target: string, routeRoots: string[]): string[] {
    const fromFile = target.startsWith("/")
        ? target.slice(1)
        : posix.normalize(posix.join(posix.dirname(document.path), target));
    const root = routeRoots.find(
        (entry) => document.path === entry || document.path.startsWith(`${entry}/`)
    );
    if (root === undefined) return [fromFile];

    // An explicit `/` is site-absolute inside a route tree, which is the one
    // spelling that does not go through the file's directory at all.
    const fromRoot = posix.normalize(
        posix.join(root, target.startsWith("/") ? target.slice(1) : target)
    );
    return [
        ...new Set([
            ...ROUTE_SUFFIXES.map((suffix) => `${fromFile}${suffix}`),
            ...ROUTE_SUFFIXES.map((suffix) => `${fromRoot}${suffix}`)
        ])
    ];
}

/**
 * Every local link in a body, with what each one could resolve to.
 *
 * A link is broken only when none of its candidates exist, so the caller has to
 * see them grouped rather than flattened.
 */
function localMarkdownLinks(document, routeRoots: string[]) {
    const body = String(document.body || "");
    const links = new Map<string, string[]>();
    const code = codeMask(body);
    for (const match of body.matchAll(LINK)) {
        if (code[match.index]) continue;
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
        if (!target || links.has(target)) continue;
        links.set(target, candidatesFor(document, target, routeRoots));
    }
    return [...links].map(([target, candidates]) => ({ target, candidates }));
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
    // Trailing separators stripped once here rather than at every comparison: a
    // root written `docs/help/` must behave as `docs/help`, and the prefix test
    // below is a string test.
    const routeRoots = (workspace.config.docs.routeRoots || [])
        .map((entry) => stripTrailingSlashes(String(entry).replace(/^\.\//, "")))
        .filter(Boolean);
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
        for (const link of localMarkdownLinks(document, routeRoots)) {
            let resolved = false;
            for (const candidate of link.candidates) {
                if (await pathExistsWithinWorkspace(workspace, candidate)) {
                    resolved = true;
                    break;
                }
            }
            if (!resolved) {
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
                        // The target as written. It used to be the resolved
                        // path, which in a route tree is the doubled one
                        // (`clientes/clientes/…`) — the shape that made the
                        // finding unreadable rather than the one that explains
                        // it. What was tried goes in the details.
                        `Linked path does not exist: ${link.target}`,
                        { path: link.candidates[0], target: link.target, tried: link.candidates }
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
