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
 * The two scans are guarded differently, because they cost differently.
 *
 * The folder normaliser is a few milliseconds of work over its adversarial
 * input, so a wall-clock ceiling far above that is a fair test. T-0166 and
 * T-0179 are open scars about wall-clock budgets, and the margin is what keeps
 * this one off that list. Measured on this machine, over 64,000 separators:
 *
 * | scan   | fixed | in suite | unfixed | ceiling | headroom | detects |
 * |--------|-------|----------|---------|---------|----------|---------|
 * | folder |   3ms |      6ms |  2846ms |   500ms |      83× |    5.7× |
 *
 * The link scan is not. Its fix bounds each destination at 1024 characters and
 * each label at 512, which makes it linear with a large constant — about 65
 * million steps over the 192,000-character body this test used — so its time
 * measured the runner more than the code. Against a 2000ms ceiling one macOS
 * configuration took 2293ms, and then 788ms and 392ms on the same commit
 * (T-0258). So it is asserted by how it scales: the fastest of several runs
 * over N and 2N characters. A linear scan doubles and a quadratic one
 * quadruples, and a slow runner slows both sides of the ratio alike. The
 * fastest run, because a pause can only ever slow one down. Measured on this
 * machine on 2026-09-14:
 *
 * | scan               | N → 2N    | ratio |
 * |--------------------|-----------|-------|
 * | bounded, targets   | 32k → 64k | 2.08× |
 * | bounded, labels    | 32k → 64k | 2.01× |
 * | unbounded, targets |  8k → 16k | 3.98× |
 * | unbounded, labels  |  8k → 16k | 3.94× |
 *
 * The unbounded rows are a control the test runs beside the assertion, with the
 * spelling the fix replaced, so a machine whose timings cannot tell the two
 * apart fails there instead of passing the scan unexamined.
 */
const REPETITIONS = 64_000;
const FOLDER_CEILING_MS = 500;
/** Characters in the smaller body of each pair; the larger holds twice as many. */
const SCAN_BASE = 32_000;
const CONTROL_BASE = 8_000;
/** Between a linear scan's doubling and a quadratic scan's quadrupling. */
const LINEAR_RATIO_CEILING = 3;
const SCAN_RUNS = 5;
const CONTROL_RUNS = 3;

function elapsed(work: () => void): number {
    const started = process.hrtime.bigint();
    work();
    return Number(process.hrtime.bigint() - started) / 1e6;
}

/** The fastest of `runs` timings of `work`, which may be async. */
async function fastest(work: () => unknown, runs: number): Promise<number> {
    let best = Infinity;
    for (let run = 0; run < runs; run += 1) {
        const started = process.hrtime.bigint();
        await work();
        best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
    }
    return best;
}

/**
 * How much longer `scan` takes over a body twice as long: about 2× when it is
 * linear, about 4× when it is quadratic.
 *
 * Bodies are built to a common *length*, not a common count. `[` is one
 * character and `[](` is three, so counting repetitions fed the label shape a
 * body a third the size, which is how the first version of this file gave one
 * shape five times the margin of the other.
 */
async function doubling(
    scan: (body: string) => unknown,
    unit: string,
    base: number,
    runs: number
) {
    const bodyOf = (length: number) => unit.repeat(Math.round(length / unit.length));
    const small = bodyOf(base);
    const large = bodyOf(base * 2);
    // Warm the path first, so the smaller body does not also pay for the JIT.
    await scan(small);
    const smallMs = await fastest(() => scan(small), runs);
    const largeMs = await fastest(() => scan(large), runs);
    return { smallMs, largeMs, ratio: largeMs / smallMs };
}

/**
 * Both halves, because the first fix only bounded one.
 *
 * `[](` exercises the target: every `](` opens a target the scan looks for a
 * closing paren for, and there is never one. `[` exercises the label, which
 * has the identical shape one bracket earlier — and which the first version of
 * this fix left unbounded, so the analyser reported it again against the input
 * it had actually named. Fixing one half of a quadratic leaves a quadratic.
 */
const SHAPES = [
    ["unclosed targets", "[]("],
    ["unclosed labels", "["]
] as const;

/** The doctor's own path over one adversarial document. */
function diagnose(body: string) {
    return diagnoseDocuments({
        documents: [
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
        ],
        // Enough workspace for the rules that run before the link scan. The
        // filesystem stays out of the measurement on its own: not one of these
        // links closes, so the scan matches nothing and there is no path to check.
        workspace: {
            root: "/w",
            config: {
                docs: {
                    kinds: ["reference"],
                    statuses: ["draft"],
                    reviewIntervalDays: 90
                }
            }
        }
    });
}

/**
 * The spelling `core/markdown.ts` replaced: a label and a destination that each
 * run to the end of the body looking for a bracket or a paren that never comes.
 */
function unboundedScan(body: string) {
    let links = 0;
    for (const _ of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) links += 1;
    return links;
}

test("a document body of unclosed links does not stall the doctor", async (t) => {
    for (const [name, unit] of SHAPES) {
        // The control first: this machine's timings have to be able to see a
        // quadratic before a linear verdict from them means anything.
        const control = await doubling(unboundedScan, unit, CONTROL_BASE, CONTROL_RUNS);
        t.diagnostic(
            `unbounded ${name}: ${control.smallMs.toFixed(1)}ms → ${control.largeMs.toFixed(1)}ms, ${control.ratio.toFixed(2)}×`
        );
        assert.ok(
            control.ratio > LINEAR_RATIO_CEILING,
            `the unbounded ${name} scan grew only ${control.ratio.toFixed(2)}× over twice the body, so this machine cannot tell linear from quadratic`
        );

        const scan = await doubling(diagnose, unit, SCAN_BASE, SCAN_RUNS);
        t.diagnostic(
            `link scan, ${name}: ${scan.smallMs.toFixed(1)}ms → ${scan.largeMs.toFixed(1)}ms over ${SCAN_BASE} → ${SCAN_BASE * 2} chars, ${scan.ratio.toFixed(2)}×`
        );
        assert.ok(
            scan.ratio < LINEAR_RATIO_CEILING,
            `${name} took ${scan.ratio.toFixed(2)}× as long over twice the body, which is not linear`
        );
    }
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
