#!/usr/bin/env node
/**
 * Moves the core towards `strict` without a flag day.
 *
 * Turning `strictNullChecks` on outright reported 402 errors, of which 24 were
 * real null hazards and the rest were bindings that started as `null` and
 * inferred that as their type. Annotating those away as `any` would have let
 * the flag be switched on while catching nothing — the migration looks done and
 * is not.
 *
 * So the flag is on in `tsconfig.strict.json`, every remaining error is written
 * down per file, and this refuses to let the numbers grow. A file not on the
 * list must stay clean; a file on it may only improve. Improving is *also* a
 * failure, resolved by re-recording the lower number — which is the point: the
 * baseline can only ratchet down.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const baselinePath = new URL("../strict-baseline.json", import.meta.url);

async function measure() {
    let output = "";
    try {
        await run("node", [
            "node_modules/typescript/bin/tsc",
            "-p",
            "tsconfig.strict.json"
        ], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    } catch (error) {
        // A non-zero exit is the expected case while the baseline is non-empty.
        output = `${error.stdout || ""}${error.stderr || ""}`;
    }
    const counts = {};
    for (const line of output.split("\n")) {
        const match = line.match(/^([^(]+\.ts)\(\d+,\d+\): error TS\d+/);
        if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
    }
    return counts;
}

const counts = await measure();
const update = process.argv.includes("--update");

if (update) {
    const sorted = Object.fromEntries(
        Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    );
    await writeFile(baselinePath, `${JSON.stringify(sorted, null, 4)}\n`);
    const total = Object.values(sorted).reduce((sum, n) => sum + n, 0);
    console.log(
        `strict baseline recorded: ${Object.keys(sorted).length} files, ${total} errors`
    );
    process.exit(0);
}

let baseline = {};
try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
    console.error(
        "strict-baseline.json is missing. Run `node scripts/strict-ratchet.mjs --update`."
    );
    process.exit(1);
}

const regressions = [];
const improvements = [];
for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
        regressions.push(
            allowed === 0
                ? `${file}: ${count} strict error${count === 1 ? "" : "s"} in a file that was clean`
                : `${file}: ${count} strict errors, baseline allows ${allowed}`
        );
    }
}
for (const [file, allowed] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (count < allowed) {
        improvements.push(`${file}: ${allowed} → ${count}`);
    }
}

const remaining = Object.values(counts).reduce((sum, n) => sum + n, 0);
const clean = Object.keys(baseline).length === 0;

if (regressions.length) {
    console.error("strictNullChecks regressed:\n");
    for (const entry of regressions) console.error(`  ${entry}`);
    console.error(
        "\nFix the null handling — do not annotate the binding `any` to silence it."
    );
    process.exit(1);
}

if (improvements.length) {
    console.error("strictNullChecks improved; re-record the baseline:\n");
    for (const entry of improvements) console.error(`  ${entry}`);
    console.error("\n  node scripts/strict-ratchet.mjs --update");
    process.exit(1);
}

console.log(
    clean
        ? "strictNullChecks clean across the core — the baseline can be deleted and the flag moved into tsconfig.json."
        : `strictNullChecks held: ${remaining} known errors across ${Object.keys(baseline).length} files, none new`
);
