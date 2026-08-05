import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseDocuments, normalizeDocumentFolder } from "../dist/src/modules/docs/index.js";
import { safeUrl } from "../ui/src/safe-url.ts";

/**
 * What a record body can do to whatever reads it.
 *
 * A body is written by whichever agent held the card, and three things read it
 * without asking where it came from: the doctor scans it for local links, the
 * document API normalises a folder out of it, and the UI renders it. The first
 * two were quadratic and the third handed its schemes to React ([[T-0162]]).
 *
 * The two budgets below are wall-clock, which T-0166 and T-0179 are both open
 * scars about — so the margin is the assertion, not the number, and the two
 * ceilings differ because the margins do. At 64,000 repetitions, measured on
 * this machine before and after:
 *
 * | scan   | fixed | in suite | unfixed | ceiling | headroom | detection |
 * |--------|-------|----------|---------|---------|----------|-----------|
 * | link   | 240ms |    444ms |  9663ms |  2000ms |     4.5× |      4.8× |
 * | folder |   3ms |     10ms |  2846ms |   500ms |      50× |      5.7× |
 *
 * "In suite" is the same measurement under the whole test run rather than
 * alone, and it is the column that matters: the link scan nearly doubles, so
 * the headroom a solo run would have claimed is not the headroom there is.
 *
 * A shared ceiling would have left the folder case 1.4× above the number it
 * has to exceed — one fast runner away from passing while quadratic. The
 * measured time is reported either way, so a run that passes narrowly says so.
 */
const REPETITIONS = 64_000;
const LINK_CEILING_MS = 2_000;
const FOLDER_CEILING_MS = 500;

function elapsed(work: () => void): number {
    const started = process.hrtime.bigint();
    work();
    return Number(process.hrtime.bigint() - started) / 1e6;
}

test("a document body of unclosed links does not stall the doctor", async (t) => {
    // `[](` repeated: every `](` opens a target the scan must look for a
    // closing paren for, and there is never one. Unbounded, that is one scan
    // to the end of the body per repetition.
    const body = "[](".repeat(REPETITIONS);
    const documents = [
        {
            id: "DOC-0001",
            path: ".project/docs/reference/DOC-0001-x.md",
            file: "DOC-0001-x.md",
            title: "Adversarial",
            kind: "reference",
            status: "draft",
            created: "2026-08-05",
            updated: "2026-08-05",
            body
        }
    ];
    // Enough workspace for the rules that run before the link scan. The
    // filesystem stays out of the measurement on its own: not one of these
    // links closes, so the scan matches nothing and there is no path to check.
    const workspace = {
        root: "/w",
        config: {
            docs: {
                kinds: ["reference"],
                statuses: ["draft"],
                reviewIntervalDays: 90
            }
        }
    };
    const started = process.hrtime.bigint();
    await diagnoseDocuments({ documents, workspace });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    t.diagnostic(`link scan: ${ms.toFixed(0)}ms for ${REPETITIONS} unclosed links`);
    assert.ok(ms < LINK_CEILING_MS, `the link scan took ${ms.toFixed(0)}ms`);
});

test("a folder of separators does not stall document creation", (t) => {
    // The value arrives from `doc create --folder` and from the HTTP body, so
    // it is neither validated nor bounded before it reaches the normalizer.
    const folder = "/".repeat(REPETITIONS) + "x";
    const ms = elapsed(() => {
        try {
            normalizeDocumentFolder(
                { paths: { docs: "/w/.project/docs" }, config: { docs: { managedPath: ".project/docs" } } },
                folder
            );
        } catch {
            // Refusing it is the correct answer. How long it takes to refuse
            // is what this measures.
        }
    });
    t.diagnostic(`folder normalisation: ${ms.toFixed(0)}ms for ${REPETITIONS} separators`);
    assert.ok(ms < FOLDER_CEILING_MS, `normalising took ${ms.toFixed(0)}ms`);
});

/**
 * The UI renders record bodies, so a link target in one reaches an `href`.
 *
 * React 19 blocks `javascript:` on its own, which is why this had never bitten
 * — and is exactly why the rule is ours now: a defence that lives in a
 * dependency's minor version is one you find out about by losing it.
 */
test("a record body cannot put a scheme of its choosing into a link", () => {
    for (const refused of [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "  javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "//evil.example.com/steal"
    ]) {
        assert.equal(safeUrl(refused), null, `${refused} must not reach an href`);
    }

    // The common case is a relative path, which carries no scheme at all, and
    // refusing those would break every link the protocol writes.
    for (const allowed of [
        "packages/workfile/docs/SPEC.md",
        "./sibling.md#heading",
        "../up.md",
        "#anchor",
        "https://example.com/x",
        "http://example.com/x",
        "mailto:someone@example.com"
    ]) {
        assert.equal(safeUrl(allowed), allowed.trim(), `${allowed} has to render`);
    }
});
