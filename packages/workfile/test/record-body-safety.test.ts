import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDocumentFolder } from "../dist/src/modules/docs/index.js";
import { MAX_LINK_TARGET, markdownLinks } from "../dist/src/core/markdown.js";
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
 * The link scan is not timed at all. Its fix bounds each label at 512
 * characters and each destination at `MAX_LINK_TARGET`, which makes it linear
 * with a large constant, and every clock put on that constant measured the
 * runner instead (T-0258). A 2000ms ceiling failed a macOS configuration at
 * 2293ms that passed the same commit at 392ms; a scaling ratio then failed CI
 * both ways, a bounded scan reaching 4.18× over twice the body under the
 * suite's parallel load while an unbounded one fell to 3.14×. So the bound is
 * asserted, and counted rather than timed: the destination scanner reads its
 * body through a proxy that tallies every character read by index, which is
 * the same number on every machine. The label half has no reads to count — its
 * bound lives in a regular expression — so that bound is pinned by what it
 * refuses to match. `docs/validation.ts` and the record index both read links
 * through the same `markdownLinks`, so the doctor's scan is this scan.
 */
const REPETITIONS = 64_000;
const FOLDER_CEILING_MS = 500;
/** Characters in the smaller body of the counted pair; the larger holds twice as many. */
const COUNT_BASE = 16_000;

function elapsed(work: () => void): number {
    const started = process.hrtime.bigint();
    work();
    return Number(process.hrtime.bigint() - started) / 1e6;
}

/**
 * A body that tallies how many of its characters are read by index.
 *
 * The destination scanner walks with `body[index]`, so a `String` object behind
 * a proxy sees each of those reads; the label pattern converts the body to a
 * primitive first and is not charged. Everything else passes straight through,
 * so the scan finds exactly the links it finds in a plain string.
 */
function countedBody(text: string) {
    const tally = { reads: 0 };
    const body = new Proxy(new String(text), {
        get(_target, property) {
            if (
                property === Symbol.toPrimitive ||
                property === "toString" ||
                property === "valueOf"
            ) {
                return () => text;
            }
            if (property === "length") return text.length;
            if (typeof property === "string" && /^\d+$/.test(property)) {
                tally.reads += 1;
                return text[Number(property)];
            }
            const value = (text as any)[property];
            return typeof value === "function" ? value.bind(text) : value;
        }
    }) as unknown as string;
    return { body, tally };
}

/**
 * Both halves, because the first fix only bounded one.
 *
 * `[](` exercises the destination: every `](` opens one the scan looks for a
 * closing paren for, and there is never one. `[` exercises the label, which has
 * the identical shape one bracket earlier — and which the first version of the
 * fix left unbounded, so the analyser reported it again against the input it
 * had actually named. Fixing one half of a quadratic leaves a quadratic.
 */
test("an unclosed destination costs the scan a bounded read per link, however long the body", () => {
    const measure = (length: number) => {
        const text = "[](".repeat(Math.round(length / 3));
        const { body, tally } = countedBody(text);
        const found = [...markdownLinks(body)].length;
        // What the label pattern matches is where the scanner starts reading.
        const opened = text.match(/\[[^\]\n]{0,512}\]\(/g)?.length ?? 0;
        return { found, opened, reads: tally.reads };
    };
    const small = measure(COUNT_BASE);
    const large = measure(COUNT_BASE * 2);
    assert.ok(small.reads > 0, "the tally cannot see the scanner's reads");
    assert.equal(small.found + large.found, 0, "not one of these links closes");
    for (const run of [small, large]) {
        // One read of the opening byte, then at most MAX_LINK_TARGET + 1 more.
        assert.ok(
            run.reads <= run.opened * (MAX_LINK_TARGET + 2),
            `${run.reads} reads for ${run.opened} opened destinations is past the bound`
        );
    }
    // Linear, and exactly so: an unbounded scan reads to the end of the body
    // from every `](`, which is about four times as much over twice the body.
    const ratio = large.reads / small.reads;
    assert.ok(ratio > 1.9 && ratio < 2.1, `reads grew ${ratio.toFixed(3)}× over twice the body`);
});

test("the scan reads no label past 512 characters and no destination past MAX_LINK_TARGET", () => {
    const targets = (text: string) => [...markdownLinks(text)].map((link) => link.target);
    // The bounds are what keep both halves linear, so removing either fails here.
    assert.deepEqual(targets(`[${"a".repeat(512)}](x.md)`), ["x.md"]);
    assert.deepEqual(targets(`[${"a".repeat(513)}](x.md)`), []);
    const longest = "b".repeat(MAX_LINK_TARGET);
    assert.deepEqual(targets(`[a](${longest})`), [longest]);
    assert.deepEqual(targets(`[a](${longest}b)`), []);
    // Neither half crosses a line, which bounds an unclosed `[` per line too.
    assert.deepEqual(targets("[a\nb](x.md)"), []);
    assert.deepEqual(targets("[a](x\n.md)"), []);
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
